import { Text, View, ActivityIndicator, Modal, TouchableOpacity, Pressable, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBLEContext } from '../providers/BLEProvider';
import { useEffect, useState } from 'react';
import { DEFAULT_FEEDING_SCHEDULE, isWithinFeedingWindow } from '../services/diagnostics/metricsService';
import { dbService } from '../services/storage/db/client';
import type { FeedingSchedule } from '../services/core/types';

interface StatusCardProps {
  label: string;
  value: string;
  color: string;
  bgColor: string;
}

interface FeedingPresentation {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

interface LivestockItemProps {
  id: string;
  temp: number;
  feedingLabel: string;
  feedingIcon: keyof typeof Ionicons.glyphMap;
  feedingColor: string;
  status: string;
  onPress: () => void;
}

const PIG_ID = 'LIVE-PIG-01';
const MAX_FEEDINGS_PER_DAY = 6;

const StatusCard = ({ label, value, color, bgColor }: StatusCardProps) => (
  <View className="w-[32%] p-4 rounded-lg shadow-sm" style={{ backgroundColor: bgColor }}>
    <Text className="text-xs text-gray-500 font-medium mb-1">{label}</Text>
    <Text className="text-base font-bold" style={{ color }}>{value}</Text>
  </View>
);

const getStatusStyles = (status: string) => {
  switch (status) {
    case 'Eating':
      return { color: '#10b981', bgColor: '#d1fae5' };
    case 'Active':
      return { color: '#3b82f6', bgColor: '#dbeafe' };
    default:
      return { color: '#6c757d', bgColor: '#e9ecef' };
  }
};

const getTempStyles = (temp: number) => {
  if (temp > 39.0) {
    return { color: '#dc3545', bgColor: '#f8d7da' };
  }
  if (temp < 38.0) {
    return { color: '#3498db', bgColor: '#eaf6ff' };
  }
  return { color: '#696969', bgColor: '#696969' };
};

const LivestockItem = ({
  id,
  temp,
  feedingLabel,
  feedingIcon,
  feedingColor,
  status,
  onPress,
}: LivestockItemProps) => {
  const { color: statusColor } = getStatusStyles(status);
  const { color: tempColor } = getTempStyles(temp);

  return (
    <TouchableOpacity className="p-4 border-b border-gray-200" onPress={onPress} activeOpacity={0.7}>
      <View className="flex-row justify-between items-center mb-2.5">
        <Text className="text-base font-semibold text-gray-800">{id}</Text>
      </View>

      <View className="flex-row justify-between">
        <View className="flex-1">
          <Text className="text-xs text-gray-500">Temp</Text>
          <Text className="text-base font-semibold mt-1" style={{ color: tempColor }}>{temp.toFixed(1)}°C</Text>
        </View>
        <View className="flex-1">
          <Text className="text-xs text-gray-500">Activity</Text>
          <Text className="text-base font-semibold mt-1" style={{ color: statusColor }}>{status}</Text>
        </View>
        <View className="flex-1 pr-2">
          <Text className="text-xs text-gray-500">Feeding</Text>
          <View className="flex-row items-center mt-1">
            <Ionicons name={feedingIcon} size={20} color={feedingColor} style={{ marginRight: 6 }} />
            <Text className="text-sm font-semibold" style={{ color: feedingColor, flexShrink: 1 }}>
              {feedingLabel}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const parseStoredSchedule = (stored: any | null): FeedingSchedule => {
  if (!stored) {
    return {
      ...DEFAULT_FEEDING_SCHEDULE,
      pigId: PIG_ID,
    };
  }

  let feedingTimes = DEFAULT_FEEDING_SCHEDULE.feedingTimes;
  try {
    const parsedTimes = JSON.parse(String(stored.feeding_times ?? '[]'));
    if (Array.isArray(parsedTimes) && parsedTimes.length > 0) {
      feedingTimes = parsedTimes.map((value) => String(value));
    }
  } catch {}

  return {
    pigId: PIG_ID,
    feedingsPerDay: Number(stored.feedings_per_day ?? DEFAULT_FEEDING_SCHEDULE.feedingsPerDay),
    feedingTimes,
    feedingWindowBeforeMinutes: Number(
      stored.feeding_window_before_minutes ?? DEFAULT_FEEDING_SCHEDULE.feedingWindowBeforeMinutes
    ),
    feedingWindowAfterMinutes: Number(
      stored.feeding_window_after_minutes ?? DEFAULT_FEEDING_SCHEDULE.feedingWindowAfterMinutes
    ),
  };
};

const normalizeDraftTimes = (times: string[], count: number): string[] => {
  const trimmed = times.slice(0, count).map((value) => value.trim());
  while (trimmed.length < count) {
    trimmed.push('');
  }
  return trimmed;
};

const normalizeTimeValue = (value: string): string => {
  const [hours, minutes] = value.split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
};

const isValidTime = (value: string): boolean => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);

const getLiveStatus = (
  feedingPostureDetected: boolean,
  withinFeedingWindow: boolean,
  activityIntensity: number
): 'Eating' | 'Active' | 'Resting' => {
  if (feedingPostureDetected && withinFeedingWindow) return 'Eating';
  if (activityIntensity >= 1.5) return 'Active';
  return 'Resting';
};

const getFeedingPresentation = (
  feedingPostureDetected: boolean,
  withinFeedingWindow: boolean,
  activityIntensity: number
): FeedingPresentation => {
  if (feedingPostureDetected && withinFeedingWindow) {
    return { label: 'Eating', icon: 'restaurant', color: '#10b981' };
  }
  if (feedingPostureDetected) {
    return { label: 'Head Down (Outside Feeding Time)', icon: 'time', color: '#f59e0b' };
  }
  if (activityIntensity >= 1.5) {
    return { label: 'Moving', icon: 'fitness', color: '#3b82f6' };
  }
  return { label: 'Not Eating', icon: 'bed', color: '#6b7280' };
};

export default function DashboardScreen({ navigation }: any) {
  const {
    allDevices,
    connectToDevice,
    connectedDevice,
    connectedDeviceName,
    receivedData,
  } = useBLEContext();

  const [isScanning, setIsScanning] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [weight, setWeight] = useState('');
  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [schedule, setSchedule] = useState<FeedingSchedule>({ ...DEFAULT_FEEDING_SCHEDULE, pigId: PIG_ID });
  const [feedingCount, setFeedingCount] = useState(DEFAULT_FEEDING_SCHEDULE.feedingsPerDay);
  const [feedingTimesDraft, setFeedingTimesDraft] = useState<string[]>(
    normalizeDraftTimes(DEFAULT_FEEDING_SCHEDULE.feedingTimes, DEFAULT_FEEDING_SCHEDULE.feedingsPerDay)
  );
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleFeedback, setScheduleFeedback] = useState<string | null>(null);

  const loadSchedule = async () => {
    setScheduleLoading(true);
    setScheduleFeedback(null);
    try {
      const stored = await dbService.getFeedingSchedule(PIG_ID);
      const nextSchedule = parseStoredSchedule(stored);
      setSchedule(nextSchedule);
      setFeedingCount(nextSchedule.feedingsPerDay);
      setFeedingTimesDraft(normalizeDraftTimes(nextSchedule.feedingTimes, nextSchedule.feedingsPerDay));
    } catch (error) {
      console.error('❌ Failed to load feeding schedule:', error);
      setScheduleFeedback('Unable to load feeding schedule.');
    } finally {
      setScheduleLoading(false);
    }
  };

  useEffect(() => {
    if (allDevices.length > 0 && !connectedDevice) {
      connectToDevice(allDevices[0]);
      setIsScanning(false);
    }
  }, [allDevices, connectedDevice]);

  useEffect(() => {
    loadSchedule().catch(() => undefined);
  }, []);

  const handleOpenModal = () => {
    setModalVisible(true);
    loadSchedule().catch(() => undefined);
  };

  const handleFeedingCountChange = (nextCount: number) => {
    const clamped = Math.min(MAX_FEEDINGS_PER_DAY, Math.max(1, nextCount));
    setFeedingCount(clamped);
    setFeedingTimesDraft((current) => normalizeDraftTimes(current, clamped));
    setScheduleFeedback(null);
  };

  const handleTimeChange = (index: number, value: string) => {
    setFeedingTimesDraft((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    setScheduleFeedback(null);
  };

  const handleSaveSchedule = async () => {
    const normalizedTimes = normalizeDraftTimes(feedingTimesDraft, feedingCount).map((value) => value.trim());

    if (normalizedTimes.some((value) => value.length === 0)) {
      setScheduleFeedback('Please enter all feeding times before saving.');
      return;
    }

    if (normalizedTimes.some((value) => !isValidTime(value))) {
      setScheduleFeedback('Use 24-hour HH:mm format for each feeding time.');
      return;
    }

    const sortedTimes = normalizedTimes.map(normalizeTimeValue).sort();
    if (new Set(sortedTimes).size !== sortedTimes.length) {
      setScheduleFeedback('Feeding times must be unique.');
      return;
    }

    const nextSchedule: FeedingSchedule = {
      pigId: PIG_ID,
      feedingsPerDay: feedingCount,
      feedingTimes: sortedTimes,
      feedingWindowBeforeMinutes: schedule.feedingWindowBeforeMinutes,
      feedingWindowAfterMinutes: schedule.feedingWindowAfterMinutes,
    };

    setScheduleSaving(true);
    try {
      await dbService.upsertFeedingSchedule({
        pig_id: nextSchedule.pigId,
        feedings_per_day: nextSchedule.feedingsPerDay,
        feeding_times: JSON.stringify(nextSchedule.feedingTimes),
        feeding_window_before_minutes: nextSchedule.feedingWindowBeforeMinutes,
        feeding_window_after_minutes: nextSchedule.feedingWindowAfterMinutes,
      });
      setSchedule(nextSchedule);
      setFeedingTimesDraft(normalizeDraftTimes(nextSchedule.feedingTimes, nextSchedule.feedingsPerDay));
      setScheduleFeedback('Feeding schedule saved.');
    } catch (error) {
      console.error('❌ Failed to save feeding schedule:', error);
      setScheduleFeedback('Unable to save feeding schedule.');
    } finally {
      setScheduleSaving(false);
    }
  };

  const withinFeedingWindow = receivedData ? isWithinFeedingWindow(Date.now(), schedule) : false;
  const currentStatus = receivedData
    ? getLiveStatus(receivedData.feedingPostureDetected, withinFeedingWindow, receivedData.activityIntensity)
    : 'Waiting...';
  const feedingPresentation = receivedData
    ? getFeedingPresentation(receivedData.feedingPostureDetected, withinFeedingWindow, receivedData.activityIntensity)
    : ({ label: 'Waiting for data', icon: 'time', color: '#9ca3af' } as FeedingPresentation);
  const healthIndex = receivedData ? 'Good' : '--';

  return (
    <View className="flex-1 bg-gray-100">
      <View className="flex-row justify-between items-center px-5 pt-12 pb-4 bg-white">
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-800">Farm Monitor</Text>
          <Text className="text-sm text-gray-500 mt-1">
            {connectedDevice ? `Connected to ${connectedDeviceName || connectedDevice.name}` : 'No device connected'}
          </Text>
        </View>
      </View>

      <View className="px-5">
        <Text className="text-lg font-semibold text-gray-700 mt-5 mb-2.5">Current Status</Text>
        <View className="flex-row justify-between mb-5">
          <StatusCard label="Health Index" value={healthIndex} color="#ffc107" bgColor="#fffbe9" />
          <StatusCard
            label="Environment"
            value={receivedData ? `${receivedData.envTemp.toFixed(1)}°C` : '--'}
            color="#3498db"
            bgColor="#eaf6ff"
          />
          <StatusCard
            label="Humidity"
            value={receivedData ? `${receivedData.humidity.toFixed(0)}%` : '--'}
            color="#28a745"
            bgColor="#e5f3e5"
          />
        </View>

        <Text className="text-lg font-semibold text-gray-700 mt-5 mb-2.5">Live Data</Text>
        <View className="bg-white rounded-lg shadow-sm">
          {receivedData ? (
            <LivestockItem
              id={PIG_ID}
              temp={receivedData.temp}
              feedingLabel={feedingPresentation.label}
              feedingIcon={feedingPresentation.icon}
              feedingColor={feedingPresentation.color}
              status={currentStatus}
              onPress={handleOpenModal}
            />
          ) : (
            <View className="p-5 items-center">
              <ActivityIndicator size="large" color="#3498db" />
              <Text className="mt-2.5 text-gray-600">Waiting for data...</Text>
            </View>
          )}
        </View>
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <View className="bg-white rounded-t-3xl" style={{ maxHeight: '85%' }}>
            <ScrollView contentContainerStyle={{ padding: 24 }}>
              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-2xl font-bold text-gray-900">Breeder Details</Text>
                <Pressable onPress={() => setModalVisible(false)}>
                  <Text className="text-xl font-semibold" style={{ color: '#ef4444' }}>Close</Text>
                </Pressable>
              </View>

              <View className="flex-row justify-between items-center mb-6">
                <Text className="text-base text-gray-600">Pig ID:</Text>
                <Text className="text-xl font-bold" style={{ color: '#3b82f6' }}>{PIG_ID}</Text>
              </View>

              <View className="flex-row justify-between mb-6 gap-3">
                <TouchableOpacity
                  className="flex-1 p-4 bg-white rounded-xl"
                  onPress={() => setIsEditingWeight(true)}
                  activeOpacity={0.7}
                  style={{
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 3,
                  }}
                >
                  <Text className="text-sm text-gray-500 mb-1">Weight</Text>
                  {isEditingWeight ? (
                    <TextInput
                      className="text-2xl font-bold text-gray-900"
                      value={weight}
                      onChangeText={setWeight}
                      keyboardType="numeric"
                      autoFocus
                      onBlur={() => setIsEditingWeight(false)}
                      style={{ padding: 0, margin: 0 }}
                    />
                  ) : (
                    <Text className="text-2xl font-bold text-gray-900">{weight || '--'} kg</Text>
                  )}
                </TouchableOpacity>
                <View
                  className="flex-1 p-4 bg-white rounded-xl"
                  style={{
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 3,
                  }}
                >
                  <Text className="text-sm text-gray-500 mb-1">Health Score</Text>
                  <Text className="text-2xl font-bold text-gray-900">Excellent</Text>
                </View>
              </View>

              <View className="p-4 rounded-xl mb-4" style={{ backgroundColor: '#f8fafc' }}>
                <Text className="text-lg font-semibold mb-4" style={{ color: '#0f172a' }}>Feeding Schedule</Text>

                <View className="flex-row justify-between items-center mb-4">
                  <Text className="text-base font-medium text-gray-700">Feedings per day</Text>
                  <View className="flex-row items-center">
                    <TouchableOpacity
                      className="w-9 h-9 rounded-full items-center justify-center"
                      style={{ backgroundColor: '#e2e8f0' }}
                      onPress={() => handleFeedingCountChange(feedingCount - 1)}
                      disabled={scheduleSaving || scheduleLoading}
                    >
                      <Text className="text-xl font-bold text-gray-700">-</Text>
                    </TouchableOpacity>
                    <Text className="mx-4 text-lg font-semibold text-gray-900">{feedingCount}</Text>
                    <TouchableOpacity
                      className="w-9 h-9 rounded-full items-center justify-center"
                      style={{ backgroundColor: '#dbeafe' }}
                      onPress={() => handleFeedingCountChange(feedingCount + 1)}
                      disabled={scheduleSaving || scheduleLoading}
                    >
                      <Text className="text-xl font-bold" style={{ color: '#1d4ed8' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {scheduleLoading ? (
                  <View className="py-4 items-center">
                    <ActivityIndicator size="small" color="#3b82f6" />
                    <Text className="mt-2 text-gray-500">Loading saved schedule...</Text>
                  </View>
                ) : (
                  normalizeDraftTimes(feedingTimesDraft, feedingCount).map((time, index) => (
                    <View key={`feeding-time-${index}`} className="mb-3">
                      <Text className="text-sm text-gray-500 mb-1">Feeding Time {index + 1}</Text>
                      <TextInput
                        value={time}
                        onChangeText={(value) => handleTimeChange(index, value)}
                        placeholder="HH:mm"
                        autoCapitalize="none"
                        keyboardType="numbers-and-punctuation"
                        editable={!scheduleSaving}
                        className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900 bg-white"
                      />
                    </View>
                  ))
                )}

                <Text className="text-xs text-gray-500 mt-1">
                  Enter up to 6 feeding times in 24-hour HH:mm format. Eating is counted only when posture is
                  detected inside the saved feeding window.
                </Text>

                {scheduleFeedback ? (
                  <Text
                    className="mt-3 text-sm font-medium"
                    style={{ color: scheduleFeedback.includes('saved') ? '#15803d' : '#b91c1c' }}
                  >
                    {scheduleFeedback}
                  </Text>
                ) : null}

                <TouchableOpacity
                  className="mt-4 rounded-xl py-3 items-center"
                  style={{ backgroundColor: scheduleSaving ? '#93c5fd' : '#2563eb' }}
                  onPress={handleSaveSchedule}
                  disabled={scheduleSaving || scheduleLoading}
                  activeOpacity={0.8}
                >
                  <Text className="text-white text-base font-semibold">
                    {scheduleSaving ? 'Saving...' : 'Save Schedule'}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                className="p-4 rounded-xl mb-4"
                style={{ backgroundColor: '#dbeafe' }}
                onPress={() => {
                  setModalVisible(false);
                  navigation.navigate('Analyze');
                }}
                activeOpacity={0.7}
              >
                <Text className="text-lg font-semibold mb-4" style={{ color: '#1d4ed8' }}>Risk & Alerts</Text>
                <View className="flex-row flex-wrap gap-2">
                  <View className="px-4 py-2 rounded-full flex-row items-center" style={{ backgroundColor: '#fee2e2' }}>
                    <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: '#ef4444' }} />
                    <Text className="text-sm font-medium" style={{ color: '#991b1b' }}>Possible fever</Text>
                  </View>

                  <View className="px-4 py-2 rounded-full flex-row items-center" style={{ backgroundColor: '#d9f99d' }}>
                    <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: '#84cc16' }} />
                    <Text className="text-sm font-medium" style={{ color: '#3f6212' }}>Mild heat stress</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
