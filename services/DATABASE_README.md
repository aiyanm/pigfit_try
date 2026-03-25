# SQL Database Integration for PigFit BLE Data

## Overview

Your PigFit app now stores BLE sensor data in a **SQLite database** with a single combined table that holds all sensor readings. This provides:

✅ **Simple unified storage** - All sensor data in one table  
✅ **Fast queries** with indexed columns  
✅ **Dual storage** - Both SQL database + JSON file backup  
✅ **Data integrity** with proper data types and constraints  
✅ **Flexible queries** - Get all data or filter specific fields as needed

---

## Database Schema

### **📊 Table 1: `sensor_data`**

**Combined Sensor Data Table (Environmental + Pig Data)**

| Column                 | Type     | Description                               |
| ---------------------- | -------- | ----------------------------------------- |
| `id`                   | INTEGER  | Auto-incrementing primary key             |
| `timestamp`            | INTEGER  | Unix timestamp in milliseconds            |
| `device_id`            | TEXT     | Device identifier (e.g., "PigFit_Device") |
| `pig_id`               | TEXT     | Pig identifier (e.g., "LIVE-PIG-01")      |
| **Pig Data**           |          |                                           |
| `temp`                 | REAL     | Pig body temperature (°C)                 |
| `activity_intensity`   | REAL     | Activity level (from gyro/accel)          |
| `pitch_angle`          | REAL     | Pitch angle in degrees (from gyro)        |
| `feed`                 | REAL     | Feed consumption (kg)                     |
| **Environmental Data** |          |                                           |
| `env_temp`             | REAL     | Environmental temperature (°C)            |
| `humidity`             | REAL     | Environmental humidity (%)                |
| `created_at`           | DATETIME | Auto-generated timestamp                  |

**Purpose:** Stores all sensor data in one unified table for simple querying.

---

### **📈 Table 2: `hourly_aggregates`**

**Hourly Summary Statistics**

| Column           | Type    | Description                       |
| ---------------- | ------- | --------------------------------- |
| `id`             | INTEGER | Auto-incrementing primary key     |
| `date`           | TEXT    | Date in YYYY-MM-DD format         |
| `hour`           | INTEGER | Hour of day (0-23)                |
| `pig_id`         | TEXT    | Pig identifier                    |
| `mean_temp`      | REAL    | Average pig body temperature      |
| `mean_env_temp`  | REAL    | Average environmental temperature |
| `mean_humidity`  | REAL    | Average humidity                  |
| `mean_activity`  | REAL    | Average activity intensity        |
| `mean_pitch`     | REAL    | Average pitch angle               |
| `mean_feed`      | REAL    | Average feed consumption          |
| `thi`            | REAL    | Temperature-Humidity Index        |
| `lethargy_alert` | INTEGER | Alert flag (0 or 1)               |

**Purpose:** Pre-calculated hourly statistics for faster analysis and charting.

---

## How It Works

### **Automatic Data Logging**

Every time your BLE device sends data, it's **automatically stored in the combined table**:

```typescript
// From ingestion/sensorIngestService.ts - this happens automatically!
await dbService.insertSensorData({
  timestamp: data.timestamp,
  device_id: deviceId,
  pig_id: pigId,
  // Pig data
  temp: data.temp,
  activity_intensity: data.activityIntensity,
  pitch_angle: data.pitchAngle,
  feed: data.feed,
  // Environmental data
  env_temp: data.envTemp,
  humidity: data.humidity,
});
```

---

## Usage Examples

### **Example 1: Get All Sensor Data**

```typescript
import { dbService } from "./services/storage/db/client";

// Get last 24 hours of all sensor data
const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
const allData = await dbService.getSensorData(
  oneDayAgo,
  Date.now(),
  "LIVE-PIG-01",
);

console.log("All sensor data:", allData);
// Each record contains: temp, activity_intensity, pitch_angle, feed, env_temp, humidity
```

### **Example 2: Access Environmental Fields Only**

```typescript
// Get all data, then extract environmental fields
const sensorData = await dbService.getSensorData(startTime, endTime);

// Filter to environmental data
const envData = sensorData.map((record) => ({
  timestamp: record.timestamp,
  env_temp: record.env_temp,
  humidity: record.humidity,
}));

console.log("Environmental data:", envData);
```

### **Example 3: Access Pig-Specific Fields Only**

```typescript
// Get all data, then extract pig-specific fields
const sensorData = await dbService.getSensorData(startTime, endTime);

// Filter to pig data
const pigData = sensorData.map((record) => ({
  timestamp: record.timestamp,
  temp: record.temp,
  activity_intensity: record.activity_intensity,
  pitch_angle: record.pitch_angle,
  feed: record.feed,
}));

console.log("Pig data:", pigData);
```

### **Example 4: Get Hourly Aggregates**

```typescript
// Get today's hourly summaries
const today = new Date().toISOString().split("T")[0];
const aggregates = await dbService.getHourlyAggregates(
  today,
  today,
  "LIVE-PIG-01",
);

console.log("Hourly averages:", aggregates);
```

### **Example 5: Database Statistics**

```typescript
const stats = await dbService.getStats();
console.log(`
  Sensor data records: ${stats.sensorDataCount}
  Hourly aggregates: ${stats.aggregatesCount}
`);
```

---

## Integration with Your App

### **Current Setup:**

1. **`useBLE.ts`** receives BLE data from Arduino
2. Calls `logSensorData()` from **`ingestion/sensorIngestService.ts`**
3. **`ingestion/sensorIngestService.ts`** automatically:
   - ✅ Inserts into `sensor_data` table (all fields)
   - ✅ Updates `hourly_aggregates` table
   - ✅ Saves JSON file backup

### **Database Initialization:**

The database is automatically initialized when your app starts:

```typescript
// In useBLE.ts (already done for you!)
useEffect(() => {
  initializeLogger(); // This initializes both files and database
}, []);
```

---

## Querying Data for Your Screens

### **For Dashboard Screen:**

```typescript
// Get latest sensor data for display
const recentData = await dbService.getSensorData(
  Date.now() - 5 * 60 * 1000, // Last 5 minutes
  Date.now(),
  "LIVE-PIG-01",
);

// Access any field you need
const latestTemp = recentData[recentData.length - 1]?.temp;
const latestEnvTemp = recentData[recentData.length - 1]?.env_temp;
```

### **For Analyze Screen (Charts):**

```typescript
// Get hourly aggregates for charting
const today = new Date().toISOString().split("T")[0];
const chartData = await dbService.getHourlyAggregates(today, today);

// Transform for react-native-gifted-charts
const tempChartData = chartData.map((h) => ({
  value: h.mean_temp,
  label: `${h.hour}:00`,
}));

const envTempChartData = chartData.map((h) => ({
  value: h.mean_env_temp,
  label: `${h.hour}:00`,
}));
```

---

## Data Export (CSV/Excel)

Export all data or specific fields:

```typescript
import {
  exportAllDataAsCSV,
  exportEnvironmentalDataAsCSV,
  exportPigDataAsCSV,
} from "./services/dev/examples/databaseExamples";

// Export all sensor data
const allCSV = await exportAllDataAsCSV();

// Export only environmental fields
const envCSV = await exportEnvironmentalDataAsCSV();

// Export only pig-specific fields
const pigCSV = await exportPigDataAsCSV();
```

---

## Database Maintenance

### **Cleanup Old Data:**

```typescript
// Delete data older than 30 days
await dbService.deleteOldData(30);
```

### **Close Database (App Cleanup):**

```typescript
// On app shutdown
await dbService.close();
```

---

## Benefits of Combined Table

### **1. Simpler Structure**

✅ All sensor data in **one table** - easier to manage  
✅ **One query** gets all data - no joins needed  
✅ Simpler code - single insert, single query method

### **2. Query Efficiency**

- **Get all data:** `getSensorData(start, end, pigId)`
- **Filter in code:** Extract only the fields you need
- **Indexed on timestamp and pig_id** for fast searches

### **3. Data Integrity**

- All data points stay synchronized (same timestamp)
- Proper data types (REAL for floats, INTEGER for counts)
- Guaranteed atomicity (all fields inserted together)

### **4. Flexibility**

- Easy to add more sensor fields in the future
- Can query and filter any combination of fields
- Simpler to understand and maintain

---

## Common Query Patterns

### **Get Recent Data**

```typescript
const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
const recentData = await dbService.getSensorData(fiveMinutesAgo, Date.now());
```

### **Get Data for Specific Pig**

```typescript
const pigData = await dbService.getSensorData(
  startTime,
  endTime,
  "LIVE-PIG-02",
);
```

### **Get Data for All Pigs**

```typescript
// Omit pigId to get all pigs
const allPigsData = await dbService.getSensorData(startTime, endTime);
```

### **Calculate Averages**

```typescript
const data = await dbService.getSensorData(startTime, endTime);

const avgPigTemp = data.reduce((sum, r) => sum + r.temp, 0) / data.length;
const avgEnvTemp = data.reduce((sum, r) => sum + r.env_temp, 0) / data.length;
const avgActivity =
  data.reduce((sum, r) => sum + r.activity_intensity, 0) / data.length;
```

---

## File Locations

| File                           | Purpose                                |
| ------------------------------ | -------------------------------------- |
| `services/storage/db/client.ts` | Main SQLite service with all queries |
| `services/ingestion/sensorIngestService.ts` | Logging + retrieval service |
| `services/dev/examples/databaseExamples.ts` | Usage examples and export functions |
| `useBLE.ts`                    | Already calls the logger automatically |

---

## Database Location

The SQLite database file is stored at:

```
<App Documents>/pigfit_data.db
```

You can inspect it using SQLite browser tools or export it for analysis.

---

## Table Structure Summary

```
sensor_data
├─ id (PRIMARY KEY)
├─ timestamp (INDEXED)
├─ device_id
├─ pig_id (INDEXED)
├─ temp (Pig body temperature)
├─ activity_intensity (Activity from sensors)
├─ pitch_angle (Gyro pitch)
├─ feed (Feed amount)
├─ env_temp (Environmental temperature)
├─ humidity (Environmental humidity)
└─ created_at

hourly_aggregates
├─ id (PRIMARY KEY)
├─ date (INDEXED)
├─ hour (INDEXED)
├─ pig_id
├─ mean_temp, mean_env_temp, mean_humidity
├─ mean_activity, mean_pitch, mean_feed
├─ thi (Temperature-Humidity Index)
└─ lethargy_alert
```

---

## Questions?

- **Q: All data is in one table now?**  
  A: Yes! All sensor readings (environmental + pig data) are in the `sensor_data` table. You can query all fields at once or filter in your code to specific fields.

- **Q: Can I still separate environmental and pig data?**  
  A: Yes! Just use `.map()` to extract the fields you want. See examples above.

- **Q: How do I query multiple pigs?**  
  A: Omit the `pigId` parameter to get all pigs, then filter/group in code by `pig_id` field.

- **Q: Can I add more sensor fields?**  
  A: Yes! Just add new columns to the `sensor_data` table and update the insert code.

---

**Your BLE data is now in a single unified table for simple, efficient querying! 🎉**

