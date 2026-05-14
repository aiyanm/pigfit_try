import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useBLEContext } from '../providers/BLEProvider';
import { dbService, type UserProfile } from '../services/storage/db/client';
import { PH_LOCATIONS_REGION_2 } from '../services/app/phLocations';
import DeviceScanningModal from './components/DeviceScanningModal';
import LocationPickerModal, { type LocationPickerValue } from './components/LocationPickerModal';

interface DeviceItemProps {
  name: string;
  status: 'connected' | 'disconnected' | 'offline';
  onNameChange: (newName: string) => Promise<void>;
}

const DEFAULT_USER_PROFILE: UserProfile = {
  farmer_name: 'Juan dela Cruz',
  email: 'sampple@gmail.com',
  farm_name: 'Cruz Piggery',
  location: 'Tuguegarao City, Cagayan',
};

const isValidEmail = (value: string): boolean => /\S+@\S+\.\S+/.test(value);

const parseStoredLocation = (location: string): LocationPickerValue | null => {
  const trimmed = location.trim();
  for (const provinceEntry of PH_LOCATIONS_REGION_2) {
    for (const locality of provinceEntry.localities) {
      if (`${locality.name}, ${provinceEntry.province}` === trimmed) {
        return {
          province: provinceEntry.province,
          cityMunicipality: locality.name,
        };
      }
    }
  }
  return null;
};

const DeviceItem = ({ name, status, onNameChange }: DeviceItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(name);
  const [isSaving, setIsSaving] = useState(false);
  const isConnected = status === 'connected';

  useEffect(() => {
    setEditedName(name);
  }, [name]);

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
    } catch {
      Alert.alert('Error', 'Failed to update device name');
      setEditedName(name);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View className="flex-row items-center p-4 bg-white rounded-xl mb-3">
      <View className="w-12 h-12 bg-blue-50 rounded-xl items-center justify-center mr-4">
        <Ionicons name="bluetooth" size={24} color="#3b82f6" />
      </View>

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

      <View className="flex-row items-center ml-2">
        <View
          className="w-3 h-3 rounded-full mr-3"
          style={{
            backgroundColor: isConnected ? '#10b981' : status === 'offline' ? '#d1d5db' : '#9ca3af',
          }}
        />
        {!isEditing && <Text className="text-gray-400 text-xl">›</Text>}
      </View>
    </View>
  );
};

export default function Profile() {
  const navigation = useNavigation<any>();
  const {
    connectedDevice,
    connectedDeviceName,
    updateConnectedDeviceName,
    requestPermissions,
    scanForPeripherals,
    cancelScan,
    scanStatus,
    connectionStatus,
    reconnectAttemptCount,
    bleError,
    clearBleError,
  } = useBLEContext();

  const [showScanningModal, setShowScanningModal] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_USER_PROFILE);
  const [draftProfile, setDraftProfile] = useState<UserProfile>(DEFAULT_USER_PROFILE);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setIsLoadingProfile(true);
      try {
        const existingProfile = await dbService.getUserProfile();
        const nextProfile = existingProfile ?? DEFAULT_USER_PROFILE;
        if (!existingProfile) {
          await dbService.upsertUserProfile(DEFAULT_USER_PROFILE);
        }
        if (!active) return;
        setProfile(nextProfile);
        setDraftProfile(nextProfile);
      } catch (error) {
        console.error('Error loading user profile:', error);
        if (!active) return;
        setProfile(DEFAULT_USER_PROFILE);
        setDraftProfile(DEFAULT_USER_PROFILE);
      } finally {
        if (active) setIsLoadingProfile(false);
      }
    };

    loadProfile();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!showScanningModal) return;

    if (connectionStatus === 'connected') {
      return;
    }

    if (scanStatus === 'timeout' || scanStatus === 'error' || connectionStatus === 'error') {
      setShowScanningModal(true);
    }
  }, [connectionStatus, scanStatus, showScanningModal]);

  const handlePairDevice = async () => {
    clearBleError();
    setShowScanningModal(true);

    try {
      const granted = await requestPermissions();
      if (!granted) {
        Alert.alert('Permission Denied', 'Bluetooth permissions are required to pair a device');
        setShowScanningModal(false);
        return;
      }

      try {
        await scanForPeripherals();
      } catch (error) {
        console.error('Error starting BLE scan:', error);
      }
    } catch (error) {
      console.error('Error requesting Bluetooth permissions:', error);
      setShowScanningModal(false);
    }
  };

  const handleModalCancel = () => {
    cancelScan();
    setShowScanningModal(false);
  };

  const handleModalConnected = () => {
    setShowScanningModal(false);
  };

  const handleEditPress = () => {
    setDraftProfile(profile);
    setIsEditingProfile(true);
  };

  const handleCancelEdit = () => {
    setDraftProfile(profile);
    setIsEditingProfile(false);
  };

  const handleBackPress = () => {
    if (isEditingProfile) {
      handleCancelEdit();
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('Dashboard');
  };

  const handleSaveProfile = async () => {
    const nextProfile: UserProfile = {
      farmer_name: draftProfile.farmer_name.trim(),
      email: draftProfile.email.trim(),
      farm_name: draftProfile.farm_name.trim(),
      location: draftProfile.location.trim(),
    };

    if (
      !nextProfile.farmer_name ||
      !nextProfile.email ||
      !nextProfile.farm_name ||
      !nextProfile.location
    ) {
      Alert.alert('Incomplete Profile', 'All profile fields are required.');
      return;
    }

    if (!isValidEmail(nextProfile.email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    if (!parseStoredLocation(nextProfile.location)) {
      Alert.alert('Invalid Location', 'Please select a province and city/municipality from Region II.');
      return;
    }

    setIsSavingProfile(true);
    try {
      await dbService.upsertUserProfile(nextProfile);
      setProfile(nextProfile);
      setDraftProfile(nextProfile);
      setIsEditingProfile(false);
    } catch (error) {
      console.error('Error saving user profile:', error);
      Alert.alert('Save Failed', 'Unable to save profile changes right now.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSelectLocation = ({ province, cityMunicipality }: LocationPickerValue) => {
    setDraftProfile((current) => ({
      ...current,
      location: `${cityMunicipality}, ${province}`,
    }));
    setShowLocationPicker(false);
  };

  const renderStaticRow = (label: string, value: string) => (
    <View className="flex-row justify-between py-4 border-b border-gray-100">
      <Text className="text-gray-500">{label}</Text>
      <Text className="font-semibold text-gray-900 flex-1 text-right ml-4">{value}</Text>
    </View>
  );

  const renderEditableInputRow = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    options?: { keyboardType?: 'default' | 'email-address'; autoCapitalize?: 'none' | 'words' | 'sentences' }
  ) => (
    <View className="py-4 border-b border-gray-100">
      <Text className="text-gray-500 mb-2">{label}</Text>
      <TextInput
        className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900"
        value={value}
        onChangeText={onChangeText}
        keyboardType={options?.keyboardType ?? 'default'}
        autoCapitalize={options?.autoCapitalize ?? 'sentences'}
        editable={!isSavingProfile}
      />
    </View>
  );

  const renderLocationRow = () => (
    <View className="py-4">
      <Text className="text-gray-500 mb-2">Location</Text>
      <TouchableOpacity
        className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex-row items-center justify-between"
        onPress={() => setShowLocationPicker(true)}
        disabled={isSavingProfile}
      >
        <Text className={`text-base ${draftProfile.location ? 'text-gray-900' : 'text-gray-400'}`}>
          {draftProfile.location || 'Select city/municipality and province'}
        </Text>
        <Ionicons name="chevron-forward" size={18} color="#6B7280" />
      </TouchableOpacity>
      <Text className="text-xs text-gray-500 mt-2">Region II (Cagayan Valley) locations only</Text>
    </View>
  );

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="flex-row justify-between items-center px-5 pt-12 pb-4 bg-white">
        <TouchableOpacity className="p-2" onPress={handleBackPress}>
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>

        <Text className="text-xl font-bold">My Profile</Text>

        {isEditingProfile ? (
          <View className="flex-row items-center">
            <TouchableOpacity className="px-2 py-1" onPress={handleSaveProfile} disabled={isSavingProfile}>
              {isSavingProfile ? (
                <ActivityIndicator size="small" color="#111827" />
              ) : (
                <Text className="text-sm font-semibold text-blue-600">Save</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity className="p-2" onPress={handleEditPress} disabled={isLoadingProfile}>
            <Ionicons name="create-outline" size={24} color="black" />
          </TouchableOpacity>
        )}
      </View>

      <View className="items-center py-8 bg-white">
        <View className="w-32 h-32 rounded-full overflow-hidden mb-4">
          <Image source={require('../assets/favicon.png')} className="w-full h-full" />
        </View>

        {isLoadingProfile ? (
          <ActivityIndicator size="small" color="#3b82f6" />
        ) : isEditingProfile ? (
          <View className="w-full px-5">
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-lg font-bold text-gray-900 text-center"
              value={draftProfile.farmer_name}
              onChangeText={(text) => setDraftProfile((current) => ({ ...current, farmer_name: text }))}
              autoCapitalize="words"
              editable={!isSavingProfile}
            />
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-500 text-center mt-3"
              value={draftProfile.email}
              onChangeText={(text) => setDraftProfile((current) => ({ ...current, email: text }))}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!isSavingProfile}
            />
          </View>
        ) : (
          <>
            <Text className="text-2xl font-bold text-gray-900">{profile.farmer_name}</Text>
            <Text className="text-base text-gray-500 mt-1">{profile.email}</Text>
          </>
        )}
      </View>

      <View className="mx-5 mt-4 bg-white rounded-2xl p-5 shadow-sm">
        {isEditingProfile ? (
          <>
            {renderEditableInputRow(
              'Farm Name',
              draftProfile.farm_name,
              (text) => setDraftProfile((current) => ({ ...current, farm_name: text })),
              { autoCapitalize: 'words' }
            )}
            {renderLocationRow()}
          </>
        ) : (
          <>
            {renderStaticRow('Farmer Name', profile.farmer_name)}
            {renderStaticRow('Farm Name', profile.farm_name)}
            <View className="flex-row justify-between py-4">
              <Text className="text-gray-500">Location</Text>
              <Text className="font-semibold text-gray-900 flex-1 text-right ml-4">{profile.location}</Text>
            </View>
          </>
        )}
      </View>

      <View className="px-5 mt-6 mb-8">
        <Text className="text-xl font-bold text-gray-900 mb-4">Device Management</Text>

        {connectedDevice ? (
          <DeviceItem
            name={connectedDeviceName || connectedDevice.name || 'PigFit Device'}
            status="connected"
            onNameChange={updateConnectedDeviceName}
          />
        ) : connectionStatus === 'reconnecting' ? (
          <View className="p-4 bg-blue-50 rounded-xl mb-3">
            <Text className="text-blue-700 text-center font-medium">
              Reconnecting to PigFit Device{reconnectAttemptCount > 0 ? ` (attempt ${reconnectAttemptCount})` : ''}
            </Text>
          </View>
        ) : (
          <View className="p-4 bg-gray-50 rounded-xl mb-3">
            <Text className="text-gray-500 text-center">No devices connected</Text>
          </View>
        )}

        <TouchableOpacity
          className="flex-row items-center p-4 bg-white rounded-xl"
          activeOpacity={0.7}
          onPress={handlePairDevice}
        >
          <View className="w-12 h-12 bg-blue-50 rounded-xl items-center justify-center mr-4">
            <Ionicons name="add" size={28} color="#3b82f6" />
          </View>

          <Text className="flex-1 font-semibold text-blue-500 text-base">Pair New Device</Text>

          <Text className="text-gray-400 text-xl">›</Text>
        </TouchableOpacity>
      </View>

      <LocationPickerModal
        isVisible={showLocationPicker}
        initialValue={parseStoredLocation(draftProfile.location) ?? undefined}
        onClose={() => setShowLocationPicker(false)}
        onSelect={handleSelectLocation}
      />

      <DeviceScanningModal
        isVisible={showScanningModal}
        scanStatus={scanStatus}
        connectionStatus={connectionStatus}
        bleError={bleError}
        onCancel={handleModalCancel}
        onConnected={handleModalConnected}
      />
    </ScrollView>
  );
}
