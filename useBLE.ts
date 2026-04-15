import { useEffect, useMemo, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import {
  BleError,
  BleManager,
  Characteristic,
  Device,
} from "react-native-ble-plx";

import * as ExpoDevice from "expo-device";
import base64 from "react-native-base64";
import { getCurrentIngestionPigId, initializeLogger, logSensorData, triggerPeriodAggregateRefresh } from "./services";
import {
  notifyBLEConnected,
  notifyBLEDisconnected,
} from "./services/notificationService";
import { dbService } from "./services/storage/db/client";

const PIGFIT_DEVICE_NAME = "PigFit_Device";
const PIGFIT_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
const PIGFIT_CHARACTERISTIC_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";
const PERIOD_AGG_REFRESH_BACKSTOP_MS = 30 * 1000;

interface PigFitData {
  temp: number;
  envTemp: number;
  humidity: number;
  activityIntensity: number; // Processed on Arduino
  pitchAngle: number;       // Processed on Arduino
  feedingPostureDetected: boolean;
}

export interface BluetoothLowEnergyApi {
  requestPermissions(): Promise<boolean>;
  scanForPeripherals(): void;
  connectToDevice: (deviceId: Device) => Promise<void>;
  disconnectFromDevice: () => void;
  connectedDevice: Device | null;
  connectedDeviceName: string | null;
  allDevices: Device[];
  receivedData: PigFitData | null;
  loadDeviceMetadata: (deviceId: string) => Promise<string | null>;
  updateConnectedDeviceName: (newName: string) => Promise<void>;
}

function useBLE(): BluetoothLowEnergyApi {
  const bleManager = useMemo(() => new BleManager(), []);
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(null);
  const [receivedData, setReceivedData] = useState<PigFitData | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const scanStateSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aggregateBackstopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const disconnectionSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const characteristicSubscriptionRef = useRef<{ remove: () => void } | null>(null);

  // Initialize the data logger when component mounts
  useEffect(() => {
    const initLogger = async () => {
      await initializeLogger();
    };
    initLogger().catch(error => {
      console.error('Failed to initialize logger:', error);
    });
  }, []);

  /**
   * Load device name from database by device_id
   */
  const loadDeviceMetadata = async (deviceId: string): Promise<string | null> => {
    try {
      const device = await dbService.getDevice(deviceId);
      if (device) {
        console.log('✅ Loaded device metadata:', device.device_name);
        setConnectedDeviceName(device.device_name);
        return device.device_name;
      }
      return null;
    } catch (error) {
      console.error('❌ Error loading device metadata:', error);
      return null;
    }
  };

  /**
   * Update the connected device's name (in memory and database)
   */
  const updateConnectedDeviceName = async (newName: string): Promise<void> => {
    if (!connectedDevice) {
      console.warn('⚠️ No connected device to rename');
      return;
    }
    try {
      await dbService.updateDeviceName(connectedDevice.id, newName);
      setConnectedDeviceName(newName);
      console.log('✅ Device name updated to:', newName);
    } catch (error) {
      console.error('❌ Error updating device name:', error);
      throw error;
    }
  };



  const requestAndroid31Permissions = async () => {
    const bluetoothScanPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      {
        title: "Bluetooth Scan Permission",
        message: "This app needs Bluetooth access to find nearby devices",
        buttonPositive: "OK",
      }
    );
    const bluetoothConnectPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      {
        title: "Bluetooth Connect Permission",
        message: "This app needs Bluetooth access to connect to devices",
        buttonPositive: "OK",
      }
    );
    const fineLocationPermission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: "Location Permission",
        message: "Bluetooth scanning requires location access on Android",
        buttonPositive: "OK",
      }
    );

    console.log("Permission Results:");
    console.log("- Bluetooth Scan:", bluetoothScanPermission);
    console.log("- Bluetooth Connect:", bluetoothConnectPermission);
    console.log("- Location:", fineLocationPermission);

    return (
      bluetoothScanPermission === "granted" &&
      bluetoothConnectPermission === "granted" &&
      fineLocationPermission === "granted"
    );
  };

  const requestPermissions = async () => {
    console.log(">>> Requesting permissions...");
    if (Platform.OS === "android") {
      if ((ExpoDevice.platformApiLevel ?? -1) < 31) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location Permission",
            message: "Bluetooth Low Energy requires Location",
            buttonPositive: "OK",
          }
        );
        console.log("Location permission result:", granted);
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const isAndroid31PermissionsGranted =
          await requestAndroid31Permissions();

        console.log("All permissions granted:", isAndroid31PermissionsGranted);
        return isAndroid31PermissionsGranted;
      }
    } else {
      return true;
    }
  };

  const isDuplicteDevice = (devices: Device[], nextDevice: Device) =>
    devices.findIndex((device) => nextDevice.id === device.id) > -1;

  const stopScan = () => {
    bleManager.stopDeviceScan();
    if (scanStateSubscriptionRef.current) {
      scanStateSubscriptionRef.current.remove();
      scanStateSubscriptionRef.current = null;
    }
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    setIsScanning(false);
  };

  const scanForPeripherals = () => {
    if (isScanning) {
      return;
    }

    console.log(">>> Starting BLE scan...");
    
    // CRITICAL: Stop any existing scans first
    stopScan();
    setIsScanning(true);
    console.log(">>> Stopped any existing scans");
    
    // Check BLE state first
    bleManager.state().then((state) => {
      console.log(">>> BLE Manager State:", state);
    });

    // Wait for BLE to be powered on
    const subscription = bleManager.onStateChange((state) => {
      console.log(">>> BLE State Changed:", state);
      if (state === 'PoweredOn') {
        console.log(">>> BLE is PoweredOn, starting scan...");
        
        // Add a timeout to check if scan is working
        let deviceCount = 0;
        const timeoutId = setTimeout(() => {
          if (deviceCount === 0) {
            console.log(">>> WARNING: No devices found after 5 seconds!");
            console.log(">>> This might be a BLE library issue. Try restarting the app.");
          }
        }, 5000);
        scanTimeoutRef.current = timeoutId;
        
        bleManager.startDeviceScan(null, null, (error, device) => {
          if (error) {
            console.log("❌ Scan Error:", error);
            stopScan();
            return;
          }
          if (device) {
            deviceCount++;
            console.log(`✅ Scanned Device #${deviceCount}:`, device.name || "UNNAMED", device.id);
            
            if (device.name?.includes(PIGFIT_DEVICE_NAME)) {
              console.log("🎉 >>> FOUND PIGFIT DEVICE! Connecting... <<<");
              stopScan(); // STOP SCANNING
              console.log(">>> Stopped scanning");
              setAllDevices((prevState: Device[]) => {
                if (!isDuplicteDevice(prevState, device)) {
                  return [...prevState, device];
                }
                return prevState;
              });
            }
          }
        });
        subscription.remove();
        scanStateSubscriptionRef.current = null;
      }
    }, true);
    scanStateSubscriptionRef.current = subscription;
  };

  const connectToDevice = async (device: Device) => {
    if (isConnecting || connectedDevice?.id === device.id) {
      return;
    }

    try {
      setIsConnecting(true);
      const deviceConnection = await bleManager.connectToDevice(device.id);
      setConnectedDevice(deviceConnection);
      await deviceConnection.discoverAllServicesAndCharacteristics();
      
      // Request MTU of 64 bytes to support 32-byte packets (+ overhead)
      try {
        const mtu = await deviceConnection.requestMTU(64);
        console.log(`✅ MTU negotiated: ${mtu} bytes`);
      } catch (mtuError) {
        console.log("⚠️ MTU request failed, using default:", mtuError);
      }
      
      stopScan();

      // Store device metadata in database
      try {
        // Ensure database is initialized before any operations
        await dbService.initialize();
        
        const existingDevice = await dbService.getDevice(device.id);
        if (!existingDevice) {
          // New device: save with auto-generated name
          const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const autoName = `PigFit - ${dateStr}`;
          await dbService.saveDevice(device.id, device.id, autoName);
          setConnectedDeviceName(autoName);
          console.log('✅ New device saved with name:', autoName);
        } else {
          // Existing device: load stored name
          setConnectedDeviceName(existingDevice.device_name);
          console.log('✅ Device loaded with name:', existingDevice.device_name);
        }
        // Update last_connected timestamp
        await dbService.updateDeviceLastConnected(device.id);
      } catch (dbError) {
        console.error('❌ Error saving/loading device metadata:', dbError);
        // Fall back to device BLE name
        setConnectedDeviceName(device.name || "PigFit Device");
      }

      // Send BLE connected notification
      await notifyBLEConnected(device.name || "PigFit Device");

      // Monitor for unexpected disconnection
      setupDisconnectionListener(device, bleManager);

      startStreamingData(deviceConnection);
    } catch (e) {
      console.log("FAILED TO CONNECT", e);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectFromDevice = async () => {
    if (connectedDevice) {
      const deviceName = connectedDeviceName || connectedDevice.name || "PigFit Device";
      if (characteristicSubscriptionRef.current) {
        characteristicSubscriptionRef.current.remove();
        characteristicSubscriptionRef.current = null;
      }
      if (disconnectionSubscriptionRef.current) {
        disconnectionSubscriptionRef.current.remove();
        disconnectionSubscriptionRef.current = null;
      }
      await bleManager.cancelDeviceConnection(connectedDevice.id);
      setConnectedDevice(null);
      setConnectedDeviceName(null);
      setReceivedData(null);

      // Send BLE disconnected notification
      await notifyBLEDisconnected(deviceName);
    }
  };

  const setupDisconnectionListener = (device: Device, manager: BleManager) => {
    if (disconnectionSubscriptionRef.current) {
      disconnectionSubscriptionRef.current.remove();
    }

    // Monitor for unexpected device disconnection
    const subscription = manager.onDeviceDisconnected(
      device.id,
      async (error) => {
        console.log(`⚠️ Device ${device.name} disconnected:`, error);
        setConnectedDevice(null);
        setConnectedDeviceName(null);
        setReceivedData(null);

        // Notify user of unexpected disconnection
        await notifyBLEDisconnected(
          device.name || "PigFit Device"
        );

        // Clean up subscription
        subscription.remove();
        disconnectionSubscriptionRef.current = null;
      }
    );
    disconnectionSubscriptionRef.current = subscription;
  };

  const onDataUpdate = (
    error: BleError | null,
    characteristic: Characteristic | null
  ) => {
    if (error) {
      console.log("❌ BLE Error:", error);
      return;
    }
    
    if (!characteristic?.value) {
      console.log("⚠️ No data received");
      return;
    }

    try {
      // Decode base64 to get raw bytes
      const rawData = base64.decode(characteristic.value);
      
      // Validate packet size
      if (rawData.length !== 32) {
        console.log(`❌ Invalid packet size: ${rawData.length} (expected 32)`);
        return;
      }

      // Parse binary packet
      const packet = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; i++) {
        packet[i] = rawData.charCodeAt(i);
      }

      // Validate header
      if (packet[0] !== 0xAA) {
        console.log("❌ Invalid magic number");
        return;
      }
      if (packet[1] !== 0x01) {
        console.log("❌ Invalid packet version");
        return;
      }

      // Validate CRC16
      const receivedCRC = packet[30] | (packet[31] << 8);
      const calculatedCRC = calculateCRC16(packet.slice(0, 30));
      if (receivedCRC !== calculatedCRC) {
        console.log("❌ CRC mismatch");
        return;
      }

      // Parse data (little-endian)
      const view = new DataView(packet.buffer);
      const parsedData: PigFitData = {
        temp: view.getFloat32(2, true),
        envTemp: view.getFloat32(6, true),
        humidity: view.getFloat32(10, true),
        activityIntensity: view.getFloat32(14, true), // Updated for Stage 1
        pitchAngle: view.getFloat32(18, true),        // Updated for Stage 1
        feedingPostureDetected: packet[22] === 1,
      };

      console.log("✅ Binary data parsed:", parsedData);
      setReceivedData(parsedData);
      
      // Log data to file
      logSensorData({
        timestamp: Date.now(),
        ...parsedData,
      });
    } catch (e) {
      console.log("❌ Error parsing binary data:", e);
    }
  };

  // CRC16 calculation (CCITT) - matches Arduino implementation
  const calculateCRC16 = (data: Uint8Array): number => {
    let crc = 0xFFFF;
    
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i] << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
        } else {
          crc = (crc << 1) & 0xFFFF;
        }
      }
    }
    
    return crc;
  };

  const startStreamingData = async (device: Device) => {
    if (device) {
      if (characteristicSubscriptionRef.current) {
        characteristicSubscriptionRef.current.remove();
      }
      characteristicSubscriptionRef.current = device.monitorCharacteristicForService(
        PIGFIT_SERVICE_UUID,
        PIGFIT_CHARACTERISTIC_UUID,
        onDataUpdate
      );
    } else {
      console.log("No Device Connected");
    }
  };

  useEffect(() => {
    if (!connectedDevice) {
      if (aggregateBackstopRef.current) {
        clearInterval(aggregateBackstopRef.current);
        aggregateBackstopRef.current = null;
      }
      return;
    }

    // Backstop refresh while connected in case packet-triggered refresh is delayed.
    aggregateBackstopRef.current = setInterval(() => {
      const pigId = getCurrentIngestionPigId();
      triggerPeriodAggregateRefresh(pigId, 'timer');
    }, PERIOD_AGG_REFRESH_BACKSTOP_MS);

    return () => {
      if (aggregateBackstopRef.current) {
        clearInterval(aggregateBackstopRef.current);
        aggregateBackstopRef.current = null;
      }
    };
  }, [connectedDevice]);

  useEffect(() => {
    return () => {
      stopScan();
      if (aggregateBackstopRef.current) {
        clearInterval(aggregateBackstopRef.current);
      }
      if (characteristicSubscriptionRef.current) {
        characteristicSubscriptionRef.current.remove();
      }
      if (disconnectionSubscriptionRef.current) {
        disconnectionSubscriptionRef.current.remove();
      }
      bleManager.destroy();
    };
  }, [bleManager]);

  return {
    scanForPeripherals,
    requestPermissions,
    connectToDevice,
    allDevices,
    connectedDevice,
    connectedDeviceName,
    disconnectFromDevice,
    receivedData,
    loadDeviceMetadata,
    updateConnectedDeviceName,
  };
}

export default useBLE;
