import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface DeviceScanningModalProps {
  isVisible: boolean;
  isScanning: boolean;
  onCancel: () => void;
  onConnected?: () => void;
}

const DeviceScanningModal = ({
  isVisible,
  isScanning,
  onCancel,
  onConnected,
}: DeviceScanningModalProps) => {
  const [scanTimeout, setScanTimeout] = useState(false);
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  // Auto-close if device connected
  useEffect(() => {
    if (isVisible && !isScanning) {
      // Delay to show success state before closing
      const timer = setTimeout(() => {
        onConnected?.();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isScanning, isVisible, onConnected]);

  // Scan timeout after 30 seconds
  useEffect(() => {
    if (!isVisible) {
      setScanTimeout(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      if (isScanning) {
        setScanTimeout(true);
      }
    }, 30000);

    return () => clearTimeout(timeoutId);
  }, [isVisible, isScanning]);

  // Pulse animation for the bluetooth icon
  useEffect(() => {
    if (isScanning && !scanTimeout) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.5,
            duration: 800,
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: false,
          }),
        ])
      ).start();
    }
  }, [isScanning, scanTimeout, pulseAnim]);

  const handleCancel = () => {
    setScanTimeout(false);
    onCancel();
  };

  return (
    <Modal transparent visible={isVisible} animationType="fade">
      <View className="flex-1 bg-black/50 justify-center items-center">
        <View className="bg-white rounded-3xl p-8 items-center w-4/5 max-w-sm">
          {/* Bluetooth Icon with Pulse Animation */}
          {isScanning && !scanTimeout ? (
            <>
              <Animated.View
                style={{
                  transform: [{ scale: pulseAnim }],
                  width: 80,
                  height: 80,
                  marginBottom: 24,
                }}
              >
                <View className="w-full h-full bg-blue-100 rounded-full items-center justify-center">
                  <Ionicons name="bluetooth" size={40} color="#3b82f6" />
                </View>
              </Animated.View>

              <Text className="text-xl font-semibold text-gray-900 mb-2">
                Searching for Device
              </Text>
              <Text className="text-gray-600 text-center mb-6 text-sm">
                Looking for PigFit_Device...
              </Text>
              <ActivityIndicator size="large" color="#3b82f6" />
            </>
          ) : !scanTimeout && !isScanning ? (
            /* Success State */
            <>
              <View className="w-20 h-20 bg-green-100 rounded-full items-center justify-center mb-6">
                <Ionicons name="checkmark-circle" size={40} color="#10b981" />
              </View>

              <Text className="text-xl font-semibold text-gray-900 mb-2">
                Device Connected!
              </Text>
              <Text className="text-gray-600 text-center text-sm">
                Your PigFit device is now connected
              </Text>
            </>
          ) : (
            /* Error/Timeout State */
            <>
              <View className="w-20 h-20 bg-red-100 rounded-full items-center justify-center mb-6">
                <Ionicons name="close-circle" size={40} color="#ef4444" />
              </View>

              <Text className="text-xl font-semibold text-gray-900 mb-2">
                Device Not Found
              </Text>
              <Text className="text-gray-600 text-center mb-6 text-sm">
                Could not find PigFit device. Please ensure your device is powered on and in range.
              </Text>

              <TouchableOpacity
                className="w-full bg-blue-500 rounded-xl py-3"
                onPress={handleCancel}
              >
                <Text className="text-white font-semibold text-center">Try Again</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Cancel Button (shown during scanning) */}
          {isScanning && !scanTimeout && (
            <TouchableOpacity
              className="w-full mt-6 border border-gray-300 rounded-xl py-3"
              onPress={handleCancel}
            >
              <Text className="text-gray-700 font-semibold text-center">Cancel</Text>
            </TouchableOpacity>
          )}

          {/* Close Button (shown on success) */}
          {!isScanning && !scanTimeout && (
            <TouchableOpacity
              className="w-full mt-6 bg-blue-500 rounded-xl py-3"
              onPress={handleCancel}
            >
              <Text className="text-white font-semibold text-center">Done</Text>
            </TouchableOpacity>
          )}

          {/* Close Button (shown on error) */}
          {scanTimeout && (
            <TouchableOpacity
              className="w-full mt-4 border border-gray-300 rounded-xl py-3"
              onPress={handleCancel}
            >
              <Text className="text-gray-700 font-semibold text-center">Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

export default DeviceScanningModal;
