/**
 * Database and Data Logger Test Script
 * 
 * This file contains test functions you can call from your app
 * to verify that your database and aggregation system is working.
 * 
 * HOW TO USE:
 * 1. Import this file in your main screen (e.g., DashboardScreen.tsx)
 * 2. Call any test function (they all log to console)
 * 3. Check the Metro bundler console for output
 */

import { dbService } from './database';
import { logSensorData, getLogStats, SensorDataPoint } from './dataLogger';

/**
 * Test 1: Insert test data and verify aggregation
 */
export const testAggregation = async () => {
  console.log('\n========================================');
  console.log('🧪 TEST 1: Data Aggregation (10 readings)');
  console.log('========================================\n');

  try {
    // Generate 15 test readings
    for (let i = 1; i <= 15; i++) {
      const testData: SensorDataPoint = {
        timestamp: Date.now() + i * 1000, // 1 second apart
        temp: 38.5 + Math.random() * 0.5,
        hr: 90 + Math.floor(Math.random() * 10),
        envTemp: 25.0 + Math.random() * 2,
        humidity: 65 + Math.random() * 5,
        activityIntensity: Math.random() * 10,
        pitchAngle: (Math.random() - 0.5) * 90,
        feed: 3.0 + Math.random() * 0.5,
      };

      await logSensorData(testData, 'PigFit_Device', 'TEST-PIG-01');
      
      // Small delay to see the buffering progress
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('\n✅ Test completed! Check console output above.');
    console.log('You should see:');
    console.log('  - Buffering messages 1/10, 2/10, ... 9/10');
    console.log('  - Aggregation message at 10/10');
    console.log('  - JSON file saved message');
    console.log('  - Buffer resets and continues 1/10, 2/10, ... 5/10');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

/**
 * Test 2: Query SQL database
 */
export const testDatabaseQuery = async () => {
  console.log('\n========================================');
  console.log('🧪 TEST 2: SQL Database Query');
  console.log('========================================\n');

  try {
    // Get last hour of data
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const data = await dbService.getSensorData(oneHourAgo, Date.now());

    console.log(`📊 Found ${data.length} records in SQL database`);
    
    if (data.length > 0) {
      console.log('\nFirst record:');
      console.log(JSON.stringify(data[0], null, 2));
      
      console.log('\nLast record:');
      console.log(JSON.stringify(data[data.length - 1], null, 2));
    } else {
      console.log('⚠️ No data found. Run testAggregation() first to insert test data.');
    }

    console.log('\n✅ Database query test completed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

/**
 * Test 3: Check database statistics
 */
export const testDatabaseStats = async () => {
  console.log('\n========================================');
  console.log('🧪 TEST 3: Database Statistics');
  console.log('========================================\n');

  try {
    const stats = await dbService.getStats();
    
    console.log('📊 Database Statistics:');
    console.log(`  Total sensor records: ${stats.sensorDataCount}`);
    console.log(`  Total hourly aggregates: ${stats.aggregatesCount}`);
    console.log(`  Total records: ${stats.sensorDataCount + stats.aggregatesCount}`);

    console.log('\n✅ Stats test completed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

/**
 * Test 4: Check JSON file statistics
 */
export const testJSONFileStats = async () => {
  console.log('\n========================================');
  console.log('🧪 TEST 4: JSON File Statistics');
  console.log('========================================\n');

  try {
    const stats = await getLogStats();
    
    console.log('📄 JSON File Statistics:');
    console.log(`  Total JSON files: ${stats.fileCount}`);
    console.log(`  Total aggregated points: ${stats.totalPoints}`);
    console.log(`  Estimated individual readings: ~${stats.totalPoints * 10}`);
    console.log(`  (Each aggregated point = mean of 10 readings)`);

    console.log('\n✅ JSON stats test completed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

/**
 * Test 5: Calculate averages from SQL data
 */
export const testDataAnalysis = async () => {
  console.log('\n========================================');
  console.log('🧪 TEST 5: Data Analysis');
  console.log('========================================\n');

  try {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const data = await dbService.getSensorData(oneHourAgo, Date.now());

    if (data.length === 0) {
      console.log('⚠️ No data found. Run testAggregation() first.');
      return;
    }

    // Calculate averages
    const avgPigTemp = data.reduce((sum, r) => sum + r.temp, 0) / data.length;
    const avgEnvTemp = data.reduce((sum, r) => sum + r.env_temp, 0) / data.length;
    const avgHumidity = data.reduce((sum, r) => sum + r.humidity, 0) / data.length;
    const avgActivity = data.reduce((sum, r) => sum + r.activity_intensity, 0) / data.length;
    const avgHr = data.reduce((sum, r) => sum + r.hr, 0) / data.length;

    console.log('📈 Analysis Results (Last Hour):');
    console.log(`  Records analyzed: ${data.length}`);
    console.log(`  Average Pig Temperature: ${avgPigTemp.toFixed(2)}°C`);
    console.log(`  Average Env Temperature: ${avgEnvTemp.toFixed(2)}°C`);
    console.log(`  Average Humidity: ${avgHumidity.toFixed(1)}%`);
    console.log(`  Average Activity: ${avgActivity.toFixed(2)}`);
    console.log(`  Average Heart Rate: ${avgHr.toFixed(0)} bpm`);
    console.log(`  Temp Difference: ${(avgPigTemp - avgEnvTemp).toFixed(2)}°C`);

    console.log('\n✅ Analysis test completed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

/**
 * Run all tests in sequence
 */
export const runAllTests = async () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  Running All Database & Logger Tests  ║');
  console.log('╚════════════════════════════════════════╝\n');

  await testAggregation();
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await testDatabaseQuery();
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await testDatabaseStats();
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await testJSONFileStats();
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await testDataAnalysis();

  console.log('\n╔════════════════════════════════════════╗');
  console.log('║       All Tests Completed! ✅          ║');
  console.log('╚════════════════════════════════════════╝\n');
};

// Export individual test functions
export default {
  testAggregation,
  testDatabaseQuery,
  testDatabaseStats,
  testJSONFileStats,
  testDataAnalysis,
  runAllTests,
};
