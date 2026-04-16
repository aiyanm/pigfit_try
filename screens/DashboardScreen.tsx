import { Text, View, ActivityIndicator, Modal, TouchableOpacity, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBLEContext } from '../providers/BLEProvider';
import { useEffect, useState } from 'react';
import { DEFAULT_FEEDING_SCHEDULE, isWithinFeedingWindow } from '../services/diagnostics/metricsService';
import { dbService } from '../services/storage/db/client';
import type { FeedingSchedule } from '../services/core/types';

const PIG_ID = 'LIVE-PIG-01';
const FEEDING_TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const normalizeFeedingTimes = (feedingTimes: string[]): string[] => {
  const next = [...feedingTimes.slice(0, 2)];
  while (next.length < 2) {
    next.push('');
  }
  return next;
};

// --- STATUS CARD COMPONENT ---
interface StatusCardProps {
  label: string;
  value: string;
  color: string;
  bgColor: string;
}

const StatusCard = ({ label, value, color, bgColor }: StatusCardProps) => (
  <View className="w-[32%] p-4 rounded-lg shadow-sm" style={{ backgroundColor: bgColor }}>
    <Text className="text-xs text-gray-500 font-medium mb-1">{label}</Text>
    <Text className="text-base font-bold" style={{ color: color }}>{value}</Text>
  </View>
);

// --- LIVESTOCK ITEM COMPONENT ---
interface LivestockItemProps {
  id: string;
  temp: number;
  feedingPostureDetected: boolean;
  pitchAngle: number;
  withinFeedingWindow: boolean;
  feedingTimes: string[];
  status: string;
  onSaveFeedingTimes: (times: string[]) => Promise<void>;
  onNavigateToAnalyze?: () => void;
}

const LivestockItem = ({
  id,
  temp,
  feedingPostureDetected,
  pitchAngle,
  withinFeedingWindow,
  feedingTimes,
  status,
  onSaveFeedingTimes,
  onNavigateToAnalyze,
}: LivestockItemProps) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [weight, setWeight] = useState('');
  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [feedingTimeInputs, setFeedingTimeInputs] = useState<string[]>(() => normalizeFeedingTimes(feedingTimes));
  const [feedingScheduleError, setFeedingScheduleError] = useState<string | null>(null);
  const [feedingScheduleSuccess, setFeedingScheduleSuccess] = useState<string | null>(null);
  const [isSavingFeedingSchedule, setIsSavingFeedingSchedule] = useState(false);

  const isEatingNow = pitchAngle < 45 && feedingPostureDetected;

  useEffect(() => {
    if (modalVisible) {
      setFeedingTimeInputs(normalizeFeedingTimes(feedingTimes));
      setFeedingScheduleError(null);
      setFeedingScheduleSuccess(null);
    }
  }, [feedingTimes, modalVisible]);

  // Keep the main label schedule-based and only surface live eating during that window.
  const getFeedingStatus = () => {
    if (withinFeedingWindow) {
      return {
        label: 'Feeding',
        icon: 'restaurant',
        color: '#10b981',
        bgColor: '#d1fae5',
      };
    }

    return {
      label: 'Not Feeding',
      icon: 'time-outline',
      color: '#6b7280',
      bgColor: '#f3f4f6',
    };
  };

  // Logic to determine status color and styling
  const getStatusStyles = () => {
    switch (status) {
      case 'Active':
        return { color: '#28a745', bgColor: '#e5f3e5' };
      case 'Resting':
        return { color: '#6c757d', bgColor: '#e9ecef' };
      default:
        return { color: '#ffc107', bgColor: '#fff3cd' };
    }
  };

  // Logic to determine temperature color based on value
  const getTempStyles = () => {
    if (temp > 39.0) {
      return { color: '#dc3545', bgColor: '#f8d7da' }; // High - Red
    } else if (temp < 38.0) {
      return { color: '#3498db', bgColor: '#eaf6ff' }; // Low - Blue
    } else {
      return { color: '#696969 ', bgColor: '#696969 ' }; // Normal - grey
    }
  };

  const { color: statusColor, bgColor: statusBgColor } = getStatusStyles();
  const { color: tempColor, bgColor: tempBgColor } = getTempStyles();
  const feedingStatus = getFeedingStatus();
  const currentFeedingTimes = normalizeFeedingTimes(feedingTimes);

  const handleFeedingTimeChange = (index: number, value: string) => {
    setFeedingTimeInputs((current) => {
      const next = normalizeFeedingTimes(current);
      next[index] = value;
      return next;
    });
    setFeedingScheduleError(null);
    setFeedingScheduleSuccess(null);
  };

  const handleSaveFeedingTimes = async () => {
    const normalized = feedingTimeInputs.map((time) => time.trim());
    const hasInvalidTime = normalized.some((time) => !FEEDING_TIME_REGEX.test(time));

    if (hasInvalidTime) {
      setFeedingScheduleError('Enter both feeding times in HH:MM format.');
      setFeedingScheduleSuccess(null);
      return;
    }

    try {
      setIsSavingFeedingSchedule(true);
      await onSaveFeedingTimes(normalized);
      setFeedingScheduleSuccess('Feeding times saved.');
      setFeedingScheduleError(null);
    } catch (error) {
      console.error('Failed to save feeding times:', error);
      setFeedingScheduleError('Unable to save feeding times right now.');
      setFeedingScheduleSuccess(null);
    } finally {
      setIsSavingFeedingSchedule(false);
    }
  };

  return (
    <>
      <TouchableOpacity 
        className="p-4 border-b border-gray-200" 
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        {/* Pig ID and Status Header */}
        <View className="flex-row justify-between items-center mb-2.5">
          <Text className="text-base font-semibold text-gray-800">{id}</Text>
          {/* <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: statusBgColor }}>
            <Text className="text-xs font-semibold" style={{ color: statusColor }}>{status}</Text>
          </View> */}
        </View>

        {/* Sensor Data (Temperature, Activity, Feeding Status) */}
        <View className="flex-row justify-between">
          <View className="flex-1">
            <Text className="text-xs text-gray-500">Temp</Text>
            <Text className="text-base font-semibold mt-1" style={{ color: tempColor }}>{temp.toFixed(1)}°C</Text>
          </View>
          <View className="flex-1">
            <Text className="text-xs text-gray-500">Activity</Text>
            <Text className="text-base font-semibold mt-1" style={{ color: statusColor }}>{status}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-xs text-gray-500">Feeding</Text>
            <View className="flex-row items-center mt-1">
              <Ionicons
                name={feedingStatus.icon as any}
                size={20}
                color={feedingStatus.color}
                style={{ marginRight: 6 }}
              />
              <Text className="text-base font-semibold" style={{ color: feedingStatus.color }}>
                {feedingStatus.label}
              </Text>
            </View>
            {withinFeedingWindow && isEatingNow ? (
              <Text className="text-xs font-medium mt-1" style={{ color: feedingStatus.color }}>
                Eating now
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>

      {/* Modal for detailed view */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <View className="bg-white rounded-t-3xl p-6" style={{ minHeight: '50%' }}>
            
            {/* Modal Header */}
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-bold text-gray-900">Breeder Details</Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <Text className="text-xl font-semibold" style={{ color: '#ef4444' }}>Close</Text>
              </Pressable>
            </View>

            {/* Pig ID */}
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-base text-gray-600">Pig ID:</Text>
              <Text className="text-xl font-bold" style={{ color: '#3b82f6' }}>{id}</Text>
            </View>

            <View
              className="p-4 bg-white rounded-xl mb-6"
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 3,
              }}
            >
              <Text className="text-lg font-semibold text-gray-900 mb-3">Feeding Schedule</Text>
              <Text className="text-sm text-gray-500 mb-3">
                Current times: {currentFeedingTimes[0] || '--:--'} and {currentFeedingTimes[1] || '--:--'}
              </Text>

              <View className="mb-3">
                <Text className="text-sm text-gray-500 mb-2">Feeding Time 1</Text>
                <TextInput
                  className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900"
                  value={feedingTimeInputs[0]}
                  onChangeText={(value) => handleFeedingTimeChange(0, value)}
                  placeholder="06:00"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={5}
                />
              </View>

              <View className="mb-3">
                <Text className="text-sm text-gray-500 mb-2">Feeding Time 2</Text>
                <TextInput
                  className="border border-gray-300 rounded-xl px-4 py-3 text-base text-gray-900"
                  value={feedingTimeInputs[1]}
                  onChangeText={(value) => handleFeedingTimeChange(1, value)}
                  placeholder="16:00"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={5}
                />
              </View>

              {feedingScheduleError ? (
                <Text className="text-sm mb-3" style={{ color: '#dc2626' }}>{feedingScheduleError}</Text>
              ) : null}
              {feedingScheduleSuccess ? (
                <Text className="text-sm mb-3" style={{ color: '#16a34a' }}>{feedingScheduleSuccess}</Text>
              ) : null}

              <TouchableOpacity
                className="rounded-xl py-3 items-center"
                style={{ backgroundColor: isSavingFeedingSchedule ? '#93c5fd' : '#2563eb' }}
                onPress={handleSaveFeedingTimes}
                disabled={isSavingFeedingSchedule}
              >
                <Text className="text-white font-semibold">
                  {isSavingFeedingSchedule ? 'Saving...' : 'Save Feeding Times'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Weight and Health Score Row */}
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
                  <Text className="text-2xl font-bold text-gray-900">{weight} kg</Text>
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


            {/* Risk & Alerts Section */}
            <TouchableOpacity 
              className="p-4 rounded-xl mb-4" 
              style={{ backgroundColor: '#dbeafe'}}
              onPress={() => {
                setModalVisible(false);
                onNavigateToAnalyze?.();
              }}
              activeOpacity={0.7}
            >
              <Text className="text-lg font-semibold mb-4" style={{ color: '#1d4ed8' }}>Risk & Alerts</Text>
              
              {/* 2-column badge layout */}
              <View className="flex-row flex-wrap gap-2">
                
                {/* Possible fever - Red badge */}
                <View 
                  className="px-4 py-2 rounded-full flex-row items-center"
                  style={{ backgroundColor: '#fee2e2' }}
                >
                  <View 
                    className="w-2 h-2 rounded-full mr-2"
                    style={{ backgroundColor: '#ef4444' }}
                  />
                  <Text className="text-sm font-medium" style={{ color: '#991b1b' }}>Possible fever</Text>
                </View>

                {/* Mild heat stress - Yellow/Green badge */}
                <View 
                  className="px-4 py-2 rounded-full flex-row items-center"
                  style={{ backgroundColor: '#d9f99d' }}
                >
                  <View 
                    className="w-2 h-2 rounded-full mr-2"
                    style={{ backgroundColor: '#84cc16' }}
                  />
                  <Text className="text-sm font-medium" style={{ color: '#3f6212' }}>Mild heat stress</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );    
};

// --- DASHBOARD SCREEN COMPONENT ---
export default function DashboardScreen({ navigation }: any) {
  const {
    connectedDevice,
    connectedDeviceName,
    receivedData,
  } = useBLEContext();

  const [feedingSchedule, setFeedingSchedule] = useState<FeedingSchedule>(DEFAULT_FEEDING_SCHEDULE);

  useEffect(() => {
    const loadFeedingSchedule = async () => {
      try {
        const stored = await dbService.getFeedingSchedule(PIG_ID);
        if (!stored) {
          setFeedingSchedule({
            ...DEFAULT_FEEDING_SCHEDULE,
            pigId: PIG_ID,
          });
          return;
        }

        setFeedingSchedule({
          pigId: PIG_ID,
          feedingsPerDay: Number(stored.feedings_per_day ?? DEFAULT_FEEDING_SCHEDULE.feedingsPerDay),
          feedingTimes: JSON.parse(String(stored.feeding_times ?? '[]')),
          feedingWindowBeforeMinutes: Number(
            stored.feeding_window_before_minutes ?? DEFAULT_FEEDING_SCHEDULE.feedingWindowBeforeMinutes
          ),
          feedingWindowAfterMinutes: Number(
            stored.feeding_window_after_minutes ?? DEFAULT_FEEDING_SCHEDULE.feedingWindowAfterMinutes
          ),
        });
      } catch (error) {
        console.error('Failed to load feeding schedule:', error);
        setFeedingSchedule(DEFAULT_FEEDING_SCHEDULE);
      }
    };

    loadFeedingSchedule().catch((error) => {
      console.error('Failed to initialize feeding schedule:', error);
    });
  }, []);

  const handleSaveFeedingTimes = async (feedingTimes: string[]) => {
    const nextSchedule: FeedingSchedule = {
      pigId: PIG_ID,
      feedingsPerDay: 2,
      feedingTimes,
      feedingWindowBeforeMinutes: feedingSchedule.feedingWindowBeforeMinutes,
      feedingWindowAfterMinutes: feedingSchedule.feedingWindowAfterMinutes,
    };

    await dbService.upsertFeedingSchedule({
      pig_id: PIG_ID,
      feedings_per_day: 2,
      feeding_times: JSON.stringify(feedingTimes),
      feeding_window_before_minutes: nextSchedule.feedingWindowBeforeMinutes,
      feeding_window_after_minutes: nextSchedule.feedingWindowAfterMinutes,
    });

    setFeedingSchedule(nextSchedule);
  };

  // BLE scanning is now handled from Profile screen only
  // No auto-scanning on Dashboard mount

  // Derive status from activityIntensity (pre-computed on Arduino)
  const getStatus = (activityIntensity: number) => {
    if (activityIntensity > 1.5) return 'Active';
    if (activityIntensity > 1.1) return 'Eating';
    return 'Resting';
  };

  const currentStatus = receivedData 
    ? getStatus(receivedData.activityIntensity) 
    : 'Waiting...';
  const withinFeedingWindow = isWithinFeedingWindow(Date.now(), feedingSchedule);

  // Calculate health index placeholder
  const healthIndex = receivedData ? "Good" : "--";

  return (
    <View className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="flex-row justify-between items-center px-5 pt-12 pb-4 bg-white">
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-800">Farm Monitor</Text>
          <Text className="text-sm text-gray-500 mt-1">
            {connectedDevice ? `Connected to ${connectedDeviceName || connectedDevice.name}` : "No device connected"}
          </Text>
        </View>
      </View>
      
      {/* Content */}
      <View className="px-5">
      
      {/* --- Overall Status Section --- */}
      <Text className="text-lg font-semibold text-gray-700 mt-5 mb-2.5">Current Status</Text>
      <View className="flex-row justify-between mb-5">
        <StatusCard 
          label="Health Index" 
          value={healthIndex} 
          color="#ffc107" 
          bgColor="#fffbe9" 
        />
        <StatusCard 
          label="Environment" 
          value={receivedData ? `${receivedData.envTemp.toFixed(1)}°C` : "--"} 
          color="#3498db" 
          bgColor="#eaf6ff" 
        />
        <StatusCard 
          label="Humidity" 
          value={receivedData ? `${receivedData.humidity.toFixed(0)}%` : "--"} 
          color="#28a745" 
          bgColor="#e5f3e5" 
        />
      </View>

        {/* --- Livestock List Section --- */}
        <Text className="text-lg font-semibold text-gray-700 mt-5 mb-2.5">Live Data</Text>
        <View className="bg-white rounded-lg shadow-sm">
          {receivedData ? (
            <LivestockItem 
              id={PIG_ID}
              temp={receivedData.temp}
              feedingPostureDetected={receivedData.feedingPostureDetected}
              pitchAngle={receivedData.pitchAngle}
              withinFeedingWindow={withinFeedingWindow}
              feedingTimes={feedingSchedule.feedingTimes}
              status={currentStatus}
              onSaveFeedingTimes={handleSaveFeedingTimes}
              onNavigateToAnalyze={() => navigation.navigate('Analyze')}
            />
          ) : (
            <View className="p-5 items-center">
              <ActivityIndicator size="large" color="#3498db" />
              <Text className="mt-2.5 text-gray-600">Waiting for data...</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
