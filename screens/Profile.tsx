import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useBLE from '../useBLE';

// Device Item Component
interface DeviceItemProps {
  name: string;
  status: 'connected' | 'disconnected';
  onPress?: () => void;
}

const DeviceItem = ({ name, status, onPress }: DeviceItemProps) => {
  const isConnected = status === 'connected';
  
  return (
    <TouchableOpacity 
      className="flex-row items-center p-4 bg-white rounded-xl mb-3"
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Icon */}
      <View className="w-12 h-12 bg-blue-50 rounded-xl items-center justify-center mr-4">
        <Ionicons name="bluetooth" size={24} color="#3b82f6" />
      </View>
      
      {/* Device Info */}
      <View className="flex-1">
        <Text className="font-semibold text-gray-900 text-base">{name}</Text>
        <Text className={`text-sm ${isConnected ? 'text-gray-500' : 'text-gray-400'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </Text>
      </View>
      
      {/* Status Indicator and Arrow */}
      <View className="flex-row items-center">
        <View 
          className="w-3 h-3 rounded-full mr-3"
          style={{ backgroundColor: isConnected ? '#10b981' : '#9ca3af' }}
        />
        <Text className="text-gray-400 text-xl">›</Text>
      </View>
    </TouchableOpacity>
  );
};

export default function Profile() {
  const { connectedDevice } = useBLE();
  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="flex-row justify-between items-center px-5 pt-12 pb-4 bg-white">
        {/* Back Button - LEFT */}
        <TouchableOpacity className="p-2">
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
        
        {/* Title - CENTER */}
        <Text className="text-xl font-bold">My Profile</Text>
        
        {/* Edit Button - RIGHT */}
        <TouchableOpacity className="p-2">
          <Ionicons name="create-outline" size={24} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      {/* Profile Avatar Section */}
      <View className="items-center py-8 bg-white">
        {/* Circular Avatar */}
        <View className="w-32 h-32 rounded-full overflow-hidden mb-4">
          <Image 
            source={require('../assets/favicon.png')}
            className="w-full h-full"
          />
        </View>
  
        {/* Name */}
        <Text className="text-2xl font-bold text-gray-900">Juan dela Cruz</Text>
  
        {/* Role */}
        <Text className="text-base text-gray-500 mt-1">sampple@gmail.com</Text>
      </View>

      {/* Information Card */}
      <View className="mx-5 mt-4 bg-white rounded-2xl p-5 shadow-sm">
        {/* Farmer Name Row */}
        <View className="flex-row justify-between py-4 border-b border-gray-100">
          <Text className="text-gray-500">Farmer Name</Text>
          <Text className="font-semibold text-gray-900">Juan dela Cruz</Text>
        </View>
        
        {/* Farm Name Row */}
        <View className="flex-row justify-between py-4 border-b border-gray-100">
          <Text className="text-gray-500">Farm Name</Text>
          <Text className="font-semibold text-gray-900">Cruz Piggery</Text>
        </View>
        
        {/* Location Row */}
        <View className="flex-row justify-between py-4">
          <Text className="text-gray-500">Location</Text>
          <Text className="font-semibold text-gray-900">Batangas, Philippines</Text>
        </View>
      </View>

      {/* Device Management Section */}
      <View className="px-5 mt-6 mb-8">
        <Text className="text-xl font-bold text-gray-900 mb-4">Device Management</Text>
        
        {/* Show connected device if available */}
        {connectedDevice ? (
          <DeviceItem 
            name="LIVE-PIG-01" 
            status="connected"
            onPress={() => console.log('Navigate to device LIVE-PIG-01')}
          />
        ) : (
          <View className="p-4 bg-gray-50 rounded-xl mb-3">
            <Text className="text-gray-500 text-center">No devices connected</Text>
          </View>
        )}
        
        {/* Pair New Device Button */}
        <TouchableOpacity 
          className="flex-row items-center p-4 bg-white rounded-xl"
          activeOpacity={0.7}
          onPress={() => console.log('Pair new device')}
        >
          <View className="w-12 h-12 bg-blue-50 rounded-xl items-center justify-center mr-4">
            <Ionicons name="add" size={28} color="#3b82f6" />
          </View>
          
          <Text className="flex-1 font-semibold text-blue-500 text-base">
            Pair New Device
          </Text>
          
          <Text className="text-gray-400 text-xl">›</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}