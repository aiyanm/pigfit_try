import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { loadSensorData, SensorDataPoint, getDatabaseStats } from '../services/dataLogger';
import { analyzepigHealth, RAGAnalysisResult } from '../services/ragOrchestrator';
import { AnalysisType } from '../services/promptTemplates';
import { evaluateDiagnosticHierarchy, DiagnosticResult } from '../services/decisionTree';

const { width } = Dimensions.get('window');

type PigId = 'LIVE-PIG-01' | 'LIVE-PIG-02' | 'LIVE-PIG-03';
type TrendPeriod = '30m' | '1h' | '4h' | '12h';

// UI Configuration for each diagnostic case
const CASE_UI_CONFIG: Record<string, {
  iconBg: string; iconText: string; symbol: string;
  badgeBg: string; badgeText: string; label: string;
}> = {
  A: { iconBg: 'bg-red-100', iconText: 'text-red-600', symbol: '!', badgeBg: 'bg-red-100', badgeText: 'text-red-700', label: 'Alert' },
  B: { iconBg: 'bg-red-100', iconText: 'text-red-600', symbol: '!', badgeBg: 'bg-red-100', badgeText: 'text-red-700', label: 'Alert' },
  C: { iconBg: 'bg-yellow-100', iconText: 'text-yellow-600', symbol: '●', badgeBg: 'bg-yellow-100', badgeText: 'text-yellow-700', label: 'Warning' },
  D: { iconBg: 'bg-blue-100', iconText: 'text-blue-600', symbol: 'ℹ', badgeBg: 'bg-blue-100', badgeText: 'text-blue-700', label: 'Info' },
  E: { iconBg: 'bg-yellow-100', iconText: 'text-yellow-600', symbol: '●', badgeBg: 'bg-yellow-100', badgeText: 'text-yellow-700', label: 'Warning' },
  normal: { iconBg: 'bg-green-100', iconText: 'text-green-600', symbol: '✓', badgeBg: 'bg-green-100', badgeText: 'text-green-700', label: 'Normal' },
};

const Analyze = () => {
  const [selectedPig, setSelectedPig] = useState<PigId>('LIVE-PIG-01');
  const [selectedPeriod, setSelectedPeriod] = useState<TrendPeriod>('12h');
  const [sensorData, setSensorData] = useState<SensorDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Analysis state
  const [showAnalysisResults, setShowAnalysisResults] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<RAGAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedAnalysisType, setSelectedAnalysisType] = useState<AnalysisType>('full');

  // Debug panel state
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [dbStats, setDbStats] = useState<any>(null);

  // Load sensor data when period changes
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Map period to hours
        const periodHoursMap: Record<TrendPeriod, number> = {
          '30m': 0.5,
          '1h': 1,
          '4h': 4,
          '12h': 12,
        };
        
        const hours = periodHoursMap[selectedPeriod];
        const data = await loadSensorData(hours);
        setSensorData(data);
        console.log(`📊 Loaded ${data.length} data points for ${selectedPeriod}`);
      } catch (error) {
        console.error('Error loading sensor data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [selectedPeriod]);

  // Evaluate diagnostic hierarchy based on current sensor data
  const diagnosticResult = useMemo((): DiagnosticResult => {
    if (sensorData.length === 0) return evaluateDiagnosticHierarchy([]);
    const result = evaluateDiagnosticHierarchy(sensorData);
    if (result.case !== 'normal') console.log(`📋 Case ${result.case}: ${result.title}`);
    return result;
  }, [sensorData]);

  // Handle AI Analysis - Retrieves SQLite data via RAG and sends to LLM
  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      console.log(`🔍 Starting ${selectedAnalysisType} analysis for pig ${selectedPig}`);
      
      // This calls ragService which gets data from SQLite (period_aggregates or hourly_aggregates)
      // selectedAnalysisType determines which prompt template to use
      const result = await analyzepigHealth(selectedPig, 'last_24h', selectedAnalysisType);
      
      setAnalysisResults(result);
      setShowAnalysisResults(true);
      
      if (result.success) {
        console.log('✅ Analysis complete');
      } else {
        console.error('❌ Analysis returned error:', result.error);
      }
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      setAnalysisResults({
        success: false,
        pigId: selectedPig,
        analysis: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionTime: 0,
        error: 'Analysis failed',
      });
      setShowAnalysisResults(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Check database stats for debug panel
  const checkDatabaseStats = async () => {
    const stats = await getDatabaseStats();
    setDbStats(stats);
  };

  // Transform sensor data for temperature chart
  const temperatureData = sensorData.map(point => ({
    value: point.temp,
    dataPointText: point.temp.toFixed(1),
  }));

  // Transform sensor data for activity chart
  const activityData = sensorData.map(point => {
    const activity = point.activityIntensity * 10; // Scale for better visualization
    return {
      value: activity,
      dataPointText: activity.toFixed(1),
    };
  });

  const pigs: { id: PigId; color: string }[] = [
    { id: 'LIVE-PIG-01', color: '#4CAF50' },
    { id: 'LIVE-PIG-02', color: '#FFC107' },
    { id: 'LIVE-PIG-03', color: '#F44336' },
  ];

  const periods: TrendPeriod[] = ['30m', '1h', '4h', '12h'];

  const axisTextStyle = { fontSize: 10, color: '#666' };

  return (
    <View className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="flex-row justify-between items-center px-4 py-3 bg-white border-b border-gray-200">
        <TouchableOpacity>
          <Text className="text-2xl text-gray-800">←</Text>
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-gray-800">Analyze</Text>
        <TouchableOpacity onPress={() => { setShowDebugPanel(true); checkDatabaseStats(); }}>
          <Text className="text-2xl text-gray-600">🔍</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Pig Selector Chips */}
        <View className="flex-row px-4 py-3 gap-2">
          {pigs.map((pig) => (
            <TouchableOpacity
              key={pig.id}
              className={`flex-row items-center px-3 py-1.5 rounded-2xl border ${
                selectedPig === pig.id
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-300 bg-white'
              }`}
              onPress={() => setSelectedPig(pig.id)}
            >
              <View
                className="w-2 h-2 rounded-full mr-1.5"
                style={{ backgroundColor: pig.color }}
              />
              <Text className="text-xs font-medium text-gray-800">{pig.id}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Selected Pig Info */}
        <View className="flex-row justify-between px-4 py-3 bg-white mx-4 mb-3 rounded-xl">
          <View className="flex-1">
            <Text className="text-xl font-bold text-gray-800 mb-2">{selectedPig}</Text>
            <View className="flex-row gap-2">
              <View className="px-2.5 py-1 rounded-xl bg-green-500">
                <Text className="text-[11px] text-green-800 font-medium">Active</Text>
              </View>
              <View className="px-2.5 py-1 rounded-xl bg-green-100">
                <Text className="text-[11px] text-green-800 font-medium">Normal Temp</Text>
              </View>
            </View>
          </View>
          <View className="bg-gray-100 px-4 py-3 rounded-lg items-center justify-center">
            <Text className="text-[11px] text-gray-600 mb-1">Health Index</Text>
            <Text className="text-[32px] font-bold text-green-500">92</Text>
            <Text className="text-sm text-gray-400">/100</Text>
          </View>
        </View>

        {/* Trends Section */}
        <View className="flex-row justify-between items-center px-4 py-3">
          <Text className="text-lg font-bold text-gray-900">Trends</Text>
          <View className="flex-row gap-2">
            {periods.map((period) => (
              <TouchableOpacity
                key={period}
                className={`px-3 py-1.5 rounded-full border ${
                  selectedPeriod === period 
                    ? 'bg-gray-900 border-gray-900' 
                    : 'bg-white border-gray-300'
                }`}
                onPress={() => setSelectedPeriod(period)}
              >
                <Text
                  className={`text-xs font-medium ${
                    selectedPeriod === period ? 'text-white' : 'text-gray-700'
                  }`}
                >
                  {period}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Temperature Chart */}
        <View className="bg-white mx-4 mt-2 rounded-xl p-4 border border-gray-200">
          <Text className="text-sm font-semibold text-gray-900 mb-1">Temperature (°C)</Text>
          <Text className="text-xs text-gray-500 mb-4">
            {sensorData.length > 0 ? sensorData[sensorData.length - 1].temp.toFixed(1) : '--'}
          </Text>
          {isLoading ? (
            <View className="h-[100px] items-center justify-center">
              <ActivityIndicator size="small" color="#4CAF50" />
              <Text className="text-xs text-gray-500 mt-2">Loading data...</Text>
            </View>
          ) : temperatureData.length > 0 ? (
            <LineChart
              data={temperatureData}
              width={width - 80}
              height={100}
              spacing={temperatureData.length > 10 ? (width - 100) / temperatureData.length : 45}
              color="#4CAF50"
              thickness={2.5}
              startFillColor="rgba(76, 175, 80, 0.15)"
              endFillColor="rgba(76, 175, 80, 0.02)"
              startOpacity={0.9}
              endOpacity={0.1}
              initialSpacing={10}
              noOfSections={3}
              yAxisColor="transparent"
              xAxisColor="#E5E7EB"
              yAxisTextStyle={axisTextStyle}
              hideDataPoints={true}
              curved
              areaChart
              hideRules={false}
              rulesColor="#F3F4F6"
              rulesType="solid"
            />
          ) : (
            <View className="h-[100px] items-center justify-center">
              <Text className="text-xs text-gray-500">No data available</Text>
            </View>
          )}
          <View className="flex-row justify-end mt-2">
            {/* <Text className="text-xs text-red-500">Fever threshold</Text> */}
          </View>
        </View>

        {/* Activity Index Chart */}
        <View className="bg-white mx-4 mt-3 rounded-xl p-4 border border-gray-200">
          <Text className="text-sm font-semibold text-gray-900 mb-1">Activity Index</Text>
          <Text className="text-xs text-gray-500 mb-4">
            {activityData.length > 0 ? activityData[activityData.length - 1].value.toFixed(1) : '--'}
          </Text>
          {isLoading ? (
            <View className="h-[100px] items-center justify-center">
              <ActivityIndicator size="small" color="#4CAF50" />
            </View>
          ) : activityData.length > 0 ? (
            <LineChart
              data={activityData}
              width={width - 80}
              height={100}
              spacing={activityData.length > 10 ? (width - 100) / activityData.length : 45}
              color="#4CAF50"
              thickness={2.5}
              startFillColor="rgba(76, 175, 80, 0.3)"
              endFillColor="rgba(76, 175, 80, 0.05)"
              startOpacity={0.9}
              endOpacity={0.1}
              initialSpacing={10}
              noOfSections={3}
              yAxisColor="transparent"
              xAxisColor="#E5E7EB"
              yAxisTextStyle={axisTextStyle}
              hideDataPoints={true}
              curved
              areaChart
              hideRules={false}
              rulesColor="#F3F4F6"
              rulesType="solid"
            />
          ) : (
            <View className="h-[100px] items-center justify-center">
              <Text className="text-xs text-gray-500">No data available</Text>
            </View>
          )}
        </View>


        {/* Events & Alerts Section — Driven by Hierarchical Decision Tree */}
        <View className="bg-white mx-4 mt-4 p-4 rounded-xl border border-gray-200">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-base font-bold text-gray-900">Events & Alerts</Text>
          </View>

          <View className="gap-1">
            {isLoading ? (
              <View className="py-4 items-center">
                <ActivityIndicator size="small" color="#4CAF50" />
              </View>
            ) : (
              <View className="flex-row items-start gap-3">
                <View className={`w-6 h-6 rounded-full ${CASE_UI_CONFIG[diagnosticResult.case].iconBg} items-center justify-center mt-0.5`}>
                  <Text className={`${CASE_UI_CONFIG[diagnosticResult.case].iconText} font-bold text-xs`}>{CASE_UI_CONFIG[diagnosticResult.case].symbol}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-900 mb-0.5">{diagnosticResult.title}</Text>
                  <Text className="text-xs text-gray-500 mb-2">{diagnosticResult.description}</Text>
                </View>
                <View className={`px-3 py-1 rounded-full ${CASE_UI_CONFIG[diagnosticResult.case].badgeBg}`}>
                  <Text className={`text-xs font-medium ${CASE_UI_CONFIG[diagnosticResult.case].badgeText}`}>{CASE_UI_CONFIG[diagnosticResult.case].label}</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* AI Summary & Recommendations Section */}
        <View className="bg-white mx-4 mt-4 p-4 rounded-xl border border-gray-200">
          {/* Header with Icon */}
          <View className="flex-row items-center gap-2 mb-3">

            {/*add icon*/}
            <Text className="text-2xl"></Text>
            <Text className="text-base font-bold text-gray-900">AI Summary & Recommendations</Text>
          </View>

          {/* Disclaimer */}
          <Text className="text-xs text-gray-500 italic mb-4">
            Decision-support only. Final decisions by farmer/vet.
          </Text>

          {/* Analyze Button */}
          <TouchableOpacity 
            className={`py-3 rounded-lg items-center ${isAnalyzing ? 'bg-blue-400' : 'bg-blue-600'}`}
            onPress={handleAnalyze}
            activeOpacity={0.8}
            disabled={isAnalyzing}
          >
            <Text className="text-white font-semibold text-sm">
              {isAnalyzing ? 'Analyzing...' : 'Analyze'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Analysis Results Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={showAnalysisResults}
          onRequestClose={() => setShowAnalysisResults(false)}
        >
          <View className="flex-1 justify-center items-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
            <View className="bg-white rounded-2xl p-6 mx-4 max-h-96 w-96">
              {/* Modal Header */}
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-lg font-bold text-gray-900">AI Analysis Results</Text>
                <TouchableOpacity onPress={() => setShowAnalysisResults(false)}>
                  <Text className="text-2xl text-gray-600">✕</Text>
                </TouchableOpacity>
              </View>

              {/* Analysis Content */}
              <ScrollView className="max-h-64 mb-4">
                {analysisResults?.success ? (
                  <>
                    <Text className="text-sm font-semibold text-gray-700 mb-2">Pig ID: {analysisResults.pigId}</Text>
                    <Text className="text-xs text-gray-500 mb-3">
                      Execution time: {(analysisResults.executionTime / 1000).toFixed(2)}s
                      {analysisResults.cacheHit ? ' (cached)' : ''}
                    </Text>
                    <Text className="text-sm text-gray-800 leading-5">
                      {analysisResults.analysis}
                    </Text>
                  </>
                ) : (
                  <Text className="text-sm text-red-600">
                    {analysisResults?.error || 'Analysis failed'}
                  </Text>
                )}
              </ScrollView>

              {/* Action Buttons */}
              <View className="flex-row gap-3">
                <TouchableOpacity 
                  className="flex-1 py-2 rounded-lg border border-gray-300 items-center"
                  onPress={() => setShowAnalysisResults(false)}
                  activeOpacity={0.7}
                >
                  <Text className="text-gray-700 font-semibold text-sm">Close</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  className="flex-1 py-2 rounded-lg bg-blue-600 items-center"
                  onPress={handleAnalyze}
                  activeOpacity={0.8}
                  disabled={isAnalyzing}
                >
                  <Text className="text-white font-semibold text-sm">
                    {isAnalyzing ? 'Analyzing...' : 'Re-analyze'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Bottom spacing for additional content */}
        <View className="h-24" />
      </ScrollView>

      {/* Database Debug Panel Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showDebugPanel}
        onRequestClose={() => setShowDebugPanel(false)}
      >
        <View className="flex-1 bg-black bg-opacity-50 justify-end">
          <View className="bg-white rounded-t-2xl p-4 max-h-96">
            {/* Header */}
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-gray-900">Database Debug</Text>
              <TouchableOpacity onPress={() => setShowDebugPanel(false)}>
                <Text className="text-2xl text-gray-600">✕</Text>
              </TouchableOpacity>
            </View>

            {/* Stats Display */}
            <ScrollView>
              {dbStats ? (
                <>
                  <View className="bg-gray-100 p-3 rounded-lg mb-3">
                    <Text className="text-xs text-gray-600 mb-2">
                      <Text className="font-bold">Last checked:</Text> {dbStats.timestamp}
                    </Text>
                    <Text className="text-sm font-semibold text-gray-800 mb-1">
                      Raw Sensor Records: <Text className="text-green-600">{dbStats.rawSensorRecords}</Text>
                    </Text>
                    <Text className="text-sm font-semibold text-gray-800">
                      Hourly Aggregates: <Text className="text-blue-600">{dbStats.hourlyAggregates}</Text>
                    </Text>
                  </View>

                  {dbStats.latestRecord && (
                    <View className="bg-gray-50 p-3 rounded-lg mb-3">
                      <Text className="text-xs font-bold text-gray-700 mb-2">Latest Record:</Text>
                      <Text className="text-xs text-gray-600 mb-1">
                        Temp: {dbStats.latestRecord.temp.toFixed(1)}°C
                      </Text>
                      <Text className="text-xs text-gray-600 mb-1">
                        Activity: {dbStats.latestRecord.activityIntensity.toFixed(2)}g
                      </Text>
                      <Text className="text-xs text-gray-600 mb-1">
                        Pitch: {dbStats.latestRecord.pitchAngle.toFixed(1)}°
                      </Text>
                      <Text className="text-xs text-gray-600">
                        Time: {new Date(dbStats.latestRecord.timestamp).toLocaleString()}
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <Text className="text-sm text-gray-500">Loading...</Text>
              )}
            </ScrollView>

            {/* Refresh Button */}
            <TouchableOpacity 
              className="bg-blue-600 py-2 rounded-lg items-center mt-3"
              onPress={checkDatabaseStats}
            >
              <Text className="text-white font-semibold text-sm">🔄 Refresh Stats</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default Analyze;