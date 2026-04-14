import * as SQLite from 'expo-sqlite';

const DB_SCHEMA_VERSION = 4;

interface SensorData {
  timestamp: number;
  device_id: string;
  pig_id: string;
  temp: number;
  activity_intensity: number;
  activity_state?: string;
  pitch_angle: number;
  accel_x?: number | null;
  accel_y?: number | null;
  accel_z?: number | null;
  gyro_x?: number | null;
  gyro_y?: number | null;
  gyro_z?: number | null;
  feeding_posture_detected: number;
  env_temp: number;
  humidity: number;
  thi?: number | null;
  fever_flag?: number;
  lethargy_flag?: number;
  heat_stress_flag?: number;
  severe_heat_flag?: number;
  within_feeding_window?: number;
  true_eating_event?: number;
  raw_risk_label?: string;
}

interface HourlyAggregate {
  date: string;
  hour: number;
  pig_id: string;
  mean_temp: number;
  mean_env_temp: number;
  mean_humidity: number;
  mean_activity: number;
  mean_pitch: number;
  sample_count?: number;
  thi?: number;
  lethargy_alert?: number;
  dominant_activity_state?: string;
  max_temp?: number;
  max_thi?: number;
  fever_event_count?: number;
  heat_stress_event_count?: number;
  severe_heat_event_count?: number;
  true_eating_event_count?: number;
  resting_ratio?: number;
  standing_ratio?: number;
  distress_ratio?: number;
  feeding_schedule_adherence?: number;
  high_risk_hour_flag?: number;
}

type TrendPeriod = '30m' | '1h' | '4h' | '12h';

interface PeriodAggregate {
  period_type: TrendPeriod;
  bucket_start: number;
  bucket_end: number;
  pig_id: string;
  mean_temp: number;
  mean_env_temp: number;
  mean_humidity: number;
  mean_activity: number;
  mean_pitch: number;
  thi?: number;
  lethargy_alert?: number;
  dominant_activity_state?: string;
  sample_count: number;
  max_temp?: number;
  max_thi?: number;
  fever_event_count?: number;
  heat_stress_event_count?: number;
  severe_heat_event_count?: number;
  true_eating_event_count?: number;
  resting_ratio?: number;
  standing_ratio?: number;
  distress_ratio?: number;
}

interface FeedingSchedule {
  pig_id: string;
  feedings_per_day: number;
  feeding_times: string;
  feeding_window_before_minutes: number;
  feeding_window_after_minutes: number;
}

interface HourlyInsight {
  pig_id: string;
  bucket_start: number;
  bucket_end: number;
  bucket_date: string;
  bucket_hour: number;
  severity: 'normal' | 'warning' | 'critical';
  summary: string;
  confidence?: number | null;
  insight_json: string;
  source_hash: string;
  source_hourly_aggregate_id?: number | null;
  schema_version: string;
  prompt_version: string;
  model_version: string;
  status: 'success' | 'failed';
  rule_case?: string | null;
  rule_severity?: 'normal' | 'warning' | 'critical' | null;
  rule_reasoning_json?: string | null;
  error_code?: string | null;
  error_message?: string | null;
}

interface DailyAssessment {
  pig_id: string;
  bucket_day: string;
  day_start: number;
  day_end: number;
  overall_status: 'normal' | 'watch' | 'critical';
  summary: string;
  assessment_json: string;
  source_hourly_count: number;
  source_hash: string;
  schema_version: string;
  prompt_version: string;
  model_version: string;
  status: 'success' | 'failed';
  error_code?: string | null;
  error_message?: string | null;
}

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized: boolean = false;
  private isInitializing: boolean = false;
  private initPromise: Promise<void> | null = null;
  private dataQueue: Array<() => Promise<void>> = [];

  private async getUserVersion(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    const row = await this.db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    return Number(row?.user_version ?? 0);
  }

  private async setUserVersion(version: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.execAsync(`PRAGMA user_version = ${Math.max(0, Math.floor(version))}`);
  }

  private async getTableColumnNames(tableName: string): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');
    const rows = await this.db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
    return rows.map((r) => String(r.name));
  }

  private async migrateLegacySensorDataSchemaIfNeeded(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const columns = await this.getTableColumnNames('sensor_data');
    if (columns.length === 0) return;

    const hasLegacyHr = columns.includes('hr');
    const hasActivityState = columns.includes('activity_state');

    if (!hasLegacyHr && hasActivityState) {
      return;
    }

    if (hasLegacyHr) {
      console.log('🔧 Migrating legacy sensor_data schema: removing hr column while preserving rows...');
      try {
        await this.db.execAsync('BEGIN IMMEDIATE TRANSACTION;');
        await this.db.execAsync(`
          CREATE TABLE IF NOT EXISTS sensor_data_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            device_id TEXT NOT NULL,
            pig_id TEXT NOT NULL,
            temp REAL NOT NULL,
            activity_intensity REAL NOT NULL,
            activity_state TEXT DEFAULT 'Resting',
            pitch_angle REAL NOT NULL,
            feeding_posture_detected INTEGER DEFAULT 0,
            env_temp REAL NOT NULL,
            humidity REAL NOT NULL,
            thi REAL,
            fever_flag INTEGER DEFAULT 0,
            lethargy_flag INTEGER DEFAULT 0,
            heat_stress_flag INTEGER DEFAULT 0,
            severe_heat_flag INTEGER DEFAULT 0,
            within_feeding_window INTEGER DEFAULT 0,
            true_eating_event INTEGER DEFAULT 0,
            raw_risk_label TEXT DEFAULT 'normal',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await this.db.execAsync(`
          INSERT INTO sensor_data_new
            (id, timestamp, device_id, pig_id, temp, activity_intensity, activity_state, pitch_angle, feeding_posture_detected, env_temp, humidity, created_at)
          SELECT
            id,
            timestamp,
            device_id,
            pig_id,
            temp,
            activity_intensity,
            CASE
              WHEN activity_state IS NULL OR TRIM(activity_state) = '' THEN 'Resting'
              ELSE activity_state
            END AS activity_state,
            pitch_angle,
            CASE WHEN COALESCE(feed, 0) > 0 THEN 1 ELSE 0 END AS feeding_posture_detected,
            env_temp,
            humidity,
            created_at
          FROM sensor_data;
        `);
        await this.db.execAsync('DROP TABLE sensor_data;');
        await this.db.execAsync('ALTER TABLE sensor_data_new RENAME TO sensor_data;');
        await this.db.execAsync('COMMIT;');
        console.log('✅ Legacy sensor_data migration complete');
      } catch (error) {
        await this.db.execAsync('ROLLBACK;');
        throw error;
      }
      return;
    }

    if (!hasActivityState) {
      try {
        await this.db.execAsync(`ALTER TABLE sensor_data ADD COLUMN activity_state TEXT DEFAULT 'Resting'`);
        console.log('✅ Added activity_state column to sensor_data');
      } catch {
        // no-op
      }
    }
  }

  private async validateSensorDataSchema(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const requiredColumns = [
      'timestamp',
      'device_id',
      'pig_id',
      'temp',
      'activity_intensity',
      'activity_state',
      'pitch_angle',
      'feeding_posture_detected',
      'env_temp',
      'humidity',
    ];
    const columns = await this.getTableColumnNames('sensor_data');
    const missing = requiredColumns.filter((col) => !columns.includes(col));

    if (missing.length > 0) {
      throw new Error(`sensor_data schema invalid: missing required columns [${missing.join(', ')}]`);
    }
  }

  /**
   * Initialize and open the database (with one-time guarantee)
   */
  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) {
      console.log('📦 Database already initialized');
      return;
    }

    // If currently initializing, wait for that promise
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    // Mark as initializing and set the promise
    this.isInitializing = true;
    this.initPromise = this._performInitialization();

    try {
      await this.initPromise;
      this.isInitialized = true;
      console.log('📦 Database initialized successfully');
      
      // Process any queued operations
      await this._processQueue();
    } catch (error) {
      console.error('❌ Error initializing database:', error);
      this.isInitializing = false;
      this.initPromise = null;
      throw error;
    }
  }

  /**
   * Perform the actual initialization
   */
  private async _performInitialization(): Promise<void> {
    try {
      this.db = await SQLite.openDatabaseAsync('pigfit_data.db');
      await this.createTables();
    } catch (error) {
      console.error('❌ Error in database initialization:', error);
      throw error;
    }
  }

  /**
   * Ensure database is ready before operations
   */
  private async _ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;

    if (!this.isInitialized && !this.isInitializing) {
      await this.initialize();
    } else if (this.isInitializing && this.initPromise) {
      await this.initPromise;
    }

    if (!this.isInitialized) {
      throw new Error('Database failed to initialize');
    }
  }

  /**
   * Process queued data operations
   */
  private async _processQueue(): Promise<void> {
    while (this.dataQueue.length > 0) {
      const operation = this.dataQueue.shift();
      if (operation) {
        try {
          await operation();
        } catch (error) {
          console.error('❌ Error processing queued operation:', error);
        }
      }
    }
  }

  /**
   * Create all necessary tables
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Combined Sensor Data Table (All data in one place)
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS sensor_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          device_id TEXT NOT NULL,
          pig_id TEXT NOT NULL,
          temp REAL NOT NULL,
          activity_intensity REAL NOT NULL,
          activity_state TEXT DEFAULT 'Resting/Lethargy',
          pitch_angle REAL NOT NULL,
          accel_x REAL,
          accel_y REAL,
          accel_z REAL,
          gyro_x REAL,
          gyro_y REAL,
          gyro_z REAL,
          feeding_posture_detected INTEGER DEFAULT 0,
          env_temp REAL NOT NULL,
          humidity REAL NOT NULL,
          thi REAL,
          fever_flag INTEGER DEFAULT 0,
          lethargy_flag INTEGER DEFAULT 0,
          heat_stress_flag INTEGER DEFAULT 0,
          severe_heat_flag INTEGER DEFAULT 0,
          within_feeding_window INTEGER DEFAULT 0,
          true_eating_event INTEGER DEFAULT 0,
          raw_risk_label TEXT DEFAULT 'normal',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Hourly Aggregates Table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS hourly_aggregates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          hour INTEGER NOT NULL,
          pig_id TEXT NOT NULL,
          mean_temp REAL,
          mean_env_temp REAL,
          mean_humidity REAL,
          mean_activity REAL,
          mean_pitch REAL,
          max_temp REAL,
          max_thi REAL,
          fever_event_count INTEGER DEFAULT 0,
          heat_stress_event_count INTEGER DEFAULT 0,
          severe_heat_event_count INTEGER DEFAULT 0,
          true_eating_event_count INTEGER DEFAULT 0,
          resting_ratio REAL DEFAULT 0,
          standing_ratio REAL DEFAULT 0,
          distress_ratio REAL DEFAULT 0,
          feeding_schedule_adherence REAL DEFAULT 0,
          high_risk_hour_flag INTEGER DEFAULT 0,
          thi REAL,
          lethargy_alert INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(date, hour, pig_id)
        );
      `);

      // Period Aggregates Table — pre-bucketed data for 30m / 1h / 4h / 12h views
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS period_aggregates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          period_type TEXT NOT NULL,
          bucket_start INTEGER NOT NULL,
          bucket_end   INTEGER NOT NULL,
          pig_id TEXT NOT NULL,
          mean_temp REAL,
          mean_env_temp REAL,
          mean_humidity REAL,
          mean_activity REAL,
          mean_pitch REAL,
          max_temp REAL,
          max_thi REAL,
          fever_event_count INTEGER DEFAULT 0,
          heat_stress_event_count INTEGER DEFAULT 0,
          severe_heat_event_count INTEGER DEFAULT 0,
          true_eating_event_count INTEGER DEFAULT 0,
          resting_ratio REAL DEFAULT 0,
          standing_ratio REAL DEFAULT 0,
          distress_ratio REAL DEFAULT 0,
          thi REAL,
          lethargy_alert INTEGER DEFAULT 0,
          dominant_activity_state TEXT DEFAULT 'Resting',
          sample_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(period_type, bucket_start, pig_id)
        );
      `);

      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS feeding_schedules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pig_id TEXT NOT NULL UNIQUE,
          feedings_per_day INTEGER NOT NULL DEFAULT 2,
          feeding_times TEXT NOT NULL,
          feeding_window_before_minutes INTEGER NOT NULL DEFAULT 20,
          feeding_window_after_minutes INTEGER NOT NULL DEFAULT 45,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Devices Table — store device metadata
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS devices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id TEXT UNIQUE NOT NULL,
          device_mac TEXT NOT NULL,
          device_name TEXT NOT NULL,
          pairing_date INTEGER NOT NULL,
          last_connected INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Deterministic Hourly Insights Table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS hourly_insights (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pig_id TEXT NOT NULL,
          bucket_start INTEGER NOT NULL,
          bucket_end INTEGER NOT NULL,
          bucket_date TEXT NOT NULL,
          bucket_hour INTEGER NOT NULL,
          severity TEXT NOT NULL,
          summary TEXT NOT NULL,
          confidence REAL,
          insight_json TEXT NOT NULL,
          source_hash TEXT NOT NULL,
          source_hourly_aggregate_id INTEGER,
          schema_version TEXT NOT NULL,
          prompt_version TEXT NOT NULL,
          model_version TEXT NOT NULL,
          status TEXT NOT NULL,
          rule_case TEXT,
          rule_severity TEXT,
          rule_reasoning_json TEXT,
          error_code TEXT,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(pig_id, bucket_start, prompt_version)
        );
      `);

      // Deterministic Daily Assessments Table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS daily_assessments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pig_id TEXT NOT NULL,
          bucket_day TEXT NOT NULL,
          day_start INTEGER NOT NULL,
          day_end INTEGER NOT NULL,
          overall_status TEXT NOT NULL,
          summary TEXT NOT NULL,
          assessment_json TEXT NOT NULL,
          source_hourly_count INTEGER NOT NULL,
          source_hash TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          prompt_version TEXT NOT NULL,
          model_version TEXT NOT NULL,
          status TEXT NOT NULL,
          error_code TEXT,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(pig_id, bucket_day, prompt_version)
        );
      `);

      // Run legacy migration path before indexes and post-migration validation.
      await this.migrateLegacySensorDataSchemaIfNeeded();
      await this.validateSensorDataSchema();

      // Create indexes for better query performance
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_sensor_timestamp ON sensor_data(timestamp);
        CREATE INDEX IF NOT EXISTS idx_sensor_pig_id ON sensor_data(pig_id);
        CREATE INDEX IF NOT EXISTS idx_hourly_date ON hourly_aggregates(date, hour);
        CREATE INDEX IF NOT EXISTS idx_period_pig ON period_aggregates(pig_id, period_type, bucket_start);
        CREATE INDEX IF NOT EXISTS idx_feeding_schedule_pig ON feeding_schedules(pig_id);
        CREATE INDEX IF NOT EXISTS idx_device_id ON devices(device_id);
        CREATE INDEX IF NOT EXISTS idx_hourly_insights_pig_bucket ON hourly_insights(pig_id, bucket_start);
        CREATE INDEX IF NOT EXISTS idx_hourly_insights_day ON hourly_insights(pig_id, bucket_date);
        CREATE INDEX IF NOT EXISTS idx_daily_assessments_pig_day ON daily_assessments(pig_id, bucket_day);
      `);

      const currentVersion = await this.getUserVersion();
      if (currentVersion < DB_SCHEMA_VERSION) {
        await this.setUserVersion(DB_SCHEMA_VERSION);
      }

      // Migrate existing tables: add new columns if they don't exist yet
      // SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we use try/catch
      try {
        await this.db.execAsync(`ALTER TABLE hourly_aggregates ADD COLUMN dominant_activity_state TEXT DEFAULT 'Resting'`);
        console.log('✅ Added dominant_activity_state column to hourly_aggregates');
      } catch { /* column already exists */ }

      try {
        await this.db.execAsync(`ALTER TABLE hourly_aggregates ADD COLUMN sample_count INTEGER DEFAULT 0`);
        console.log('✅ Added sample_count column to hourly_aggregates');
      } catch { /* column already exists */ }

      try { await this.db.execAsync(`ALTER TABLE sensor_data ADD COLUMN feeding_posture_detected INTEGER DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE sensor_data ADD COLUMN thi REAL`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE sensor_data ADD COLUMN fever_flag INTEGER DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE sensor_data ADD COLUMN lethargy_flag INTEGER DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE sensor_data ADD COLUMN heat_stress_flag INTEGER DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE sensor_data ADD COLUMN severe_heat_flag INTEGER DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE sensor_data ADD COLUMN within_feeding_window INTEGER DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE sensor_data ADD COLUMN true_eating_event INTEGER DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE sensor_data ADD COLUMN raw_risk_label TEXT DEFAULT 'normal'`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE sensor_data ADD COLUMN accel_x REAL`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE sensor_data ADD COLUMN accel_y REAL`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE sensor_data ADD COLUMN accel_z REAL`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE sensor_data ADD COLUMN gyro_x REAL`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE sensor_data ADD COLUMN gyro_y REAL`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE sensor_data ADD COLUMN gyro_z REAL`); } catch {}

      try { await this.db.execAsync(`ALTER TABLE hourly_aggregates ADD COLUMN max_temp REAL`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE hourly_aggregates ADD COLUMN max_thi REAL`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE hourly_aggregates ADD COLUMN fever_event_count INTEGER DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE hourly_aggregates ADD COLUMN heat_stress_event_count INTEGER DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE hourly_aggregates ADD COLUMN severe_heat_event_count INTEGER DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE hourly_aggregates ADD COLUMN true_eating_event_count INTEGER DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE hourly_aggregates ADD COLUMN resting_ratio REAL DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE hourly_aggregates ADD COLUMN standing_ratio REAL DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE hourly_aggregates ADD COLUMN distress_ratio REAL DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE hourly_aggregates ADD COLUMN feeding_schedule_adherence REAL DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE hourly_aggregates ADD COLUMN high_risk_hour_flag INTEGER DEFAULT 0`); } catch {}

      try { await this.db.execAsync(`ALTER TABLE period_aggregates ADD COLUMN max_temp REAL`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE period_aggregates ADD COLUMN max_thi REAL`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE period_aggregates ADD COLUMN fever_event_count INTEGER DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE period_aggregates ADD COLUMN heat_stress_event_count INTEGER DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE period_aggregates ADD COLUMN severe_heat_event_count INTEGER DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE period_aggregates ADD COLUMN true_eating_event_count INTEGER DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE period_aggregates ADD COLUMN resting_ratio REAL DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE period_aggregates ADD COLUMN standing_ratio REAL DEFAULT 0`); } catch {}
      try { await this.db.execAsync(`ALTER TABLE period_aggregates ADD COLUMN distress_ratio REAL DEFAULT 0`); } catch {}

      try {
        await this.db.execAsync(`ALTER TABLE hourly_insights ADD COLUMN rule_case TEXT`);
        console.log('✅ Added rule_case column to hourly_insights');
      } catch { /* column already exists */ }

      try {
        await this.db.execAsync(`ALTER TABLE hourly_insights ADD COLUMN rule_severity TEXT`);
        console.log('✅ Added rule_severity column to hourly_insights');
      } catch { /* column already exists */ }

      try {
        await this.db.execAsync(`ALTER TABLE hourly_insights ADD COLUMN rule_reasoning_json TEXT`);
        console.log('✅ Added rule_reasoning_json column to hourly_insights');
      } catch { /* column already exists */ }

      console.log('✅ All tables created successfully');
    } catch (error) {
      console.error('❌ Error creating tables:', error);
      throw error;
    }
  }

  /**
   * Upsert a period aggregate bucket (30m / 1h / 4h / 12h)
   */
  async upsertPeriodAggregate(data: PeriodAggregate): Promise<void> {
    try {
      await this._ensureInitialized();
      if (!this.db) throw new Error('Database connection is null');

      await this.db.runAsync(
        `INSERT INTO period_aggregates
         (period_type, bucket_start, bucket_end, pig_id,
          mean_temp, mean_env_temp, mean_humidity,
          mean_activity, mean_pitch,
          thi, lethargy_alert, dominant_activity_state, sample_count,
          max_temp, max_thi, fever_event_count, heat_stress_event_count,
          severe_heat_event_count, true_eating_event_count,
          resting_ratio, standing_ratio, distress_ratio)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(period_type, bucket_start, pig_id) DO UPDATE SET
           bucket_end              = excluded.bucket_end,
           mean_temp               = excluded.mean_temp,
           mean_env_temp           = excluded.mean_env_temp,
           mean_humidity           = excluded.mean_humidity,
           mean_activity           = excluded.mean_activity,
           mean_pitch              = excluded.mean_pitch,
           thi                     = excluded.thi,
           lethargy_alert          = excluded.lethargy_alert,
           dominant_activity_state = excluded.dominant_activity_state,
           sample_count            = excluded.sample_count,
           max_temp                = excluded.max_temp,
           max_thi                 = excluded.max_thi,
           fever_event_count       = excluded.fever_event_count,
           heat_stress_event_count = excluded.heat_stress_event_count,
           severe_heat_event_count = excluded.severe_heat_event_count,
           true_eating_event_count = excluded.true_eating_event_count,
           resting_ratio           = excluded.resting_ratio,
           standing_ratio          = excluded.standing_ratio,
           distress_ratio          = excluded.distress_ratio`,
        [
          data.period_type,
          data.bucket_start,
          data.bucket_end,
          data.pig_id,
          data.mean_temp,
          data.mean_env_temp,
          data.mean_humidity,
          data.mean_activity,
          data.mean_pitch,
          data.thi ?? null,
          data.lethargy_alert ?? 0,
          data.dominant_activity_state ?? 'Resting',
          data.sample_count,
          data.max_temp ?? null,
          data.max_thi ?? null,
          data.fever_event_count ?? 0,
          data.heat_stress_event_count ?? 0,
          data.severe_heat_event_count ?? 0,
          data.true_eating_event_count ?? 0,
          data.resting_ratio ?? 0,
          data.standing_ratio ?? 0,
          data.distress_ratio ?? 0,
        ]
      );
    } catch (error) {
      console.error('❌ Error upserting period aggregate:', error);
      this.dataQueue.push(() => this.upsertPeriodAggregate(data));
    }
  }

  /**
   * Get all period aggregate buckets for a given timeframe and pig
   * Returns buckets ordered oldest → newest (for charting left-to-right)
   */
  async getPeriodAggregates(periodType: TrendPeriod, pigId: string): Promise<any[]> {
    try {
      await this._ensureInitialized();
      if (!this.db) return [];

      const result = await this.db.getAllAsync(
        `SELECT * FROM period_aggregates
         WHERE period_type = ? AND pig_id = ?
         ORDER BY bucket_start ASC`,
        [periodType, pigId]
      );
      return result;
    } catch (error) {
      console.error('❌ Error getting period aggregates:', error);
      return [];
    }
  }

  /**
   * Insert sensor data (all fields in one record)
   */
  async insertSensorData(data: SensorData): Promise<void> {
    try {
      // Ensure database is initialized
      await this._ensureInitialized();

      if (!this.db) {
        throw new Error('Database connection is null');
      }

      await this.db.runAsync(
        `INSERT INTO sensor_data 
         (timestamp, device_id, pig_id, temp, activity_intensity, activity_state, pitch_angle, accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z, feeding_posture_detected, env_temp, humidity, thi, fever_flag, lethargy_flag, heat_stress_flag, severe_heat_flag, within_feeding_window, true_eating_event, raw_risk_label) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.timestamp,
          data.device_id,
          data.pig_id,
          data.temp,
          data.activity_intensity,
          data.activity_state ?? 'Resting/Lethargy',
          data.pitch_angle,
          data.accel_x ?? null,
          data.accel_y ?? null,
          data.accel_z ?? null,
          data.gyro_x ?? null,
          data.gyro_y ?? null,
          data.gyro_z ?? null,
          data.feeding_posture_detected,
          data.env_temp,
          data.humidity,
          data.thi ?? null,
          data.fever_flag ?? 0,
          data.lethargy_flag ?? 0,
          data.heat_stress_flag ?? 0,
          data.severe_heat_flag ?? 0,
          data.within_feeding_window ?? 0,
          data.true_eating_event ?? 0,
          data.raw_risk_label ?? 'normal',
        ]
      );
      console.log('✅ Sensor data inserted');
    } catch (error) {
      console.error('❌ Error inserting sensor data:', error);
      // Don't throw - allow app to continue, but queue for retry
      this.dataQueue.push(() => this.insertSensorData(data));
    }
  }

  /**
   * Insert or update hourly aggregates
   */
  async upsertHourlyAggregate(data: HourlyAggregate): Promise<void> {
    try {
      // Ensure database is initialized
      await this._ensureInitialized();

      if (!this.db) {
        throw new Error('Database connection is null');
      }

      await this.db.runAsync(
        `INSERT INTO hourly_aggregates 
         (date, hour, pig_id, mean_temp, mean_env_temp, mean_humidity, mean_activity, mean_pitch, sample_count, thi, lethargy_alert, dominant_activity_state, max_temp, max_thi, fever_event_count, heat_stress_event_count, severe_heat_event_count, true_eating_event_count, resting_ratio, standing_ratio, distress_ratio, feeding_schedule_adherence, high_risk_hour_flag)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(date, hour, pig_id) DO UPDATE SET
           mean_temp = excluded.mean_temp,
           mean_env_temp = excluded.mean_env_temp,
           mean_humidity = excluded.mean_humidity,
           mean_activity = excluded.mean_activity,
            mean_pitch = excluded.mean_pitch,
           sample_count = excluded.sample_count,
           thi = excluded.thi,
           lethargy_alert = excluded.lethargy_alert,
           dominant_activity_state = excluded.dominant_activity_state,
           max_temp = excluded.max_temp,
           max_thi = excluded.max_thi,
           fever_event_count = excluded.fever_event_count,
           heat_stress_event_count = excluded.heat_stress_event_count,
           severe_heat_event_count = excluded.severe_heat_event_count,
           true_eating_event_count = excluded.true_eating_event_count,
           resting_ratio = excluded.resting_ratio,
           standing_ratio = excluded.standing_ratio,
           distress_ratio = excluded.distress_ratio,
           feeding_schedule_adherence = excluded.feeding_schedule_adherence,
           high_risk_hour_flag = excluded.high_risk_hour_flag`,
        [
          data.date,
          data.hour,
          data.pig_id,
          data.mean_temp,
          data.mean_env_temp,
          data.mean_humidity,
          data.mean_activity,
          data.mean_pitch,
          data.sample_count ?? 0,
          data.thi || null,
          data.lethargy_alert || 0,
          data.dominant_activity_state ?? 'Resting',
          data.max_temp ?? null,
          data.max_thi ?? null,
          data.fever_event_count ?? 0,
          data.heat_stress_event_count ?? 0,
          data.severe_heat_event_count ?? 0,
          data.true_eating_event_count ?? 0,
          data.resting_ratio ?? 0,
          data.standing_ratio ?? 0,
          data.distress_ratio ?? 0,
          data.feeding_schedule_adherence ?? 0,
          data.high_risk_hour_flag ?? 0,
        ]
      );
      console.log('✅ Hourly aggregate upserted');
    } catch (error) {
      console.error('❌ Error upserting hourly aggregate:', error);
      // Queue for retry instead of throwing
      this.dataQueue.push(() => this.upsertHourlyAggregate(data));
    }
  }

  /**
   * Get sensor data for a time range
   */
  async getSensorData(startTime: number, endTime: number, pigId?: string): Promise<any[]> {
    try {
      await this._ensureInitialized();

      if (!this.db) {
        return [];
      }

      const query = pigId
        ? `SELECT * FROM sensor_data WHERE timestamp BETWEEN ? AND ? AND pig_id = ? ORDER BY timestamp ASC`
        : `SELECT * FROM sensor_data WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC`;

      const params = pigId ? [startTime, endTime, pigId] : [startTime, endTime];
      
      const result = await this.db.getAllAsync(query, params);
      return result;
    } catch (error) {
      console.error('❌ Error getting sensor data:', error);
      return [];
    }
  }

  /**
   * Get hourly aggregates for a date range
   */
  async getHourlyAggregates(startDate: string, endDate: string, pigId?: string): Promise<any[]> {
    try {
      await this._ensureInitialized();

      if (!this.db) {
        return [];
      }

      const query = pigId
        ? `SELECT * FROM hourly_aggregates WHERE date BETWEEN ? AND ? AND pig_id = ? ORDER BY date, hour ASC`
        : `SELECT * FROM hourly_aggregates WHERE date BETWEEN ? AND ? ORDER BY date, hour ASC`;

      const params = pigId ? [startDate, endDate, pigId] : [startDate, endDate];
      
      const result = await this.db.getAllAsync(query, params);
      return result;
    } catch (error) {
      console.error('❌ Error getting hourly aggregates:', error);
      return [];
    }
  }

  /**
   * Insert or update deterministic hourly insight
   */
  async upsertHourlyInsight(data: HourlyInsight): Promise<void> {
    try {
      await this._ensureInitialized();
      if (!this.db) throw new Error('Database connection is null');

      await this.db.runAsync(
        `INSERT INTO hourly_insights
         (pig_id, bucket_start, bucket_end, bucket_date, bucket_hour,
          severity, summary, confidence, insight_json,
          source_hash, source_hourly_aggregate_id,
          schema_version, prompt_version, model_version, status,
          rule_case, rule_severity, rule_reasoning_json,
          error_code, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(pig_id, bucket_start, prompt_version) DO UPDATE SET
           bucket_end = excluded.bucket_end,
           bucket_date = excluded.bucket_date,
           bucket_hour = excluded.bucket_hour,
           severity = excluded.severity,
           summary = excluded.summary,
           confidence = excluded.confidence,
           insight_json = excluded.insight_json,
           source_hash = excluded.source_hash,
           source_hourly_aggregate_id = excluded.source_hourly_aggregate_id,
           schema_version = excluded.schema_version,
           model_version = excluded.model_version,
           status = excluded.status,
           rule_case = excluded.rule_case,
           rule_severity = excluded.rule_severity,
           rule_reasoning_json = excluded.rule_reasoning_json,
           error_code = excluded.error_code,
           error_message = excluded.error_message,
           updated_at = CURRENT_TIMESTAMP`,
        [
          data.pig_id,
          data.bucket_start,
          data.bucket_end,
          data.bucket_date,
          data.bucket_hour,
          data.severity,
          data.summary,
          data.confidence ?? null,
          data.insight_json,
          data.source_hash,
          data.source_hourly_aggregate_id ?? null,
          data.schema_version,
          data.prompt_version,
          data.model_version,
          data.status,
          data.rule_case ?? null,
          data.rule_severity ?? null,
          data.rule_reasoning_json ?? null,
          data.error_code ?? null,
          data.error_message ?? null,
        ]
      );
    } catch (error) {
      console.error('❌ Error upserting hourly insight:', error);
      this.dataQueue.push(() => this.upsertHourlyInsight(data));
    }
  }

  /**
   * Get hourly insights for a pig and date
   */
  async getHourlyInsightsByDate(pigId: string, bucketDate: string): Promise<any[]> {
    try {
      await this._ensureInitialized();
      if (!this.db) return [];

      const result = await this.db.getAllAsync(
        `SELECT * FROM hourly_insights
         WHERE pig_id = ? AND bucket_date = ?
         ORDER BY bucket_start ASC`,
        [pigId, bucketDate]
      );
      return result;
    } catch (error) {
      console.error('❌ Error getting hourly insights:', error);
      return [];
    }
  }

  /**
   * Get latest hourly insight for pig
   */
  async getLatestHourlyInsight(pigId: string): Promise<any | null> {
    try {
      await this._ensureInitialized();
      if (!this.db) return null;
      const result = await this.db.getFirstAsync(
        `SELECT * FROM hourly_insights
         WHERE pig_id = ?
         ORDER BY bucket_start DESC
         LIMIT 1`,
        [pigId]
      );
      return result || null;
    } catch (error) {
      console.error('❌ Error getting latest hourly insight:', error);
      return null;
    }
  }

  /**
   * Insert or update deterministic daily assessment
   */
  async upsertDailyAssessment(data: DailyAssessment): Promise<void> {
    try {
      await this._ensureInitialized();
      if (!this.db) throw new Error('Database connection is null');

      await this.db.runAsync(
        `INSERT INTO daily_assessments
         (pig_id, bucket_day, day_start, day_end, overall_status, summary,
          assessment_json, source_hourly_count, source_hash,
          schema_version, prompt_version, model_version, status,
          error_code, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(pig_id, bucket_day, prompt_version) DO UPDATE SET
           day_start = excluded.day_start,
           day_end = excluded.day_end,
           overall_status = excluded.overall_status,
           summary = excluded.summary,
           assessment_json = excluded.assessment_json,
           source_hourly_count = excluded.source_hourly_count,
           source_hash = excluded.source_hash,
           schema_version = excluded.schema_version,
           model_version = excluded.model_version,
           status = excluded.status,
           error_code = excluded.error_code,
           error_message = excluded.error_message,
           updated_at = CURRENT_TIMESTAMP`,
        [
          data.pig_id,
          data.bucket_day,
          data.day_start,
          data.day_end,
          data.overall_status,
          data.summary,
          data.assessment_json,
          data.source_hourly_count,
          data.source_hash,
          data.schema_version,
          data.prompt_version,
          data.model_version,
          data.status,
          data.error_code ?? null,
          data.error_message ?? null,
        ]
      );
    } catch (error) {
      console.error('❌ Error upserting daily assessment:', error);
      this.dataQueue.push(() => this.upsertDailyAssessment(data));
    }
  }

  /**
   * Get one daily assessment row for pig/day
   */
  async getDailyAssessment(pigId: string, bucketDay: string): Promise<any | null> {
    try {
      await this._ensureInitialized();
      if (!this.db) return null;

      const result = await this.db.getFirstAsync(
        `SELECT * FROM daily_assessments
         WHERE pig_id = ? AND bucket_day = ?
         ORDER BY updated_at DESC
         LIMIT 1`,
        [pigId, bucketDay]
      );
      return result || null;
    } catch (error) {
      console.error('❌ Error getting daily assessment:', error);
      return null;
    }
  }

  /**
   * Get latest daily assessment for pig
   */
  async getLatestDailyAssessment(pigId: string): Promise<any | null> {
    try {
      await this._ensureInitialized();
      if (!this.db) return null;

      const result = await this.db.getFirstAsync(
        `SELECT * FROM daily_assessments
         WHERE pig_id = ?
         ORDER BY bucket_day DESC, updated_at DESC
         LIMIT 1`,
        [pigId]
      );
      return result || null;
    } catch (error) {
      console.error('❌ Error getting latest daily assessment:', error);
      return null;
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    sensorDataCount: number;
    aggregatesCount: number;
  }> {
    try {
      await this._ensureInitialized();

      if (!this.db) {
        return { sensorDataCount: 0, aggregatesCount: 0 };
      }

      const sensorResult = await this.db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM sensor_data'
      );
      const aggResult = await this.db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM hourly_aggregates'
      );

      return {
        sensorDataCount: sensorResult?.count || 0,
        aggregatesCount: aggResult?.count || 0,
      };
    } catch (error) {
      console.error('❌ Error getting stats:', error);
      return { sensorDataCount: 0, aggregatesCount: 0 };
    }
  }

  /**
   * Delete old data (cleanup)
   */
  async deleteOldData(daysToKeep: number = 30): Promise<number> {
    try {
      await this._ensureInitialized();

      if (!this.db) {
        return 0;
      }

      const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

      const result = await this.db.runAsync(
        'DELETE FROM sensor_data WHERE timestamp < ?',
        [cutoffTime]
      );

      const totalDeleted = result.changes;
      console.log(`🗑️ Deleted ${totalDeleted} old records`);
      return totalDeleted;
    } catch (error) {
      console.error('❌ Error deleting old data:', error);
      return 0;
    }
  }

  /**
   * Save a new device to the devices table
   */
  async saveDevice(deviceId: string, deviceMac: string, deviceName: string): Promise<void> {
    try {
      await this._ensureInitialized();
      if (!this.db) throw new Error('Database connection is null');

      await this.db.runAsync(
        `INSERT OR REPLACE INTO devices (device_id, device_mac, device_name, pairing_date, last_connected)
         VALUES (?, ?, ?, ?, ?)`,
        [deviceId, deviceMac, deviceName, Date.now(), Date.now()]
      );
      console.log('✅ Device saved:', deviceId);
    } catch (error) {
      console.error('❌ Error saving device:', error);
      throw error;
    }
  }

  /**
   * Get device by device_id
   */
  async getDevice(deviceId: string): Promise<any | null> {
    try {
      await this._ensureInitialized();
      if (!this.db) return null;

      const result = await this.db.getFirstAsync(
        `SELECT * FROM devices WHERE device_id = ? LIMIT 1`,
        [deviceId]
      );
      return result || null;
    } catch (error) {
      console.error('❌ Error getting device:', error);
      return null;
    }
  }

  /**
   * Update device name
   */
  async updateDeviceName(deviceId: string, newName: string): Promise<void> {
    try {
      await this._ensureInitialized();
      if (!this.db) throw new Error('Database connection is null');

      await this.db.runAsync(
        `UPDATE devices SET device_name = ? WHERE device_id = ?`,
        [newName, deviceId]
      );
      console.log('✅ Device name updated:', deviceId, '->', newName);
    } catch (error) {
      console.error('❌ Error updating device name:', error);
      throw error;
    }
  }

  /**
   * Get the last paired device (most recent pairing_date)
   */
  async getLastPairedDevice(): Promise<any | null> {
    try {
      await this._ensureInitialized();
      if (!this.db) return null;

      const result = await this.db.getFirstAsync(
        `SELECT * FROM devices ORDER BY pairing_date DESC LIMIT 1`
      );
      return result || null;
    } catch (error) {
      console.error('❌ Error getting last paired device:', error);
      return null;
    }
  }

  /**
   * Update device's last_connected timestamp
   */
  async updateDeviceLastConnected(deviceId: string): Promise<void> {
    try {
      await this._ensureInitialized();
      if (!this.db) throw new Error('Database connection is null');

      await this.db.runAsync(
        `UPDATE devices SET last_connected = ? WHERE device_id = ?`,
        [Date.now(), deviceId]
      );
      console.log('✅ Device last_connected updated:', deviceId);
    } catch (error) {
      console.error('❌ Error updating device last_connected:', error);
      throw error;
    }
  }

  async upsertFeedingSchedule(data: FeedingSchedule): Promise<void> {
    try {
      await this._ensureInitialized();
      if (!this.db) throw new Error('Database connection is null');

      await this.db.runAsync(
        `INSERT INTO feeding_schedules
         (pig_id, feedings_per_day, feeding_times, feeding_window_before_minutes, feeding_window_after_minutes)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(pig_id) DO UPDATE SET
           feedings_per_day = excluded.feedings_per_day,
           feeding_times = excluded.feeding_times,
           feeding_window_before_minutes = excluded.feeding_window_before_minutes,
           feeding_window_after_minutes = excluded.feeding_window_after_minutes,
           updated_at = CURRENT_TIMESTAMP`,
        [
          data.pig_id,
          data.feedings_per_day,
          data.feeding_times,
          data.feeding_window_before_minutes,
          data.feeding_window_after_minutes,
        ]
      );
    } catch (error) {
      console.error('❌ Error upserting feeding schedule:', error);
      throw error;
    }
  }

  async getFeedingSchedule(pigId: string): Promise<any | null> {
    try {
      await this._ensureInitialized();
      if (!this.db) return null;
      const result = await this.db.getFirstAsync(
        `SELECT * FROM feeding_schedules WHERE pig_id = ? LIMIT 1`,
        [pigId]
      );
      return result || null;
    } catch (error) {
      console.error('❌ Error getting feeding schedule:', error);
      return null;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
      console.log('🔒 Database closed');
    }
  }
}

// Export singleton instance
export const dbService = new DatabaseService();
export type { SensorData, HourlyAggregate, HourlyInsight, DailyAssessment, FeedingSchedule };
