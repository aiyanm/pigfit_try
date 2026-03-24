import { View, Text, ScrollView, TouchableOpacity, Image, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import useBLE from '../useBLE';
import DeviceScanningModal from './components/DeviceScanningModal';

// Device Item Component with Inline Editing
interface DeviceItemProps {
  name: string;
  status: 'connected' | 'disconnected' | 'offline';
  onNameChange: (newName: string) => Promise<void>;
}

const DeviceItem = ({ name, status, onNameChange }: DeviceItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(name);
  const [isSaving, setIsSaving] = useState(false);
  const isConnected = status === 'connected';
  
  const handleSaveName = async () => {
    if (editedName.trim() === '') {
      Alert.alert('Invalid Name', 'Device name cannot be empty');
      setEditedName(name);
      return;
    }
    
    if (editedName.trim() === name) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onNameChange(editedName.trim());
      setIsEditing(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to update device name');
      setEditedName(name);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View className="flex-row items-center p-4 bg-white rounded-xl mb-3">
      {/* Icon */}
      <View className="w-12 h-12 bg-blue-50 rounded-xl items-center justify-center mr-4">
        <Ionicons name="bluetooth" size={24} color="#3b82f6" />
      </View>
      
      {/* Device Info */}
      {isEditing ? (
        <View className="flex-1 flex-row items-center">
          <TextInput
            className="flex-1 bg-blue-50 rounded-lg px-3 py-2 text-base text-gray-900 font-semibold"
            value={editedName}
            onChangeText={setEditedName}
            onSubmitEditing={handleSaveName}
            onBlur={handleSaveName}
            placeholder="Device name"
            editable={!isSaving}
            autoFocus
          />
          {isSaving && <ActivityIndicator animating size="small" color="#3b82f6" />}
        </View>
      ) : (
        <View className="flex-1">
          <TouchableOpacity onPress={() => setIsEditing(true)}>
            <Text className="font-semibold text-gray-900 text-base">{editedName}</Text>
          </TouchableOpacity>
          <Text className={`text-sm ${isConnected ? 'text-gray-500' : 'text-gray-400'}`}>
            {isConnected ? 'Connected' : status === 'offline' ? 'Offline' : 'Disconnected'}
          </Text>
        </View>
      )}
      
      {/* Status Indicator and Arrow */}
      <View className="flex-row items-center ml-2">
        <View 
          className="w-3 h-3 rounded-full mr-3"
          style={{ 
            backgroundColor: isConnected ? '#10b981' : status === 'offline' ? '#d1d5db' : '#9ca3af'
          }}
        />
        {!isEditing && <Text className="text-gray-400 text-xl">›</Text>}
      </View>
    </View>
  );
};

export default function Profile() {
  const { 
    connectedDevice, 
    connectedDeviceName,
    updateConnectedDeviceName,
    requestPermissions,
    scanForPeripherals,
    allDevices,
  } = useBLE();
  
  const [showScanningModal, setShowScanningModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const handlePairDevice = async () => {
    setShowScanningModal(true);
    setIsScanning(true);
    
    try {
      const granted = await requestPermissions();
      if (granted) {
        scanForPeripherals();
      } else {
        Alert.alert('Permission Denied', 'Bluetooth permissions are required to pair a device');
        setShowScanningModal(false);
        setIsScanning(false);
      }
    } catch (error) {
      console.error('Error requesting permissions:', error);
      setShowScanningModal(false);
      setIsScanning(false);
    }
  };

  const handleModalCancel = () => {
    setShowScanningModal(false);
    setIsScanning(false);
  };

  const handleModalConnected = () => {
    setShowScanningModal(false);
    setIsScanning(false);
  };

  // Monitor connectedDevice changes to update scanning state
  useEffect(() => {
    if (connectedDevice && isScanning) {
      setIsScanning(false);
    }
  }, [connectedDevice, isScanning]);
  
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
          <Ionicons name="create-outline" size={24} color="black" />
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
            name={connectedDeviceName || connectedDevice.name || 'PigFit Device'} 
            status="connected"
            onNameChange={updateConnectedDeviceName}
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
          onPress={handlePairDevice}
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

      {/* Device Scanning Modal */}
      <DeviceScanningModal
        isVisible={showScanningModal}
        isScanning={isScanning}
        onCancel={handleModalCancel}
        onConnected={handleModalConnected}
      />
    </ScrollView>
  );
}