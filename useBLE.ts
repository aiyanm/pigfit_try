import { useMemo, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import {
  BleError,
  BleManager,
  Characteristic,
  Device,
} from "react-native-ble-plx";

import * as ExpoDevice from "expo-device";
import base64 from "react-native-base64";

const PIGFIT_DEVICE_NAME = "PigFit_Device";
const PIGFIT_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
const PIGFIT_CHARACTERISTIC_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";

interface PigFitData {
  temp: number;
  envTemp: number;
  humidity: number;
  accelX: number;
  accelY: number;
  accelZ: number;
  hr: number;
  feed: number;
}

interface BluetoothLowEnergyApi {
  requestPermissions(): Promise<boolean>;
  scanForPeripherals(): void;
  connectToDevice: (deviceId: Device) => Promise<void>;
  disconnectFromDevice: () => void;
  connectedDevice: Device | null;
  allDevices: Device[];
  receivedData: PigFitData | null;
}

function useBLE(): BluetoothLowEnergyApi {
  const bleManager = useMemo(() => new BleManager(), []);
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [receivedData, setReceivedData] = useState<PigFitData | null>(null);

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

  const scanForPeripherals = () => {
    console.log(">>> Starting BLE scan...");
    
    // CRITICAL: Stop any existing scans first
    bleManager.stopDeviceScan();
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
        
        bleManager.startDeviceScan(null, null, (error, device) => {
          if (error) {
            console.log("❌ Scan Error:", error);
            clearTimeout(timeoutId);
            return;
          }
          if (device) {
            deviceCount++;
            console.log(`✅ Scanned Device #${deviceCount}:`, device.name || "UNNAMED", device.id);
            
            if (device.name?.includes(PIGFIT_DEVICE_NAME)) {
              console.log("🎉 >>> FOUND PIGFIT DEVICE! Connecting... <<<");
              clearTimeout(timeoutId);
              bleManager.stopDeviceScan(); // STOP SCANNING
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
      }
    }, true);
  };

  const connectToDevice = async (device: Device) => {
    try {
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
      
      bleManager.stopDeviceScan();
      startStreamingData(deviceConnection);
    } catch (e) {
      console.log("FAILED TO CONNECT", e);
    }
  };

  const disconnectFromDevice = () => {
    if (connectedDevice) {
      bleManager.cancelDeviceConnection(connectedDevice.id);
      setConnectedDevice(null);
      setReceivedData(null);
    }
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
        accelX: view.getFloat32(14, true),
        accelY: view.getFloat32(18, true),
        accelZ: view.getFloat32(22, true),
        hr: packet[26],
        feed: view.getUint16(27, true) + (packet[29] / 100),
      };

      console.log("✅ Binary data parsed:", parsedData);
      setReceivedData(parsedData);
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
      device.monitorCharacteristicForService(
        PIGFIT_SERVICE_UUID,
        PIGFIT_CHARACTERISTIC_UUID,
        onDataUpdate
      );
    } else {
      console.log("No Device Connected");
    }
  };

  return {
    scanForPeripherals,
    requestPermissions,
    connectToDevice,
    allDevices,
    connectedDevice,
    disconnectFromDevice,
    receivedData,
  };
}

export default useBLE;
