import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PH_LOCATIONS_REGION_2, ProvinceLocation } from '../../services/app/phLocations';

interface LocationPickerValue {
  province: string;
  cityMunicipality: string;
}

interface LocationPickerModalProps {
  isVisible: boolean;
  initialValue?: Partial<LocationPickerValue>;
  onClose: () => void;
  onSelect: (value: LocationPickerValue) => void;
}

type PickerStep = 'province' | 'locality';

const LocationPickerModal = ({
  isVisible,
  initialValue,
  onClose,
  onSelect,
}: LocationPickerModalProps) => {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<PickerStep>('province');
  const [provinceSearch, setProvinceSearch] = useState('');
  const [localitySearch, setLocalitySearch] = useState('');
  const [selectedProvince, setSelectedProvince] = useState(initialValue?.province ?? '');
  const listBottomPadding = Math.max(insets.bottom, 16) + 8;

  useEffect(() => {
    if (!isVisible) return;
    setStep('province');
    setProvinceSearch('');
    setLocalitySearch('');
    setSelectedProvince(initialValue?.province ?? '');
  }, [initialValue?.province, isVisible]);

  const provinceResults = useMemo(() => {
    const query = provinceSearch.trim().toLowerCase();
    return PH_LOCATIONS_REGION_2.filter((item) =>
      item.province.toLowerCase().includes(query)
    );
  }, [provinceSearch]);

  const selectedProvinceData = useMemo<ProvinceLocation | undefined>(
    () => PH_LOCATIONS_REGION_2.find((item) => item.province === selectedProvince),
    [selectedProvince]
  );

  const localityResults = useMemo(() => {
    const query = localitySearch.trim().toLowerCase();
    return (selectedProvinceData?.localities ?? []).filter((item) =>
      item.name.toLowerCase().includes(query)
    );
  }, [localitySearch, selectedProvinceData]);

  const resetState = () => {
    setStep('province');
    setProvinceSearch('');
    setLocalitySearch('');
    setSelectedProvince('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSelectProvince = (province: string) => {
    setSelectedProvince(province);
    setLocalitySearch('');
    setStep('locality');
  };

  const handleSelectLocality = (cityMunicipality: string) => {
    onSelect({
      province: selectedProvince,
      cityMunicipality,
    });
    resetState();
  };

  const renderProvinceItem = ({ item }: { item: ProvinceLocation }) => (
    <TouchableOpacity
      className={`px-4 py-4 border-b border-gray-100 ${selectedProvince === item.province ? 'bg-blue-50' : ''}`}
      onPress={() => handleSelectProvince(item.province)}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-gray-900">{item.province}</Text>
        {selectedProvince === item.province ? (
          <Ionicons name="checkmark-circle" size={18} color="#2563EB" />
        ) : null}
      </View>
      <Text className="text-xs text-gray-500 mt-1">{item.localities.length} cities and municipalities</Text>
    </TouchableOpacity>
  );

  const renderLocalityItem = ({
    item,
  }: {
    item: ProvinceLocation['localities'][number];
  }) => (
    <TouchableOpacity
      className="px-4 py-4 border-b border-gray-100"
      onPress={() => handleSelectLocality(item.name)}
    >
      <Text className="text-base font-semibold text-gray-900">{item.name}</Text>
      <Text className="text-xs text-gray-500 mt-1">
        {item.type === 'city' ? 'City' : 'Municipality'}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      transparent
      visible={isVisible}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View className="flex-1 bg-black/40 justify-end">
        <View className="bg-white rounded-t-3xl max-h-[85%]" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
          <View className="flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
            {step === 'locality' ? (
              <TouchableOpacity
                className="p-2"
                onPress={() => {
                  setStep('province');
                  setLocalitySearch('');
                }}
              >
                <Ionicons name="arrow-back" size={22} color="#111827" />
              </TouchableOpacity>
            ) : (
              <View className="w-10" />
            )}
            <Text className="text-lg font-bold text-gray-900">
              {step === 'province' ? 'Select Province' : 'Select City/Municipality'}
            </Text>
            <TouchableOpacity className="p-2" onPress={handleClose}>
              <Ionicons name="close" size={22} color="#111827" />
            </TouchableOpacity>
          </View>

          {step === 'province' ? (
            <View className="px-4 pt-4 pb-2">
              <TextInput
                className="bg-gray-100 rounded-xl px-4 py-3 text-base text-gray-900"
                placeholder="Search province"
                value={provinceSearch}
                onChangeText={setProvinceSearch}
                autoCapitalize="words"
              />
            </View>
          ) : (
            <View className="px-4 pt-4 pb-2">
              <Text className="text-xs text-gray-500 mb-2">Province</Text>
              <Text className="text-sm font-semibold text-gray-900 mb-3">{selectedProvince}</Text>
              <TextInput
                className="bg-gray-100 rounded-xl px-4 py-3 text-base text-gray-900"
                placeholder="Search city or municipality"
                value={localitySearch}
                onChangeText={setLocalitySearch}
                autoCapitalize="words"
              />
            </View>
          )}

          {step === 'province' ? (
            <FlatList
              data={provinceResults}
              keyExtractor={(item) => item.provinceCode}
              renderItem={renderProvinceItem}
              contentContainerStyle={{ paddingBottom: listBottomPadding }}
              ListEmptyComponent={
                <View className="px-4 py-8">
                  <Text className="text-sm text-gray-500 text-center">No matching province found</Text>
                </View>
              }
            />
          ) : (
            <FlatList
              data={localityResults}
              keyExtractor={(item) => item.localityCode}
              renderItem={renderLocalityItem}
              contentContainerStyle={{ paddingBottom: listBottomPadding }}
              ListEmptyComponent={
                <View className="px-4 py-8">
                  <Text className="text-sm text-gray-500 text-center">No matching city or municipality found</Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

export type { LocationPickerValue };
export default LocationPickerModal;
