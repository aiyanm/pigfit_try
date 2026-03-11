/**
 * Test Suite for RAG Service
 * Tests the data retrieval and formatting functionality
 * 
 * Run this by importing and calling the test functions from your app
 * Usage: 
 *   import { runAllRagTests } from './services/testRagService';
 *   await runAllRagTests();
 */

import { dbService } from './database';
import { prepareRAGContext, clearRAGCache } from './ragService';

/**
 * Test 1: Verify database is initialized and has data
 */
export const testDatabaseConnection = async (): Promise<boolean> => {
  try {
    console.log('\n=== TEST 1: Database Connection ===');
    
    const stats = await dbService.getStats();
    console.log('📊 Database Stats:', stats);
    
    if (stats.sensorDataCount === 0) {
      console.warn('⚠️ No sensor data in database. Make sure data has been inserted.');
      return false;
    }
    
    if (stats.aggregatesCount === 0) {
      console.warn('⚠️ No hourly aggregates. They may not have been computed yet.');
      return false;
    }
    
    console.log('✅ Database connection successful');
    console.log(`   - Sensor records: ${stats.sensorDataCount}`);
    console.log(`   - Hourly aggregates: ${stats.aggregatesCount}`);
    
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    return false;
  }
};

/**
 * Test 2: Query raw hourly aggregates from database
 */
export const testRawDataQuery = async (): Promise<boolean> => {
  try {
    console.log('\n=== TEST 2: Raw Data Query ===');
    
    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    console.log(`📅 Querying data from ${yesterday} to ${today}`);
    
    // Query without pig filter to see all data
    const allData = await dbService.getHourlyAggregates(yesterday, today);
    console.log(`✅ Retrieved ${allData.length} hourly records (all pigs)`);
    
    if (allData.length === 0) {
      console.warn('⚠️ No data found for today. Check if hourly aggregates are being created.');
      return false;
    }
    
    // Show first record
    console.log('\n📋 Sample Record:');
    console.log(JSON.stringify(allData[0], null, 2));
    
    // Get unique pig IDs
    const pigIds = [...new Set(allData.map(record => record.pig_id))];
    console.log(`\n🐷 Found ${pigIds.length} unique pig IDs:`, pigIds);
    
    return true;
  } catch (error) {
    console.error('❌ Raw data query test failed:', error);
    return false;
  }
};

/**
 * Test 3: Verify RAG context formatting
 */
export const testRagContextFormatting = async (): Promise<boolean> => {
  try {
    console.log('\n=== TEST 3: RAG Context Formatting ===');
    
    // Get a pig ID to test with
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const allData = await dbService.getHourlyAggregates(yesterday, today);
    
    if (allData.length === 0) {
      console.warn('⚠️ No data available to test formatting');
      return false;
    }
    
    const testPigId = allData[0].pig_id;
    console.log(`🐷 Testing with pig ID: ${testPigId}`);
    
    // Test each time window
    const timeWindows: Array<'last_hour' | 'last_24h' | 'last_7d'> = ['last_hour', 'last_24h', 'last_7d'];
    
    for (const window of timeWindows) {
      console.log(`\n📊 Testing window: ${window}`);
      
      const context = await prepareRAGContext(testPigId, window);
      
      // Verify context contains expected sections
      const expectedSections = [
        'PIG HEALTH MONITORING DATA',
        'AGGREGATE STATISTICS',
        'HOURLY BREAKDOWN',
        'INTERPRETATION NOTES',
      ];
      
      let allPresent = true;
      for (const section of expectedSections) {
        if (!context.includes(section)) {
          console.warn(`  ⚠️ Missing section: ${section}`);
          allPresent = false;
        } else {
          console.log(`  ✅ Found section: ${section}`);
        }
      }
      
      // Show context length
      console.log(`  📝 Context length: ${context.length} characters`);
      
      // Show preview
      console.log(`\n  📋 Context Preview (first 300 chars):\n${context.substring(0, 300)}...\n`);
      
      if (!allPresent) return false;
    }
    
    console.log('✅ All RAG contexts formatted successfully');
    return true;
  } catch (error) {
    console.error('❌ RAG context formatting test failed:', error);
    return false;
  }
};

/**
 * Test 4: Verify statistics calculations
 */
export const testStatisticsCalculation = async (): Promise<boolean> => {
  try {
    console.log('\n=== TEST 4: Statistics Calculation ===');
    
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const allData = await dbService.getHourlyAggregates(yesterday, today);
    
    if (allData.length === 0) {
      console.warn('⚠️ No data to calculate statistics');
      return false;
    }
    
    const testPigId = allData[0].pig_id;
    const context = await prepareRAGContext(testPigId, 'last_24h');
    
    // Parse out the statistics from context
    const hasStats = context.includes('AGGREGATE STATISTICS');
    const hasTemp = context.includes('Temperature: Avg');
    const hasHR = context.includes('Heart Rate: Avg');
    const hasActivity = context.includes('Activity Level:');
    const hasTHI = context.includes('Temperature-Humidity Index');
    
    console.log('📊 Checking statistics:');
    console.log(`  ${hasTemp ? '✅' : '❌'} Temperature statistics`);
    console.log(`  ${hasHR ? '✅' : '❌'} Heart rate statistics`);
    console.log(`  ${hasActivity ? '✅' : '❌'} Activity statistics`);
    console.log(`  ${hasTHI ? '✅' : '❌'} THI statistics`);
    
    // Extract and display actual values
    const tempMatch = context.match(/Temperature: Avg ([\d.]+)°C/);
    const hrMatch = context.match(/Heart Rate: Avg (\d+) bpm/);
    const activityMatch = context.match(/Activity Level: ([\d.]+)/);
    const thiMatch = context.match(/Temperature-Humidity Index.*?: ([\d.]+)/);
    
    console.log('\n📈 Sample Values:');
    if (tempMatch) console.log(`  Temperature: ${tempMatch[1]}°C`);
    if (hrMatch) console.log(`  Heart Rate: ${hrMatch[1]} bpm`);
    if (activityMatch) console.log(`  Activity: ${activityMatch[1]}`);
    if (thiMatch) console.log(`  THI: ${thiMatch[1]}`);
    
    const allPresent = hasStats && hasTemp && hasHR && hasActivity && hasTHI;
    
    if (allPresent) {
      console.log('\n✅ All statistics calculated correctly');
    } else {
      console.log('\n❌ Some statistics missing');
    }
    
    return allPresent;
  } catch (error) {
    console.error('❌ Statistics calculation test failed:', error);
    return false;
  }
};

/**
 * Test 5: Test caching functionality
 */
export const testCaching = async (): Promise<boolean> => {
  try {
    console.log('\n=== TEST 5: Caching Functionality ===');
    
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const allData = await dbService.getHourlyAggregates(yesterday, today);
    
    if (allData.length === 0) {
      console.warn('⚠️ No data to test caching');
      return false;
    }
    
    const testPigId = allData[0].pig_id;
    
    // First call - should query database
    console.log('📥 First call (should query database):');
    const start1 = performance.now();
    const context1 = await prepareRAGContext(testPigId, 'last_24h');
    const end1 = performance.now();
    const time1 = end1 - start1;
    console.log(`  ⏱️ Time: ${time1.toFixed(2)}ms`);
    
    // Second call - should use cache
    console.log('\n💾 Second call (should use cache):');
    const start2 = performance.now();
    const context2 = await prepareRAGContext(testPigId, 'last_24h');
    const end2 = performance.now();
    const time2 = end2 - start2;
    console.log(`  ⏱️ Time: ${time2.toFixed(2)}ms`);
    
    // Verify same content
    const isSame = context1 === context2;
    console.log(`\n${isSame ? '✅' : '❌'} Content identical: ${isSame}`);
    
    // Cache should be faster (typically 10-100x faster)
    const speedup = time1 / time2;
    console.log(`⚡ Speedup: ${speedup.toFixed(1)}x faster with cache`);
    
    // Clear cache for next tests
    clearRAGCache();
    console.log('\n🧹 Cache cleared');
    
    return isSame && time2 < time1;
  } catch (error) {
    console.error('❌ Caching test failed:', error);
    return false;
  }
};

/**
 * Test 6: Error handling for missing data
 */
export const testErrorHandling = async (): Promise<boolean> => {
  try {
    console.log('\n=== TEST 6: Error Handling ===');
    
    // Test with non-existent pig
    console.log('🧪 Testing with non-existent pig ID...');
    
    const context = await prepareRAGContext('NONEXISTENT-PIG-999', 'last_24h');
    
    // Should return empty context message
    if (context.includes('No health data available')) {
      console.log('✅ Correctly handled missing data');
      console.log('\nEmpty context message:');
      console.log(context);
      return true;
    } else {
      console.log('❌ Did not handle missing data correctly');
      return false;
    }
  } catch (error) {
    console.error('❌ Error handling test failed:', error);
    return false;
  }
};

/**
 * Test 7: Data validation (check for null/undefined values)
 */
export const testDataValidation = async (): Promise<boolean> => {
  try {
    console.log('\n=== TEST 7: Data Validation ===');
    
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const allData = await dbService.getHourlyAggregates(yesterday, today);
    
    if (allData.length === 0) {
      console.warn('⚠️ No data to validate');
      return false;
    }
    
    console.log(`✅ Checking ${allData.length} records for invalid values...\n`);
    
    let hasNullValues = false;
    let nullCount = 0;
    
    const criticalFields = ['mean_temp', 'mean_activity', 'mean_env_temp', 'mean_humidity'];
    
    allData.forEach((record, index) => {
      criticalFields.forEach(field => {
        if (record[field] === null || record[field] === undefined) {
          hasNullValues = true;
          nullCount++;
          console.warn(`⚠️ Record ${index}: ${field} is null/undefined`);
        }
      });
    });
    
    if (!hasNullValues) {
      console.log('✅ All records have valid values');
    } else {
      console.log(`⚠️ Found ${nullCount} null/undefined values`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Data validation test failed:', error);
    return false;
  }
};

/**
 * Run all tests
 */
export const runAllRagTests = async (): Promise<void> => {
  console.log('🧪 Starting RAG Service Test Suite\n');
  console.log('═'.repeat(50));
  
  const results: { [key: string]: boolean } = {};
  
  // Run all tests
  results['Database Connection'] = await testDatabaseConnection();
  results['Raw Data Query'] = await testRawDataQuery();
  results['Data Validation'] = await testDataValidation();
  results['RAG Formatting'] = await testRagContextFormatting();
  results['Statistics'] = await testStatisticsCalculation();
  results['Caching'] = await testCaching();
  results['Error Handling'] = await testErrorHandling();
  
  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('📊 TEST SUMMARY\n');
  
  let passed = 0;
  let failed = 0;
  
  Object.entries(results).forEach(([name, result]) => {
    if (result) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
      failed++;
    }
  });
  
  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  console.log('═'.repeat(50));
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! RAG Service is working correctly.');
  } else {
    console.log(`\n⚠️ ${failed} test(s) failed. Check the output above for details.`);
  }
};
