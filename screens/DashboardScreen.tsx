import { Text, View, ActivityIndicator, Modal, TouchableOpacity, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBLEContext } from '../providers/BLEProvider';
import { useEffect, useState } from 'react';

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
  status: string;
  onNavigateToAnalyze?: () => void;
}

const LivestockItem = ({ id, temp, feedingPostureDetected, pitchAngle, status, onNavigateToAnalyze }: LivestockItemProps) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [weight, setWeight] = useState('');
  const [isEditingWeight, setIsEditingWeight] = useState(false);

  // Logic to determine feeding status based on pitch angle and feed
  const getFeedingStatus = () => {
    // Head down = pitch angle < 45 degrees (eating posture)
    const isHeadDown = pitchAngle < 45;
    const isFeedingActive = feedingPostureDetected;

    if (isHeadDown && isFeedingActive) {
      return {
        label: 'Eating',
        icon: 'restaurant',
        color: '#10b981',
        bgColor: '#d1fae5',
      };
    } else if (status === 'Active') {
      return {
        label: 'Moving',
        icon: 'fitness',
        color: '#3b82f6',
        bgColor: '#dbeafe',
      };
    } else {
      return {
        label: 'Resting',
        icon: 'bed',
        color: '#6b7280',
        bgColor: '#f3f4f6',
      };
    }
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
                name={getFeedingStatus().icon as any}
                size={20}
                color={getFeedingStatus().color}
                style={{ marginRight: 6 }}
              />
              <Text className="text-base font-semibold" style={{ color: getFeedingStatus().color }}>
                {getFeedingStatus().label}
              </Text>
            </View>
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
    allDevices,
    connectToDevice,
    connectedDevice,
    connectedDeviceName,
    receivedData,
  } = useBLEContext();

  const [isScanning, setIsScanning] = useState(false);

  // BLE scanning is now handled from Profile screen only
  // No auto-scanning on Dashboard mount

  useEffect(() => {
    // Auto-connect to the first found device (which should be PigFit_Device due to filtering)
    if (allDevices.length > 0 && !connectedDevice) {
      connectToDevice(allDevices[0]);
      setIsScanning(false);
    }
  }, [allDevices, connectedDevice]);

  // Derive status from activityIntensity (pre-computed on Arduino)
  const getStatus = (activityIntensity: number) => {
    if (activityIntensity > 1.5) return 'Active';
    if (activityIntensity > 1.1) return 'Eating';
    return 'Resting';
  };

  const currentStatus = receivedData 
    ? getStatus(receivedData.activityIntensity) 
    : 'Waiting...';

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
              id="LIVE-PIG-01"
              temp={receivedData.temp}
              feedingPostureDetected={receivedData.feedingPostureDetected}
              pitchAngle={receivedData.pitchAngle}
              status={currentStatus}
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
