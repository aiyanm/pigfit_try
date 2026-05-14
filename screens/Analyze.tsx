import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import {
  calculateTHI,
  FEVER_THRESHOLD_C,
  HEAT_STRESS_THRESHOLD,
  SEVERE_HEAT_THRESHOLD,
} from '../services/diagnostics/metricsService';
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
import { useBLEContext } from '../providers/BLEProvider';

const { width } = Dimensions.get('window');

type PigId = 'LIVE-PIG-01' | 'LIVE-PIG-02' | 'LIVE-PIG-03';
type TrendPeriod = '30m' | '1h' | '4h' | '12h';
type BackfillRangePreset = '7d' | '30d' | 'all';
const MIN_HOURLY_INSIGHTS_FOR_DAILY = 8;
const CHART_HEIGHT = 100;
const SUPPORTED_PIG_ID: PigId = 'LIVE-PIG-01';
const LIVE_PACKET_REPLACE_WINDOW_MS = 25;
const LIVE_TREND_UI_THROTTLE_MS = 250;
const PERIOD_DURATION_MS: Record<TrendPeriod, number> = {
  '30m': 30 * 60 * 1000,
  '1h': 1 * 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
};

const INSIGHT_STATUS_UI: Record<
  string,
  { badgeBg: string; badgeText: string; label: string; dotColor: string; borderColor: string }
> = {
  normal: {
    badgeBg: 'bg-green-100',
    badgeText: 'text-green-700',
    label: 'Normal',
    dotColor: '#16A34A',
    borderColor: '#BBF7D0',
  },
  warning: {
    badgeBg: 'bg-yellow-100',
    badgeText: 'text-yellow-700',
    label: 'Warning',
    dotColor: '#D97706',
    borderColor: '#FDE68A',
  },
  watch: {
    badgeBg: 'bg-yellow-100',
    badgeText: 'text-yellow-700',
    label: 'Watch',
    dotColor: '#D97706',
    borderColor: '#FDE68A',
  },
  critical: {
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-700',
    label: 'Critical',
    dotColor: '#DC2626',
    borderColor: '#FECACA',
  },
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

const fallbackObservedPattern = (summary?: string | null): string => {
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

const fallbackMonitorNextForStatus = (status: string): string[] => {
  if (status === 'critical') {
    return ['Persistent weakness', 'Breathing difficulty', 'Another critical heat period'];
  }
  if (status === 'warning' || status === 'watch') {
    return ['Repeated warning hours', 'Lower activity', 'Rising heat load'];
  }
  return [];
};

const formatDateOnly = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getTHIStatus = (value?: number): string => {
  if (value == null || !Number.isFinite(value)) return 'No THI data';
  if (value > SEVERE_HEAT_THRESHOLD) return 'Severe heat';
  if (value >= HEAT_STRESS_THRESHOLD) return 'Heat stress';
  return 'Comfortable';
};

const getTemperatureStatus = (value?: number): string => {
  if (value == null || !Number.isFinite(value)) return 'No temperature data';
  if (value > FEVER_THRESHOLD_C) return 'Fever risk';
  if (value >= FEVER_THRESHOLD_C - 0.5) return 'Monitor closely';
  return 'Normal range';
};

const getTemperatureChipConfig = (value?: number): { label: string; containerClassName: string; textClassName: string } | null => {
  const status = getTemperatureStatus(value);
  if (status === 'No temperature data') return null;
  if (status === 'Fever risk') {
    return {
      label: 'Fever Risk',
      containerClassName: 'bg-red-100',
      textClassName: 'text-red-800',
    };
  }
  if (status === 'Monitor closely') {
    return {
      label: 'Monitor Temp',
      containerClassName: 'bg-yellow-100',
      textClassName: 'text-yellow-800',
    };
  }
  return {
    label: 'Normal Temp',
    containerClassName: 'bg-blue-100',
    textClassName: 'text-blue-800',
  };
};

const getActivityStatus = (value?: number): string => {
  if (value == null || !Number.isFinite(value)) return 'No activity data';
  if (value < 1.05) return 'Low movement';
  if (value >= 2) return 'High movement';
  return 'Normal movement';
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
  const navigation = useNavigation<any>();
  const { connectedDevice, connectionStatus, receivedData } = useBLEContext();
  const isPigFitConnected = connectionStatus === 'connected' && !!connectedDevice;
  const [selectedPeriod, setSelectedPeriod] = useState<TrendPeriod>('12h');
  const [sensorData, setSensorData] = useState<SensorDataPoint[]>([]);
  const [trendData, setTrendData] = useState<SensorDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hourlyAnalytics, setHourlyAnalytics] = useState<any | null>(null);
  const previousConnectedRef = useRef(false);
  const lastLiveTrendUpdateAtRef = useRef(0);
  const lastProcessedLivePacketKeyRef = useRef<string | null>(null);
  const liveTemp = receivedData?.temp ?? null;
  const liveEnvTemp = receivedData?.envTemp ?? null;
  const liveHumidity = receivedData?.humidity ?? null;
  const liveActivityIntensity = receivedData?.activityIntensity ?? null;
  const livePitchAngle = receivedData?.pitchAngle ?? null;
  const liveAccelX = receivedData?.accelX ?? null;
  const liveAccelY = receivedData?.accelY ?? null;
  const liveAccelZ = receivedData?.accelZ ?? null;
  const liveGyroX = receivedData?.gyroX ?? null;
  const liveGyroY = receivedData?.gyroY ?? null;
  const liveGyroZ = receivedData?.gyroZ ?? null;
  const liveFeedingPostureDetected = receivedData?.feedingPostureDetected ?? null;

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
        summary: row?.summary ?? 'No summary available for this period',
        observedPattern: fallbackObservedPattern(row?.summary),
        keyEvidence: [row?.summary ?? 'No evidence available'].filter(Boolean),
        recommendedAction: fallbackActionsForStatus(status),
        escalationNote: fallbackEscalationForStatus(status),
        dataQualityNote: 'Assessment unavailable for this period',
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
        summary: row?.summary ?? 'No daily summary available',
        observedPattern: fallbackObservedPattern(row?.summary),
        keyEvidence: [row?.summary ?? 'No evidence available'].filter(Boolean),
        recommendedAction: fallbackActionsForStatus(status),
        escalationNote: fallbackEscalationForStatus(status),
        monitorNext: fallbackMonitorNextForStatus(status),
        dataQualityNote:
          successfulHourlyInsights < MIN_HOURLY_INSIGHTS_FOR_DAILY
            ? 'Limited by incomplete daily coverage'
            : 'Assessment unavailable for this period',
      }),
    };
  }, [deterministicData, successfulHourlyInsights]);

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

  const loadPersistedTrendWindow = async () => {
    setIsLoading(true);
    try {
      const periodHoursMap: Record<TrendPeriod, number> = {
        '30m': 0.5,
        '1h': 1,
        '4h': 4,
        '12h': 12,
      };

      const hours = periodHoursMap[selectedPeriod];
      const [rawData, aggregatedTrendData, analytics] = await Promise.all([
        loadSensorData(hours, SUPPORTED_PIG_ID),
        loadTrendData(selectedPeriod, SUPPORTED_PIG_ID),
        getCurrentHourlyAnalytics(SUPPORTED_PIG_ID),
      ]);

      setSensorData(rawData);
      setTrendData(aggregatedTrendData);
      setHourlyAnalytics(analytics);
      console.log(`📊 Loaded ${aggregatedTrendData.length} trend points for ${SUPPORTED_PIG_ID} (${selectedPeriod})`);
    } catch (error) {
      console.error('Error loading sensor data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load persisted baseline data when the selected period changes.
  useEffect(() => {
    let active = true;

    const loadData = async () => {
      try {
        await loadPersistedTrendWindow();
        if (!active) return;
      } catch (error) {
        console.error('Error loading sensor data:', error);
      }
    };

    loadData();
    return () => {
      active = false;
    };
  }, [selectedPeriod]);

  // Reload the persisted baseline when a BLE session becomes connected.
  useEffect(() => {
    if (isPigFitConnected && !previousConnectedRef.current) {
      void loadPersistedTrendWindow();
    }
    previousConnectedRef.current = isPigFitConnected;
  }, [isPigFitConnected]);

  const livePacketKey = [
    liveTemp,
    liveEnvTemp,
    liveHumidity,
    liveActivityIntensity,
    livePitchAngle,
    liveAccelX,
    liveAccelY,
    liveAccelZ,
    liveGyroX,
    liveGyroY,
    liveGyroZ,
    liveFeedingPostureDetected === null ? null : liveFeedingPostureDetected ? 1 : 0,
  ].join('|');

  useEffect(() => {
    if (
      !isPigFitConnected ||
      liveTemp === null ||
      liveEnvTemp === null ||
      liveHumidity === null ||
      liveActivityIntensity === null ||
      livePitchAngle === null
    ) {
      lastProcessedLivePacketKeyRef.current = null;
      return;
    }

    if (livePacketKey === lastProcessedLivePacketKeyRef.current) {
      return;
    }
    lastProcessedLivePacketKeyRef.current = livePacketKey;

    const timestamp = Date.now();
    if (timestamp - lastLiveTrendUpdateAtRef.current < LIVE_TREND_UI_THROTTLE_MS) {
      return;
    }
    lastLiveTrendUpdateAtRef.current = timestamp;

    const livePoint: SensorDataPoint = {
      timestamp,
      temp: liveTemp,
      envTemp: liveEnvTemp,
      humidity: liveHumidity,
      activityIntensity: liveActivityIntensity,
      pitchAngle: livePitchAngle,
      accelX: liveAccelX ?? undefined,
      accelY: liveAccelY ?? undefined,
      accelZ: liveAccelZ ?? undefined,
      gyroX: liveGyroX ?? undefined,
      gyroY: liveGyroY ?? undefined,
      gyroZ: liveGyroZ ?? undefined,
      feedingPostureDetected: Boolean(liveFeedingPostureDetected),
      thi: calculateTHI(liveEnvTemp, liveHumidity),
    };

    setTrendData((prev) => {
      const windowStart = timestamp - PERIOD_DURATION_MS[selectedPeriod];
      const trimmed = prev.filter((point) => Number(point.timestamp) >= windowStart);
      const next = [...trimmed];
      const lastPoint = next[next.length - 1];

      if (lastPoint && Math.abs(Number(lastPoint.timestamp) - timestamp) <= LIVE_PACKET_REPLACE_WINDOW_MS) {
        next[next.length - 1] = livePoint;
      } else {
        next.push(livePoint);
      }

      return next.filter((point) => Number(point.timestamp) >= windowStart);
    });
  }, [
    isPigFitConnected,
    livePacketKey,
    liveTemp,
    liveEnvTemp,
    liveHumidity,
    liveActivityIntensity,
    livePitchAngle,
    liveAccelX,
    liveAccelY,
    liveAccelZ,
    liveGyroX,
    liveGyroY,
    liveGyroZ,
    liveFeedingPostureDetected,
    selectedPeriod,
  ]);

  // Load deterministic outputs for current pig/day
  useEffect(() => {
    let active = true;
    const loadDeterministic = async () => {
      try {
        const data = await getDeterministicInsights(SUPPORTED_PIG_ID);
        const analytics = await getCurrentHourlyAnalytics(SUPPORTED_PIG_ID);
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
  }, []);

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
        description: `${fever} fever events, ${heat} heat stress events, and ${Number(hourlyAnalytics.true_eating_event_count ?? 0)} manual feeding confirmations in the latest hour.`,
        color: 'bg-yellow-100',
        text: 'text-yellow-700',
        symbol: '●',
      };
    }

    return {
      status: 'Normal',
      title: 'Stable analytics hour',
      description: `No fever or heat-stress events in the latest hour. Manual feeding confirmations: ${Number(hourlyAnalytics.true_eating_event_count ?? 0)}.`,
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
      await runDailyAssessmentForDay(SUPPORTED_PIG_ID, targetDay);
      await refreshDeterministicInsights(SUPPORTED_PIG_ID);
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

  const thiData = trendData.map(point => ({
    value: Number(point.thi ?? 0),
    dataPointText: Number(point.thi ?? 0).toFixed(1),
  }));

  // Transform sensor data for activity chart
  const activityData = trendData.map(point => ({
    value: point.activityIntensity,
    dataPointText: point.activityIntensity.toFixed(2),
  }));

  const periods: TrendPeriod[] = ['30m', '1h', '4h', '12h'];

  const axisTextStyle = { fontSize: 10, color: '#666' };
  const chartSpacing = (count: number) => (count > 10 ? (width - 100) / count : 45);
  const latestTrendPoint = trendData.length > 0 ? trendData[trendData.length - 1] : null;
  const temperatureChip = useMemo(() => getTemperatureChipConfig(latestTrendPoint?.temp), [latestTrendPoint?.temp]);
  const activeEventChips = useMemo(() => {
    if (!hourlyAnalytics) return [];

    const chips: Array<{ label: string; containerClassName: string; textClassName: string }> = [];
    const fever = Number(hourlyAnalytics.fever_event_count ?? 0);
    const heat = Number(hourlyAnalytics.heat_stress_event_count ?? 0);
    const severeHeat = Number(hourlyAnalytics.severe_heat_event_count ?? 0);
    const lethargy = Number(hourlyAnalytics.lethargy_alert ?? 0);

    if (fever > 0) {
      chips.push({
        label: 'Fever',
        containerClassName: 'bg-red-100',
        textClassName: 'text-red-800',
      });
    }
    if (heat > 0) {
      chips.push({
        label: 'Heat',
        containerClassName: 'bg-amber-100',
        textClassName: 'text-amber-800',
      });
    }
    if (severeHeat > 0) {
      chips.push({
        label: 'Severe Heat',
        containerClassName: 'bg-orange-100',
        textClassName: 'text-orange-800',
      });
    }
    if (lethargy > 0) {
      chips.push({
        label: 'Lethargy',
        containerClassName: 'bg-purple-100',
        textClassName: 'text-purple-800',
      });
    }

    return chips;
  }, [hourlyAnalytics]);

  const renderTrendChartCard = ({
    title,
    latestValue,
    latestLabel,
    status,
    statusClassName,
    data,
    lineColor,
    fillStartColor,
    fillEndColor,
    loadingColor,
    thresholdText,
  }: {
    title: string;
    latestValue: string;
    latestLabel: string;
    status: string;
    statusClassName: string;
    data: { value: number; dataPointText: string }[];
    lineColor: string;
    fillStartColor: string;
    fillEndColor: string;
    loadingColor: string;
    thresholdText: string;
  }) => (
    <View className="bg-white mx-4 mt-3 rounded-xl p-4 border border-gray-200">
      <View className="flex-row justify-between items-start mb-4">
        <View>
          <Text className="text-sm font-semibold text-gray-900 mb-1">{title}</Text>
          <Text className="text-xs text-gray-500">{latestLabel}</Text>
        </View>
        <View className="items-end">
          <Text className="text-lg font-bold text-gray-900">{latestValue}</Text>
          <Text className={`text-xs font-semibold mt-1 ${statusClassName}`}>{status}</Text>
        </View>
      </View>
      {isLoading ? (
        <View className="h-[100px] items-center justify-center">
          <ActivityIndicator size="small" color={loadingColor} />
          <Text className="text-xs text-gray-500 mt-2">Loading data...</Text>
        </View>
      ) : data.length > 0 ? (
        <LineChart
          data={data}
          width={width - 80}
          height={CHART_HEIGHT}
          spacing={chartSpacing(data.length)}
          color={lineColor}
          thickness={2.5}
          startFillColor={fillStartColor}
          endFillColor={fillEndColor}
          startOpacity={0.9}
          endOpacity={0.12}
          initialSpacing={10}
          noOfSections={3}
          yAxisColor="transparent"
          xAxisColor="#E5E7EB"
          yAxisTextStyle={axisTextStyle}
          hideDataPoints
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
      <View className="flex-row justify-between items-center mt-3">
        <Text className="text-[11px] text-gray-500">{thresholdText}</Text>
        <View className="w-3 h-3 rounded-full" style={{ backgroundColor: lineColor }} />
      </View>
    </View>
  );

  const renderInsightCard = (
    card: {
      id: string;
      title: string;
      status: string;
      summary: string;
      observedPattern: string;
      keyEvidence: string[];
      recommendedAction: string[];
      escalationNote: string;
      monitorNext?: string[];
      dataQualityNote?: string;
    },
    empty?: boolean
  ) => {
    const ui = INSIGHT_STATUS_UI[card.status] ?? INSIGHT_STATUS_UI.watch;
    return (
      <View
        key={card.id}
        className={`w-72 bg-white rounded-xl border p-4 mr-3 ${empty ? 'opacity-80' : ''}`}
        style={{ borderColor: ui.borderColor, borderLeftWidth: 4 }}
      >
        <Text className="text-sm font-semibold text-gray-900 mb-3">{card.title}</Text>

        <View className="flex-row justify-between items-center mb-3">
          <View className="flex-row items-center flex-1 pr-2">
            <View className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: ui.dotColor }} />
            <Text className={`text-xs font-semibold uppercase tracking-wide ${ui.badgeText}`}>
              Status: {ui.label}
            </Text>
          </View>
          {card.dataQualityNote ? (
            <View className="px-2 py-1 rounded-full bg-gray-100">
              <Text className="text-[10px] font-semibold text-gray-600">Limited data</Text>
            </View>
          ) : null}
        </View>

        <Text className="text-lg font-bold text-gray-900 mb-1">{card.observedPattern}</Text>
        <Text className="text-sm text-gray-500 mb-4">{card.summary}</Text>

        <Text className="text-xs font-semibold text-gray-500 uppercase mb-1">Key evidence</Text>
        <View className="mb-3">
          {card.keyEvidence.slice(0, 3).map((item, index) => (
            <Text key={`${card.id}-e-${index}`} className="text-xs text-gray-700 mb-1">
              • {item}
            </Text>
          ))}
        </View>

        <Text className="text-xs font-semibold text-gray-500 uppercase mb-1">Recommended action</Text>
        <View className="mb-3">
          {card.recommendedAction.slice(0, 3).map((item, index) => (
            <Text key={`${card.id}-a-${index}`} className="text-xs text-gray-700 mb-1">
              • {item}
            </Text>
          ))}
        </View>

        {card.monitorNext && card.monitorNext.length > 0 ? (
          <View className="mb-3">
            <Text className="text-xs font-semibold text-gray-500 uppercase mb-1">Monitor next</Text>
            <Text className="text-xs italic text-gray-700">{card.monitorNext.slice(0, 3).join(', ')}</Text>
          </View>
        ) : null}

        <Text className="text-xs font-semibold text-gray-500 uppercase mb-1">Escalation</Text>
        <Text className="text-xs text-gray-700">{card.escalationNote}</Text>

        {card.dataQualityNote ? (
          <View className="mt-3">
            <Text className="text-xs font-semibold text-gray-500 uppercase mb-1">Data quality</Text>
            <Text className="text-xs text-gray-600">{card.dataQualityNote}</Text>
          </View>
        ) : null}
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
        SUPPORTED_PIG_ID,
        range.startDate,
        range.endDate,
        (progress) => {
          setBackfillProgress(progress);
          console.log(
            `🗂️ Backfill ${progress.stage} ${progress.current}/${progress.total}: ${progress.label}`
          );
        }
      );
      await refreshDeterministicInsights(SUPPORTED_PIG_ID);
      Alert.alert(
        'Backfill complete',
        `Recomputed ${result.hourlyBucketsProcessed} hourly buckets and ${result.dailyDaysProcessed} daily assessments for ${SUPPORTED_PIG_ID} (${range.label}).`
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

  const handleBackPress = () => {
    navigation.navigate('Dashboard');
  };

  return (
    <View className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="flex-row justify-between items-center px-5 pt-12 pb-4 bg-white">
        <TouchableOpacity onPress={handleBackPress}>
          <Ionicons name="arrow-back" size={24} color="#4B5563" />
          {/* <Text className="text-2xl text-gray-800">←</Text> */}
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-gray-800">Analyze</Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Additional pigs stay hidden until multi-device binding is implemented. */}
        <View className="px-4 py-3">
          <View className="self-start flex-row items-center px-3 py-1.5 rounded-2xl border border-green-500 bg-green-50">
            <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: '#4CAF50' }} />
            <Text className="text-xs font-medium text-gray-800">{SUPPORTED_PIG_ID}</Text>
          </View>
          <Text className="text-xs text-gray-500 mt-2">
            Analyze currently supports one live pig. Multi-pig support is planned for a future release.
          </Text>
        </View>

        {/* Selected Pig Info */}
        <View className="px-4 py-4 bg-white mx-4 mb-3 rounded-xl">
          <Text className="text-xl font-bold text-gray-800">{SUPPORTED_PIG_ID}</Text>
          <View className="mt-3 flex-row flex-wrap items-center -mb-2">
            {isPigFitConnected ? (
              <View className="self-start mr-2 mb-2 px-2.5 py-1 rounded-xl bg-green-100">
                <Text className="text-[11px] text-green-800 font-medium">Active</Text>
              </View>
            ) : null}
            {temperatureChip ? (
              <View className={`self-start mr-2 mb-2 px-2.5 py-1 rounded-xl ${temperatureChip.containerClassName}`}>
                <Text className={`text-[11px] font-medium ${temperatureChip.textClassName}`}>{temperatureChip.label}</Text>
              </View>
            ) : null}
          </View>
          {activeEventChips.length > 0 ? (
            <View className="mt-2 flex-row flex-wrap items-center -mb-2">
              {activeEventChips.map((chip) => (
                <View key={chip.label} className={`self-start mr-2 mb-2 px-2.5 py-1 rounded-xl ${chip.containerClassName}`}>
                  <Text className={`text-[11px] font-medium ${chip.textClassName}`}>{chip.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
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
                    summary: 'No successful hourly insight is stored for this day yet.',
                    observedPattern: 'Waiting for a completed hourly assessment',
                    keyEvidence: ['No successful hourly insight is stored for this day yet'],
                    recommendedAction: ['Collect more hourly data', 'Wait for the next completed hourly run'],
                    escalationNote: 'Continue monitoring until a valid hourly insight is available',
                    dataQualityNote: 'Assessment unavailable for this period',
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
          <View className="px-4">
            {dailyInsightCard
              ? renderInsightCard(dailyInsightCard)
              : renderInsightCard(
                  {
                    id: 'daily-empty',
                    title: 'No daily assessment yet',
                    status: 'watch',
                    summary: 'A daily assessment will appear after enough hourly insights are available.',
                    observedPattern: 'Daily monitoring summary pending',
                    keyEvidence: [`Need ${MIN_HOURLY_INSIGHTS_FOR_DAILY} successful hourly insights before generation`],
                    recommendedAction: ['Wait for more hourly insights', 'Run the daily assessment once enough data is available'],
                    escalationNote: 'Continue monitoring until the daily assessment is generated',
                    monitorNext: ['Repeated warning hours', 'Lower activity', 'Rising heat load'],
                    dataQualityNote: 'Limited by incomplete daily coverage',
                  },
                  true
                )}
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

        {renderTrendChartCard({
          title: 'THI',
          latestValue: latestTrendPoint?.thi != null ? latestTrendPoint.thi.toFixed(1) : '--',
          latestLabel: 'Aggregated temperature-humidity stress',
          status: getTHIStatus(latestTrendPoint?.thi),
          statusClassName:
            latestTrendPoint?.thi != null && latestTrendPoint.thi > SEVERE_HEAT_THRESHOLD
              ? 'text-red-600'
              : latestTrendPoint?.thi != null && latestTrendPoint.thi >= HEAT_STRESS_THRESHOLD
                ? 'text-amber-600'
                : 'text-emerald-600',
          data: thiData,
          lineColor: '#D97706',
          fillStartColor: 'rgba(217, 119, 6, 0.28)',
          fillEndColor: 'rgba(245, 158, 11, 0.05)',
          loadingColor: '#D97706',
          thresholdText: `Warning at ${HEAT_STRESS_THRESHOLD} • Severe at ${SEVERE_HEAT_THRESHOLD}`,
        })}

        {renderTrendChartCard({
          title: 'Pig Temperature (°C)',
          latestValue: latestTrendPoint ? latestTrendPoint.temp.toFixed(1) : '--',
          latestLabel: 'Body temperature trend',
          status: getTemperatureStatus(latestTrendPoint?.temp),
          statusClassName:
            latestTrendPoint != null && latestTrendPoint.temp > FEVER_THRESHOLD_C
              ? 'text-red-600'
              : latestTrendPoint != null && latestTrendPoint.temp >= FEVER_THRESHOLD_C - 0.5
                ? 'text-amber-600'
                : 'text-emerald-600',
          data: temperatureData,
          lineColor: '#DC2626',
          fillStartColor: 'rgba(220, 38, 38, 0.20)',
          fillEndColor: 'rgba(248, 113, 113, 0.04)',
          loadingColor: '#DC2626',
          thresholdText: `Fever threshold at ${FEVER_THRESHOLD_C.toFixed(1)}°C`,
        })}

        {renderTrendChartCard({
          title: 'Activity',
          latestValue: latestTrendPoint ? latestTrendPoint.activityIntensity.toFixed(2) : '--',
          latestLabel: 'Movement intensity trend',
          status: getActivityStatus(latestTrendPoint?.activityIntensity),
          statusClassName:
            latestTrendPoint != null && latestTrendPoint.activityIntensity < 1.05
              ? 'text-amber-600'
              : latestTrendPoint != null && latestTrendPoint.activityIntensity >= 2
                ? 'text-sky-700'
                : 'text-emerald-600',
          data: activityData,
          lineColor: '#0284C7',
          fillStartColor: 'rgba(2, 132, 199, 0.24)',
          fillEndColor: 'rgba(56, 189, 248, 0.05)',
          loadingColor: '#0284C7',
          thresholdText: 'Low under 1.05 • High at 2.00+',
        })}


        {/* Events & Alerts Section */}
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

    </View>
  );
};

export default Analyze;
