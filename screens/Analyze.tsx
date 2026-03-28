import React, { useState, useEffect, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import {
  SensorDataPoint,
  backfillDeterministicInsightsV2,
  getCurrentHourlyAnalytics,
  getDatabaseStats,
  getDeterministicInsights,
  loadSensorData,
  loadTrendData,
  parseDailyAssessment,
  parseHourlyInsight,
  runDailyAssessmentForDay,
  toDailyAssessmentDisplayData,
  toHourlyInsightDisplayData,
} from '../services';
import { runDeterministicSchemaTests } from '../services/dev/tests/testDeterministicSchema';

const { width } = Dimensions.get('window');

type PigId = 'LIVE-PIG-01' | 'LIVE-PIG-02' | 'LIVE-PIG-03';
type TrendPeriod = '30m' | '1h' | '4h' | '12h';
type BackfillRangePreset = '7d' | '30d' | 'all';
const MIN_HOURLY_INSIGHTS_FOR_DAILY = 8;

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

const INSIGHT_STATUS_UI: Record<string, { badgeBg: string; badgeText: string; label: string }> = {
  normal: { badgeBg: 'bg-green-100', badgeText: 'text-green-700', label: 'Normal' },
  warning: { badgeBg: 'bg-yellow-100', badgeText: 'text-yellow-700', label: 'Warning' },
  watch: { badgeBg: 'bg-yellow-100', badgeText: 'text-yellow-700', label: 'Watch' },
  critical: { badgeBg: 'bg-red-100', badgeText: 'text-red-700', label: 'Critical' },
};

const formatInsightHourLabel = (hour: number): string => {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized >= 12 ? 'PM' : 'AM';
  const twelveHour = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${twelveHour}:00 ${suffix}`;
};

const parseJsonSafely = (value: unknown): any | null => {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const fallbackProbableIssue = (summary?: string | null): string => {
  const text = summary?.trim();
  if (!text) return 'Assessment pending';
  if (/critical/i.test(text)) return 'Critical stress pattern detected';
  if (/warning|watch/i.test(text)) return 'Stress indicators need monitoring';
  return 'No clear health concern detected';
};

const fallbackActionsForStatus = (status: string): string[] => {
  if (status === 'critical') {
    return ['Move to a cooler area', 'Improve airflow and water access', 'Recheck within 1 hour'];
  }
  if (status === 'warning' || status === 'watch') {
    return ['Monitor closely on the next check', 'Reduce heat exposure', 'Recheck activity and temperature'];
  }
  return ['Continue routine monitoring', 'Keep ventilation and water access stable'];
};

const fallbackEscalationForStatus = (status: string): string => {
  if (status === 'critical') return 'Call the vet now if weakness, collapse, or breathing difficulty appears';
  if (status === 'warning' || status === 'watch') return 'Call the vet today if warning signs persist or worsen';
  return 'Continue monitoring and call the vet if a new warning pattern appears';
};

const formatDateOnly = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getBackfillDateRange = (preset: BackfillRangePreset): { startDate: string; endDate: string; label: string } => {
  const now = new Date();
  const endDate = formatDateOnly(now);

  if (preset === 'all') {
    return { startDate: '1970-01-01', endDate, label: 'All history' };
  }

  const days = preset === '7d' ? 7 : 30;
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  return {
    startDate: formatDateOnly(start),
    endDate,
    label: preset === '7d' ? 'Last 7 days' : 'Last 30 days',
  };
};

const Analyze = () => {
  const [selectedPig, setSelectedPig] = useState<PigId>('LIVE-PIG-01');
  const [selectedPeriod, setSelectedPeriod] = useState<TrendPeriod>('12h');
  const [sensorData, setSensorData] = useState<SensorDataPoint[]>([]);
  const [trendData, setTrendData] = useState<SensorDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hourlyAnalytics, setHourlyAnalytics] = useState<any | null>(null);

  // Debug panel state
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [dbStats, setDbStats] = useState<any>(null);
  const [isRunningDeterministicTests, setIsRunningDeterministicTests] = useState(false);
  const [deterministicTestResult, setDeterministicTestResult] = useState<string | null>(null);
  const [deterministicData, setDeterministicData] = useState<{
    bucketDay: string;
    hourlyInsights: any[];
    dailyAssessment: any | null;
  } | null>(null);
  const [isGeneratingDaily, setIsGeneratingDaily] = useState(false);
  const [isBackfillingInsights, setIsBackfillingInsights] = useState(false);
  const [backfillRangePreset, setBackfillRangePreset] = useState<BackfillRangePreset>('30d');
  const [backfillProgress, setBackfillProgress] = useState<{
    stage: 'hourly' | 'daily' | 'complete';
    current: number;
    total: number;
    label: string;
  } | null>(null);

  const successfulHourlyInsights = useMemo(() => {
    const rows = deterministicData?.hourlyInsights ?? [];
    return rows.filter((row: any) => row?.status === 'success').length;
  }, [deterministicData]);

  const hourlyInsightCards = useMemo(() => {
    const rows = (deterministicData?.hourlyInsights ?? [])
      .filter((row: any) => row?.status === 'success')
      .slice(-3)
      .reverse();

    return rows.map((row: any) => {
      const parsed = parseHourlyInsight(parseJsonSafely(row?.insight_json));
      const status = row?.severity ?? 'warning';
      const display = toHourlyInsightDisplayData(parsed, {
        status,
        confidence: typeof row?.confidence === 'number' ? row.confidence : null,
        probableIssue: fallbackProbableIssue(row?.summary),
        evidence: [row?.summary ?? 'No evidence available'].filter(Boolean),
        actions: fallbackActionsForStatus(status),
        escalation: fallbackEscalationForStatus(status),
      });

      return {
        id: String(row?.id ?? `${row?.bucket_start ?? 'hour'}-${row?.bucket_hour ?? 'x'}`),
        title: formatInsightHourLabel(Number(row?.bucket_hour ?? 0)),
        ...display,
      };
    });
  }, [deterministicData]);

  const dailyInsightCard = useMemo(() => {
    const row = deterministicData?.dailyAssessment;
    if (!row || row.status !== 'success') return null;

    const parsed = parseDailyAssessment(parseJsonSafely(row.assessment_json));
    const status = row?.overall_status ?? 'watch';
    return {
      id: `daily-${row.bucket_day}`,
      title: row.bucket_day ? `Daily • ${row.bucket_day}` : 'Daily Assessment',
      ...toDailyAssessmentDisplayData(parsed, {
        status,
        probableIssue: fallbackProbableIssue(row?.summary),
        evidence: [row?.summary ?? 'No evidence available'].filter(Boolean),
        actions: fallbackActionsForStatus(status),
        escalation: fallbackEscalationForStatus(status),
      }),
    };
  }, [deterministicData]);

  const toLocalDateString = (ms: number): string => {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const refreshDeterministicInsights = async (pigId: PigId): Promise<void> => {
    const [insights, analytics] = await Promise.all([
      getDeterministicInsights(pigId),
      getCurrentHourlyAnalytics(pigId),
    ]);
    setDeterministicData(insights);
    setHourlyAnalytics(analytics);
  };

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
        const [rawData, aggregatedTrendData] = await Promise.all([
          loadSensorData(hours, selectedPig),
          loadTrendData(selectedPeriod, selectedPig),
        ]);
        setSensorData(rawData);
        setTrendData(aggregatedTrendData);
        setHourlyAnalytics(await getCurrentHourlyAnalytics(selectedPig));
        console.log(`📊 Loaded ${aggregatedTrendData.length} trend points for ${selectedPig} (${selectedPeriod})`);
      } catch (error) {
        console.error('Error loading sensor data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [selectedPeriod, selectedPig]);

  // Load deterministic outputs for current pig/day
  useEffect(() => {
    let active = true;
    const loadDeterministic = async () => {
      try {
        const data = await getDeterministicInsights(selectedPig);
        const analytics = await getCurrentHourlyAnalytics(selectedPig);
        if (active) setDeterministicData(data);
        if (active) setHourlyAnalytics(analytics);
      } catch (error) {
        console.error('Error loading deterministic insights:', error);
      }
    };
    loadDeterministic();
    const timer = setInterval(loadDeterministic, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selectedPig]);

  const analyticsAlert = useMemo(() => {
    if (!hourlyAnalytics) {
      return {
        status: 'Normal',
        title: 'No analytics summary yet',
        description: 'Waiting for enough tagged observations to compute the current analytics hour.',
        color: 'bg-green-100',
        text: 'text-green-700',
        symbol: '✓',
      };
    }

    const severeHeat = Number(hourlyAnalytics.severe_heat_event_count ?? 0);
    const fever = Number(hourlyAnalytics.fever_event_count ?? 0);
    const heat = Number(hourlyAnalytics.heat_stress_event_count ?? 0);
    const lethargy = Number(hourlyAnalytics.lethargy_alert ?? 0);

    if (severeHeat > 0 || (fever > 0 && heat > 0)) {
      return {
        status: 'Critical',
        title: 'High-risk analytics hour',
        description: `Peak THI ${Number(hourlyAnalytics.max_thi ?? hourlyAnalytics.thi ?? 0).toFixed(1)} with ${severeHeat} severe heat events and ${fever} fever events.`,
        color: 'bg-red-100',
        text: 'text-red-700',
        symbol: '!',
      };
    }

    if (fever > 0 || heat > 0 || lethargy > 0) {
      return {
        status: 'Warning',
        title: 'Stress indicators need monitoring',
        description: `${fever} fever events, ${heat} heat stress events, and ${Number(hourlyAnalytics.true_eating_event_count ?? 0)} true eating events in the latest hour.`,
        color: 'bg-yellow-100',
        text: 'text-yellow-700',
        symbol: '●',
      };
    }

    return {
      status: 'Normal',
      title: 'Stable analytics hour',
      description: `No fever or heat-stress events in the latest hour. Feeding adherence ${(Number(hourlyAnalytics.feeding_schedule_adherence ?? 0) * 100).toFixed(0)}%.`,
      color: 'bg-green-100',
      text: 'text-green-700',
      symbol: '✓',
    };
  }, [hourlyAnalytics]);

  // Check database stats for debug panel
  const checkDatabaseStats = async () => {
    const stats = await getDatabaseStats();
    setDbStats(stats);
  };

  // Run deterministic migration/schema smoke tests
  const handleRunDeterministicSchemaTests = async () => {
    if (isRunningDeterministicTests) return;
    setIsRunningDeterministicTests(true);
    setDeterministicTestResult(null);
    try {
      await runDeterministicSchemaTests();
      setDeterministicTestResult('PASS: All deterministic schema tests passed.');
      await checkDatabaseStats();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setDeterministicTestResult(`FAIL: ${message}`);
    } finally {
      setIsRunningDeterministicTests(false);
    }
  };

  const handleGenerateDailyInsight = async () => {
    if (isGeneratingDaily) return;

    if (successfulHourlyInsights < MIN_HOURLY_INSIGHTS_FOR_DAILY) {
      Alert.alert(
        'Not enough hourly insights yet',
        `You need at least ${MIN_HOURLY_INSIGHTS_FOR_DAILY} successful hourly insights before generating a daily assessment.`
      );
      return;
    }

    setIsGeneratingDaily(true);
    try {
      const targetDay = deterministicData?.bucketDay || toLocalDateString(Date.now());
      await runDailyAssessmentForDay(selectedPig, targetDay);
      await refreshDeterministicInsights(selectedPig);
      Alert.alert('Daily insight generated', `Daily assessment has been updated for ${targetDay}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Failed to generate daily insight', message);
    } finally {
      setIsGeneratingDaily(false);
    }
  };

  // Transform sensor data for temperature chart
  const temperatureData = trendData.map(point => ({
    value: point.temp,
    dataPointText: point.temp.toFixed(1),
  }));

  // Transform sensor data for activity chart
  const activityData = trendData.map(point => {
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

  const renderInsightCard = (
    card: {
      id: string;
      title: string;
      status: string;
      confidence: number | null;
      probableIssue: string;
      evidence: string[];
      actions: string[];
      escalation: string;
    },
    empty?: boolean
  ) => {
    const ui = INSIGHT_STATUS_UI[card.status] ?? INSIGHT_STATUS_UI.watch;
    return (
      <View
        key={card.id}
        className={`w-72 bg-white rounded-xl border border-gray-200 p-4 mr-3 ${empty ? 'opacity-80' : ''}`}
      >
        <View className="flex-row justify-between items-start mb-3">
          <View className="flex-1 pr-2">
            <Text className="text-sm font-semibold text-gray-900">{card.title}</Text>
            <Text className="text-xs text-gray-500 mt-1">
              Confidence:{' '}
              <Text className="font-semibold text-gray-700">
                {card.confidence == null ? '--' : `${Math.round(card.confidence * 100)}%`}
              </Text>
            </Text>
          </View>
          <View className={`px-3 py-1 rounded-full ${ui.badgeBg}`}>
            <Text className={`text-xs font-medium ${ui.badgeText}`}>{ui.label}</Text>
          </View>
        </View>

        <Text className="text-xs text-gray-500 mb-1">Probable issue</Text>
        <Text className="text-sm font-semibold text-gray-900 mb-3">{card.probableIssue}</Text>

        <Text className="text-xs text-gray-500 mb-1">Top evidence</Text>
        <View className="mb-3">
          {card.evidence.slice(0, 3).map((item, index) => (
            <Text key={`${card.id}-e-${index}`} className="text-xs text-gray-700 mb-1">
              • {item}
            </Text>
          ))}
        </View>

        <Text className="text-xs text-gray-500 mb-1">Actions</Text>
        <View className="mb-3">
          {card.actions.slice(0, 3).map((item, index) => (
            <Text key={`${card.id}-a-${index}`} className="text-xs text-gray-700 mb-1">
              • {item}
            </Text>
          ))}
        </View>

        <Text className="text-xs text-gray-500 mb-1">Escalation</Text>
        <Text className="text-xs text-gray-700">{card.escalation}</Text>
      </View>
    );
  };

  const handleBackfillDeterministicInsights = async () => {
    if (isBackfillingInsights) return;
    setIsBackfillingInsights(true);
    setBackfillProgress(null);
    try {
      const range = getBackfillDateRange(backfillRangePreset);
      const result = await backfillDeterministicInsightsV2(
        selectedPig,
        range.startDate,
        range.endDate,
        (progress) => {
          setBackfillProgress(progress);
          console.log(
            `🗂️ Backfill ${progress.stage} ${progress.current}/${progress.total}: ${progress.label}`
          );
        }
      );
      await refreshDeterministicInsights(selectedPig);
      Alert.alert(
        'Backfill complete',
        `Recomputed ${result.hourlyBucketsProcessed} hourly buckets and ${result.dailyDaysProcessed} daily assessments for ${selectedPig} (${range.label}).`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Backfill failed', message);
    } finally {
      setIsBackfillingInsights(false);
      setBackfillProgress((current) =>
        current
          ? current
          : {
              stage: 'complete',
              current: 0,
              total: 0,
              label: 'No backfill work was performed',
            }
      );
    }
  };

  return (
    <View className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="flex-row justify-between items-center px-5 pt-12 pb-4 bg-white">
        <TouchableOpacity>
          <Ionicons name="arrow-back" size={24} color="#4B5563" />
          {/* <Text className="text-2xl text-gray-800">←</Text> */}
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-gray-800">Analyze</Text>
        <TouchableOpacity onPress={() => { setShowDebugPanel(true); checkDatabaseStats(); }}>
          <Text className="text-sm font-semibold text-blue-700">Admin</Text>
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

        {/* Hourly Insights */}
        <View className="mt-1">
          <View className="flex-row justify-between items-center px-4 py-3">
            <View>
              <Text className="text-lg font-bold text-gray-900">Hourly Insights</Text>
              <Text className="text-xs text-gray-500">
                {deterministicData?.bucketDay || '--'} • successful {successfulHourlyInsights}
              </Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingLeft: 16, paddingRight: 4 }}
          >
            {hourlyInsightCards.length > 0
              ? hourlyInsightCards.map((card) => renderInsightCard(card))
              : renderInsightCard(
                  {
                    id: 'hourly-empty',
                    title: 'No hourly insight yet',
                    status: 'watch',
                    confidence: null,
                    probableIssue: 'Waiting for a successful hourly assessment',
                    evidence: ['No successful hourly insight is stored for this day yet'],
                    actions: ['Collect more hourly data', 'Wait for the next completed hourly run'],
                    escalation: 'Continue monitoring until a valid hourly insight is available',
                  },
                  true
                )}
          </ScrollView>
        </View>

        {/* Daily Insights */}
        <View className="mt-4">
          <View className="flex-row justify-between items-center px-4 py-3">
            <View>
              <Text className="text-lg font-bold text-gray-900">Daily Insights</Text>
              <Text className="text-xs text-gray-500">
                {deterministicData?.bucketDay || '--'} daily assessment
              </Text>
            </View>
            <TouchableOpacity
              className={`rounded-lg px-3 py-2 ${
                isGeneratingDaily || successfulHourlyInsights < MIN_HOURLY_INSIGHTS_FOR_DAILY
                  ? 'bg-gray-300'
                  : 'bg-blue-600'
              }`}
              onPress={handleGenerateDailyInsight}
              disabled={isGeneratingDaily || successfulHourlyInsights < MIN_HOURLY_INSIGHTS_FOR_DAILY}
            >
              <View className="flex-row items-center justify-center">
                {isGeneratingDaily ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : null}
                <Text className={`text-center text-xs font-semibold ${isGeneratingDaily ? 'ml-2 text-white' : 'text-white'}`}>
                  {isGeneratingDaily
                    ? 'Generating...'
                    : successfulHourlyInsights < MIN_HOURLY_INSIGHTS_FOR_DAILY
                      ? `Need ${MIN_HOURLY_INSIGHTS_FOR_DAILY}+ hourly`
                      : 'Generate Daily'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingLeft: 16, paddingRight: 4 }}
          >
            {dailyInsightCard
              ? renderInsightCard(dailyInsightCard)
              : renderInsightCard(
                  {
                    id: 'daily-empty',
                    title: 'No daily assessment yet',
                    status: 'watch',
                    confidence: null,
                    probableIssue: 'Daily assessment pending',
                    evidence: [`Need ${MIN_HOURLY_INSIGHTS_FOR_DAILY} successful hourly insights before generation`],
                    actions: ['Wait for more hourly insights', 'Run the daily assessment once enough data is available'],
                    escalation: 'Continue monitoring until the daily assessment is generated',
                  },
                  true
                )}
          </ScrollView>
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
                <View className={`w-6 h-6 rounded-full ${analyticsAlert.color} items-center justify-center mt-0.5`}>
                  <Text className={`${analyticsAlert.text} font-bold text-xs`}>{analyticsAlert.symbol}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-900 mb-0.5">{analyticsAlert.title}</Text>
                  <Text className="text-xs text-gray-500 mb-2">{analyticsAlert.description}</Text>
                </View>
                <View className={`px-3 py-1 rounded-full ${analyticsAlert.color}`}>
                  <Text className={`text-xs font-medium ${analyticsAlert.text}`}>{analyticsAlert.status}</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Bottom spacing for additional content */}
        <View className="h-24" />
      </ScrollView>

      {/* Admin Tools Modal */}
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
              <Text className="text-lg font-bold text-gray-900">Admin Tools</Text>
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

            <View className="mt-3">
              <Text className="text-xs font-semibold text-gray-700 mb-2">Backfill range</Text>
              <View className="flex-row gap-2">
                {(['7d', '30d', 'all'] as BackfillRangePreset[]).map((preset) => {
                  const selected = backfillRangePreset === preset;
                  const label = preset === '7d' ? '7 Days' : preset === '30d' ? '30 Days' : 'All';
                  return (
                    <TouchableOpacity
                      key={preset}
                      className={`px-3 py-1.5 rounded-full border ${
                        selected ? 'bg-amber-50 border-amber-500' : 'bg-white border-gray-300'
                      }`}
                      onPress={() => setBackfillRangePreset(preset)}
                      disabled={isBackfillingInsights}
                    >
                      <Text className={`text-xs font-medium ${selected ? 'text-amber-700' : 'text-gray-700'}`}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <TouchableOpacity
              className={`py-2 rounded-lg items-center mt-3 ${
                isBackfillingInsights ? 'bg-gray-400' : 'bg-amber-600'
              }`}
              onPress={handleBackfillDeterministicInsights}
              disabled={isBackfillingInsights}
            >
              <Text className="text-white font-semibold text-sm">
                {isBackfillingInsights
                  ? 'Backfilling v2 Insights...'
                  : `🗂️ Backfill ${selectedPig} to v2`}
              </Text>
            </TouchableOpacity>

            {backfillProgress && (
              <View className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <Text className="text-xs font-medium text-amber-800">
                  {backfillProgress.stage === 'hourly'
                    ? `Hourly backfill ${backfillProgress.current}/${backfillProgress.total}`
                    : backfillProgress.stage === 'daily'
                      ? `Daily backfill ${backfillProgress.current}/${backfillProgress.total}`
                      : 'Backfill complete'}
                </Text>
                <Text className="text-[11px] text-amber-700 mt-1">
                  {backfillProgress.label}
                </Text>
              </View>
            )}

            {/* Deterministic schema test trigger */}
            <TouchableOpacity
              className={`py-2 rounded-lg items-center mt-3 ${
                isRunningDeterministicTests ? 'bg-gray-400' : 'bg-green-600'
              }`}
              onPress={handleRunDeterministicSchemaTests}
              disabled={isRunningDeterministicTests}
            >
              <Text className="text-white font-semibold text-sm">
                {isRunningDeterministicTests
                  ? 'Running Deterministic Tests...'
                  : '🧪 Run Deterministic Schema Tests'}
              </Text>
            </TouchableOpacity>

            {deterministicTestResult && (
              <View className="mt-3 p-3 rounded-lg bg-gray-100">
                <Text
                  className={`text-xs font-medium ${
                    deterministicTestResult.startsWith('PASS') ? 'text-green-700' : 'text-red-700'
                  }`}
                >
                  {deterministicTestResult}
                </Text>
                <Text className="text-[11px] text-gray-600 mt-1">
                  Check Metro logs for detailed per-test output.
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default Analyze;
