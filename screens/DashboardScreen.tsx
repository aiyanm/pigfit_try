import { Text, View, ActivityIndicator, Modal, TouchableOpacity, Pressable, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBLEContext } from '../providers/BLEProvider';
import { useEffect, useState } from 'react';
import {
  cancelFeedingConfirmation,
  getActiveFeedingConfirmationSession,
  startFeedingConfirmation,
  subscribeToFeedingConfirmation,
} from '../services/feeding/feedingConfirmationService';
import type { FeedingConfirmationSession } from '../services/core/types';

const PIG_ID = 'LIVE-PIG-01';

const formatRemainingTime = (expiresAt: number, now: number): string => {
  const remainingMs = Math.max(0, expiresAt - now);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

interface StatusCardProps {
  label: string;
  value: string;
  color: string;
  bgColor: string;
}

const StatusCard = ({ label, value, color, bgColor }: StatusCardProps) => (
  <View className="w-[32%] p-4 rounded-lg shadow-sm" style={{ backgroundColor: bgColor }}>
    <Text className="text-xs text-gray-500 font-medium mb-1">{label}</Text>
    <Text className="text-base font-bold" style={{ color }}>{value}</Text>
  </View>
);

interface LivestockItemProps {
  id: string;
  temp: number;
  feedingPostureDetected: boolean;
  pitchAngle: number;
  status: string;
  feedingSession: FeedingConfirmationSession | null;
  currentTime: number;
  onStartFeeding: () => void;
  onCancelFeeding: () => void;
}

const LivestockItem = ({
  id,
  temp,
  feedingPostureDetected,
  pitchAngle,
  status,
  feedingSession,
  currentTime,
  onStartFeeding,
  onCancelFeeding,
}: LivestockItemProps) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [age, setAge] = useState('');
  const [isEditingAge, setIsEditingAge] = useState(false);
  const [weight, setWeight] = useState('');
  const [isEditingWeight, setIsEditingWeight] = useState(false);

  const isManualConfirmationActive = Boolean(feedingSession?.isActive);
  const canConfirmFeeding = feedingPostureDetected && !isManualConfirmationActive;

  const getFeedingStatus = () => {
    if (isManualConfirmationActive) {
      return {
        label: 'Confirmed Feeding',
        helper: `Manual confirmation active for ${formatRemainingTime(feedingSession!.expiresAt, currentTime)}`,
        icon: 'restaurant',
        color: '#10b981',
      };
    }

    if (feedingPostureDetected) {
      return {
        label: 'Ready to Confirm',
        helper: 'Threshold met. Tap Feeding to confirm a 5-minute feeding window.',
        icon: 'checkmark-circle',
        color: '#d97706',
      };
    }

    return {
      label: 'Monitoring',
      helper: 'Waiting for feeding posture threshold to be met.',
      icon: 'pulse-outline',
      color: '#6b7280',
    };
  };

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

  const getTempStyles = () => {
    if (temp > 39.0) {
      return { color: '#dc3545', bgColor: '#f8d7da' };
    }
    if (temp < 38.0) {
      return { color: '#3498db', bgColor: '#eaf6ff' };
    }
    return { color: '#696969', bgColor: '#696969' };
  };

  const { color: statusColor } = getStatusStyles();
  const { color: tempColor } = getTempStyles();
  const feedingStatus = getFeedingStatus();
  const statusPillColor =
    status === 'Active'
      ? { backgroundColor: '#DBEAFE', color: '#1D4ED8' }
      : status === 'Resting'
        ? { backgroundColor: '#E5E7EB', color: '#374151' }
        : { backgroundColor: '#DCFCE7', color: '#166534' };

  return (
    <>
      <TouchableOpacity
        className="p-4 border-b border-gray-200"
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <View className="flex-row justify-between items-center mb-2.5">
          <Text className="text-base font-semibold text-gray-800">{id}</Text>
        </View>

        <View className="flex-row justify-between">
          <View className="flex-1">
            <Text className="text-xs text-gray-500">Temp</Text>
            <Text className="text-base font-semibold mt-1" style={{ color: tempColor }}>
              {temp.toFixed(1)}°C
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-xs text-gray-500">Activity</Text>
            <Text className="text-base font-semibold mt-1" style={{ color: statusColor }}>
              {status}
            </Text>
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
          </View>
        </View>
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(17, 24, 39, 0.45)' }}>
          <View className="bg-white rounded-t-3xl" style={{ maxHeight: '88%' }}>
            <ScrollView contentContainerStyle={{ padding: 24 }}>
              <View className="flex-row justify-between items-start mb-6">
                <View className="flex-1 pr-4">
                  <Text className="text-2xl font-bold text-gray-900">Pig Details</Text>
                  <View className="flex-row items-center mt-3">
                    <Text className="text-lg font-semibold text-gray-900 mr-3">{id}</Text>
                    <View className="px-3 py-1 rounded-full" style={{ backgroundColor: '#DCFCE7' }}>
                      <Text className="text-xs font-semibold" style={{ color: '#166534' }}>
                        Live
                      </Text>
                    </View>
                  </View>
                  <Text className="text-sm text-gray-500 mt-2">Manual profile data and live sensor readings</Text>
                </View>
                <Pressable onPress={() => setModalVisible(false)}>
                  <Text className="text-xl font-semibold" style={{ color: '#6B7280' }}>Close</Text>
                </Pressable>
              </View>

              <View className="p-5 bg-white rounded-2xl mb-4" style={{ borderWidth: 1, borderColor: '#E5E7EB' }}>
                <Text className="text-lg font-semibold text-gray-900 mb-4">Profile</Text>

                <View className="flex-row justify-between items-center py-3 border-b border-gray-100">
                  <Text className="text-sm font-medium text-gray-500">Pig ID</Text>
                  <Text className="text-base font-semibold text-gray-900">{id}</Text>
                </View>

                <View className="flex-row justify-between items-center py-3 border-b border-gray-100">
                  <Text className="text-sm font-medium text-gray-500">Age</Text>
                  {isEditingAge ? (
                    <TextInput
                      className="text-base font-semibold text-gray-900 text-right min-w-[96px]"
                      value={age}
                      onChangeText={setAge}
                      placeholder="e.g. 2 years"
                      autoFocus
                      onBlur={() => setIsEditingAge(false)}
                      style={{ padding: 0, margin: 0 }}
                    />
                  ) : (
                    <TouchableOpacity onPress={() => setIsEditingAge(true)} activeOpacity={0.7}>
                      <Text className="text-base font-semibold text-gray-900">
                        {age.trim().length > 0 ? age : 'Not set'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View className="flex-row justify-between items-center py-3">
                  <Text className="text-sm font-medium text-gray-500">Weight</Text>
                  {isEditingWeight ? (
                    <TextInput
                      className="text-base font-semibold text-gray-900 text-right min-w-[96px]"
                      value={weight}
                      onChangeText={setWeight}
                      keyboardType="numeric"
                      autoFocus
                      onBlur={() => setIsEditingWeight(false)}
                      style={{ padding: 0, margin: 0 }}
                    />
                  ) : (
                    <TouchableOpacity onPress={() => setIsEditingWeight(true)} activeOpacity={0.7}>
                      <Text className="text-base font-semibold text-gray-900">
                        {weight.trim().length > 0 ? `${weight} kg` : 'Not set'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View className="p-5 bg-white rounded-2xl mb-4" style={{ borderWidth: 1, borderColor: '#E5E7EB' }}>
                <Text className="text-lg font-semibold text-gray-900 mb-4">Live Monitoring</Text>

                <View className="flex-row justify-between items-center py-3 border-b border-gray-100">
                  <Text className="text-sm font-medium text-gray-500">Body Temperature</Text>
                  <Text className="text-base font-semibold" style={{ color: tempColor }}>
                    {temp.toFixed(1)}°C
                  </Text>
                </View>

                <View className="flex-row justify-between items-center py-3 border-b border-gray-100">
                  <Text className="text-sm font-medium text-gray-500">Activity State</Text>
                  <View className="px-3 py-1 rounded-full" style={{ backgroundColor: statusPillColor.backgroundColor }}>
                    <Text className="text-xs font-semibold" style={{ color: statusPillColor.color }}>
                      {status}
                    </Text>
                  </View>
                </View>

                <View className="flex-row justify-between items-center py-3 border-b border-gray-100">
                  <Text className="text-sm font-medium text-gray-500">Feeding State</Text>
                  <Text className="text-base font-semibold" style={{ color: feedingStatus.color }}>
                    {feedingStatus.label}
                  </Text>
                </View>

                <View className="flex-row justify-between items-center py-3">
                  <Text className="text-sm font-medium text-gray-500">Pitch Angle</Text>
                  <Text className="text-base font-semibold text-gray-900">{pitchAngle.toFixed(1)}°</Text>
                </View>
              </View>

              <View className="p-5 bg-white rounded-2xl mb-2" style={{ borderWidth: 1, borderColor: '#E5E7EB' }}>
                <Text className="text-lg font-semibold text-gray-900 mb-2">Manual Feeding Confirmation</Text>
                <Text className="text-sm text-gray-500 mb-4">{feedingStatus.helper}</Text>

                {isManualConfirmationActive ? (
                  <>
                    <View className="rounded-2xl px-4 py-4 mb-4" style={{ backgroundColor: '#ECFDF5' }}>
                      <Text className="text-sm font-medium" style={{ color: '#047857' }}>
                        Feeding confirmed
                      </Text>
                      <Text className="text-2xl font-bold mt-1" style={{ color: '#065F46' }}>
                        {formatRemainingTime(feedingSession!.expiresAt, currentTime)}
                      </Text>
                      <Text className="text-sm mt-2" style={{ color: '#047857' }}>
                        This 5-minute window counts as a manual feeding confirmation.
                      </Text>
                    </View>

                    <TouchableOpacity
                      className="rounded-xl py-3 items-center"
                      style={{ backgroundColor: '#EF4444' }}
                      onPress={onCancelFeeding}
                    >
                      <Text className="text-white font-semibold">Cancel Feeding Window</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <View className="rounded-2xl px-4 py-4 mb-4" style={{ backgroundColor: canConfirmFeeding ? '#FFF7ED' : '#F3F4F6' }}>
                      <Text className="text-sm font-medium" style={{ color: canConfirmFeeding ? '#C2410C' : '#4B5563' }}>
                        {canConfirmFeeding ? 'Threshold met' : 'Threshold not met'}
                      </Text>
                      <Text className="text-sm mt-2" style={{ color: canConfirmFeeding ? '#9A3412' : '#6B7280' }}>
                        {canConfirmFeeding
                          ? 'You can start a 5-minute manual feeding confirmation now.'
                          : 'The button unlocks when the live feeding posture threshold is detected.'}
                      </Text>
                    </View>

                    <TouchableOpacity
                      className="rounded-xl py-3 items-center"
                      style={{ backgroundColor: canConfirmFeeding ? '#2563EB' : '#93C5FD' }}
                      onPress={onStartFeeding}
                      disabled={!canConfirmFeeding}
                    >
                      <Text className="text-white font-semibold">Confirm Feeding</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

export default function DashboardScreen() {
  const {
    connectedDevice,
    connectedDeviceName,
    receivedData,
    connectionStatus,
    reconnectAttemptCount,
  } = useBLEContext();

  const [feedingSession, setFeedingSession] = useState<FeedingConfirmationSession | null>(() =>
    getActiveFeedingConfirmationSession(PIG_ID)
  );
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const unsubscribe = subscribeToFeedingConfirmation(PIG_ID, (session) => {
      setFeedingSession(session);
      setCurrentTime(Date.now());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!feedingSession?.isActive) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
      const activeSession = getActiveFeedingConfirmationSession(PIG_ID);
      setFeedingSession(activeSession);
    }, 1000);

    return () => clearInterval(interval);
  }, [feedingSession]);

  const handleStartFeeding = () => {
    if (!receivedData?.feedingPostureDetected) {
      return;
    }
    const session = startFeedingConfirmation(PIG_ID);
    setFeedingSession(session);
    setCurrentTime(Date.now());
  };

  const handleCancelFeeding = () => {
    cancelFeedingConfirmation(PIG_ID);
    setFeedingSession(null);
    setCurrentTime(Date.now());
  };

  const getStatus = (activityIntensity: number) => {
    if (activityIntensity > 1.5) return 'Active';
    if (activityIntensity > 1.1) return 'Moving';
    return 'Resting';
  };

  const currentStatus = receivedData ? getStatus(receivedData.activityIntensity) : 'Waiting...';
  const healthIndex = receivedData ? 'Good' : '--';
  const emptyLiveDataMessage = connectedDevice ? 'Waiting for data...' : 'No live device connected.';
  const connectionLabel =
    connectionStatus === 'reconnecting'
      ? `Reconnecting to ${connectedDeviceName || 'PigFit Device'}${reconnectAttemptCount > 0 ? ` (attempt ${reconnectAttemptCount})` : ''}`
      : connectedDevice
        ? `Connected to ${connectedDeviceName || connectedDevice.name}`
        : 'No device connected';

  return (
    <View className="flex-1 bg-gray-100">
      <View className="flex-row justify-between items-center px-5 pt-12 pb-4 bg-white">
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-800">Farm Monitor</Text>
          <Text className="text-sm text-gray-500 mt-1">
            {connectionLabel}
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
              feedingPostureDetected={receivedData.feedingPostureDetected}
              pitchAngle={receivedData.pitchAngle}
              status={currentStatus}
              feedingSession={feedingSession}
              currentTime={currentTime}
              onStartFeeding={handleStartFeeding}
              onCancelFeeding={handleCancelFeeding}
            />
          ) : (
            <View className="p-5 items-center">
              {connectedDevice ? <ActivityIndicator size="large" color="#3498db" /> : null}
              <Text className="mt-2.5 text-gray-600">{emptyLiveDataMessage}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
