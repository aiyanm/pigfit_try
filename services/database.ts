import * as SQLite from 'expo-sqlite';

interface SensorData {
  timestamp: number;
  device_id: string;
  pig_id: string;
  // Pig physiological and behavioral data
  temp: number;
  activity_intensity: number;
  activity_state?: string;  // 'Resting' | 'Standing/Minor Movement' | 'High Activity/Distress'
  pitch_angle: number;
  feed: number;
  // Environmental data
  env_temp: number;
  humidity: number;
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
  mean_feed: number;
  thi?: number;
  lethargy_alert?: number;
  dominant_activity_state?: string; // Most frequent ActivityState for this hour
}

type TrendPeriod = '30m' | '1h' | '4h' | '12h';

interface PeriodAggregate {
  period_type: TrendPeriod;  // '30m' | '1h' | '4h' | '12h'
  bucket_start: number;      // Unix ms — start of this bucket
  bucket_end: number;        // Unix ms — end of this bucket
  pig_id: string;
  mean_temp: number;
  mean_env_temp: number;
  mean_humidity: number;
  mean_activity: number;
  mean_pitch: number;
  mean_feed: number;
  thi?: number;
  lethargy_alert?: number;
  dominant_activity_state?: string;
  sample_count: number;      // how many raw readings were in this bucket
}

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized: boolean = false;
  private isInitializing: boolean = false;
  private initPromise: Promise<void> | null = null;
  private dataQueue: Array<() => Promise<void>> = [];

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
          pitch_angle REAL NOT NULL,
          feed REAL NOT NULL,
          env_temp REAL NOT NULL,
          humidity REAL NOT NULL,
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
          mean_feed REAL,
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
          mean_feed REAL,
          thi REAL,
          lethargy_alert INTEGER DEFAULT 0,
          dominant_activity_state TEXT DEFAULT 'Resting',
          sample_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(period_type, bucket_start, pig_id)
        );
      `);

      // Create indexes for better query performance
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_sensor_timestamp ON sensor_data(timestamp);
        CREATE INDEX IF NOT EXISTS idx_sensor_pig_id ON sensor_data(pig_id);
        CREATE INDEX IF NOT EXISTS idx_hourly_date ON hourly_aggregates(date, hour);
        CREATE INDEX IF NOT EXISTS idx_period_pig ON period_aggregates(pig_id, period_type, bucket_start);
      `);

      // Migrate existing tables: add new columns if they don't exist yet
      // SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we use try/catch
      try {
        await this.db.execAsync(`ALTER TABLE sensor_data ADD COLUMN activity_state TEXT DEFAULT 'Resting'`);
        console.log('✅ Added activity_state column to sensor_data');
      } catch { /* column already exists */ }

      try {
        await this.db.execAsync(`ALTER TABLE hourly_aggregates ADD COLUMN dominant_activity_state TEXT DEFAULT 'Resting'`);
        console.log('✅ Added dominant_activity_state column to hourly_aggregates');
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
          mean_activity, mean_pitch, mean_feed,
          thi, lethargy_alert, dominant_activity_state, sample_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(period_type, bucket_start, pig_id) DO UPDATE SET
           bucket_end              = excluded.bucket_end,
           mean_temp               = excluded.mean_temp,
           mean_env_temp           = excluded.mean_env_temp,
           mean_humidity           = excluded.mean_humidity,
           mean_activity           = excluded.mean_activity,
           mean_pitch              = excluded.mean_pitch,
           mean_feed               = excluded.mean_feed,
           thi                     = excluded.thi,
           lethargy_alert          = excluded.lethargy_alert,
           dominant_activity_state = excluded.dominant_activity_state,
           sample_count            = excluded.sample_count`,
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
          data.mean_feed,
          data.thi ?? null,
          data.lethargy_alert ?? 0,
          data.dominant_activity_state ?? 'Resting',
          data.sample_count,
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
         (timestamp, device_id, pig_id, temp, activity_intensity, activity_state, pitch_angle, feed, env_temp, humidity) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.timestamp,
          data.device_id,
          data.pig_id,
          data.temp,
          data.activity_intensity,
          data.activity_state ?? 'Resting',
          data.pitch_angle,
          data.feed,
          data.env_temp,
          data.humidity,
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
         (date, hour, pig_id, mean_temp, mean_env_temp, mean_humidity, mean_activity, mean_pitch, mean_feed, thi, lethargy_alert, dominant_activity_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(date, hour, pig_id) DO UPDATE SET
           mean_temp = excluded.mean_temp,
           mean_env_temp = excluded.mean_env_temp,
           mean_humidity = excluded.mean_humidity,
           mean_activity = excluded.mean_activity,
           mean_pitch = excluded.mean_pitch,
           mean_feed = excluded.mean_feed,
           thi = excluded.thi,
           lethargy_alert = excluded.lethargy_alert,
           dominant_activity_state = excluded.dominant_activity_state`,
        [
          data.date,
          data.hour,
          data.pig_id,
          data.mean_temp,
          data.mean_env_temp,
          data.mean_humidity,
          data.mean_activity,
          data.mean_pitch,
          data.mean_feed,
          data.thi || null,
          data.lethargy_alert || 0,
          data.dominant_activity_state ?? 'Resting',
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
export type { SensorData, HourlyAggregate };
