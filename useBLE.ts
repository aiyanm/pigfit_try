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
const SCAN_TIMEOUT_MS = 30 * 1000;
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 15000;
const RECONNECT_SCAN_WINDOW_MS = 12000;
const PACKET_MAGIC_NUMBER = 0xaa;
const PACKET_VERSION_V1 = 0x01;
const PACKET_VERSION_V2 = 0x02;
const LEGACY_PACKET_SIZE = 32;
const RAW_AXES_PACKET_SIZE = 48;
const UI_UPDATE_THROTTLE_MS = 200;
const LOG_BLE_PACKETS = false;

const calculateActivityIntensity = (accelX: number, accelY: number, accelZ: number): number =>
  Math.sqrt(accelX * accelX + accelY * accelY + accelZ * accelZ);

interface PigFitData {
  temp: number;
  envTemp: number;
  humidity: number;
  activityIntensity: number;
  pitchAngle: number;
  accelX?: number;
  accelY?: number;
  accelZ?: number;
  gyroX?: number;
  gyroY?: number;
  gyroZ?: number;
  feedingPostureDetected: boolean;
}

export type BLEScanStatus = "idle" | "scanning" | "connecting" | "connected" | "timeout" | "error";
export type BLEConnectionStatus = "idle" | "scanning" | "connecting" | "connected" | "reconnecting" | "disconnecting" | "error";

export interface BluetoothLowEnergyApi {
  requestPermissions(): Promise<boolean>;
  scanForPeripherals(): Promise<void>;
  cancelScan: () => void;
  connectToDevice: (device: Device) => Promise<void>;
  disconnectFromDevice: () => void;
  connectedDevice: Device | null;
  connectedDeviceName: string | null;
  allDevices: Device[];
  discoveredDevices: Device[];
  receivedData: PigFitData | null;
  loadDeviceMetadata: (deviceId: string) => Promise<string | null>;
  updateConnectedDeviceName: (newName: string) => Promise<void>;
  scanStatus: BLEScanStatus;
  connectionStatus: BLEConnectionStatus;
  reconnectAttemptCount: number;
  bleError: string | null;
  clearBleError: () => void;
}

const getBleErrorMessage = (error: unknown, fallback: string): string => {
  if (error && typeof error === "object") {
    const maybeBleError = error as { message?: string; reason?: string | null; errorCode?: number | null };
    const reason = maybeBleError.reason?.trim();
    const message = maybeBleError.message?.trim();

    if (reason) return reason;
    if (message && message !== "Unknown error occurred. This is probably a bug! Check reason property.") {
      return message;
    }
    if (typeof maybeBleError.errorCode === "number") {
      return `${fallback} (code ${maybeBleError.errorCode})`;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
};

function useBLE(): BluetoothLowEnergyApi {
  const bleManager = useMemo(() => new BleManager(), []);
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(null);
  const [receivedData, setReceivedData] = useState<PigFitData | null>(null);
  const [scanStatus, setScanStatus] = useState<BLEScanStatus>("idle");
  const [connectionStatus, setConnectionStatus] = useState<BLEConnectionStatus>("idle");
  const [reconnectAttemptCount, setReconnectAttemptCount] = useState(0);
  const [bleError, setBleError] = useState<string | null>(null);

  const scanStateSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aggregateBackstopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const disconnectionSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const characteristicSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const isConnectingRef = useRef(false);
  const scanSessionIdRef = useRef(0);
  const lastUiUpdateAtRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReconnectScheduledRef = useRef(false);
  const manualDisconnectRef = useRef(false);
  const lastConnectedDeviceRef = useRef<{ id: string; name: string | null } | null>(null);
  const pendingUiUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUiPacketSignatureRef = useRef<string | null>(null);

  const clearReconnectTimer = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    isReconnectScheduledRef.current = false;
  };

  const clearPendingUiUpdate = () => {
    if (pendingUiUpdateTimeoutRef.current) {
      clearTimeout(pendingUiUpdateTimeoutRef.current);
      pendingUiUpdateTimeoutRef.current = null;
    }
  };

  const stopScan = (nextStatus: BLEScanStatus = connectedDevice ? "connected" : "idle") => {
    bleManager.stopDeviceScan();
    if (scanStateSubscriptionRef.current) {
      scanStateSubscriptionRef.current.remove();
      scanStateSubscriptionRef.current = null;
    }
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    setScanStatus(nextStatus);
  };

  const resetReconnectState = () => {
    clearReconnectTimer();
    setReconnectAttemptCount(0);
  };

  useEffect(() => {
    const initLogger = async () => {
      await initializeLogger();
    };
    initLogger().catch((error) => {
      console.error("Failed to initialize logger:", error);
    });
  }, []);

  const loadDeviceMetadata = async (deviceId: string): Promise<string | null> => {
    try {
      const device = await dbService.getDevice(deviceId);
      if (device) {
        console.log("✅ Loaded device metadata:", device.device_name);
        setConnectedDeviceName(device.device_name);
        return device.device_name;
      }
      return null;
    } catch (error) {
      console.error("❌ Error loading device metadata:", error);
      return null;
    }
  };

  const updateConnectedDeviceName = async (newName: string): Promise<void> => {
    if (!connectedDevice) {
      console.warn("⚠️ No connected device to rename");
      return;
    }
    try {
      await dbService.updateDeviceName(connectedDevice.id, newName);
      setConnectedDeviceName(newName);
      console.log("✅ Device name updated to:", newName);
    } catch (error) {
      console.error("❌ Error updating device name:", error);
      throw error;
    }
  };

  const requestAndroid31Permissions = async () => {
    try {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      return (
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
        results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (error) {
      console.log("❌ Android 12+ permission request failed:", error);
      setBleError("Bluetooth permissions could not be requested. Please enable Nearby devices and Location permissions in Settings.");
      return false;
    }
  };

  const requestPermissions = async () => {
    console.log(">>> Requesting permissions...");
    if (Platform.OS === "android") {
      if ((ExpoDevice.platformApiLevel ?? -1) < 31) {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: "Location Permission",
              message: "Bluetooth Low Energy requires Location",
              buttonPositive: "OK",
            }
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        } catch (error) {
          console.log("❌ Android permission request failed:", error);
          setBleError("Location permission could not be requested. Please enable it in Settings.");
          return false;
        }
      }

      return requestAndroid31Permissions();
    }

    return true;
  };

  const isDuplicteDevice = (devices: Device[], nextDevice: Device) =>
    devices.findIndex((device) => nextDevice.id === device.id) > -1;

  const clearBleError = () => {
    setBleError(null);
  };

  const cancelScan = () => {
    scanSessionIdRef.current += 1;
    setAllDevices([]);
    setBleError(null);
    stopScan(connectedDevice ? "connected" : "idle");
    if (!connectedDevice && connectionStatus !== "disconnecting" && connectionStatus !== "reconnecting") {
      setConnectionStatus("idle");
    }
  };

  const connectToDeviceById = async (deviceId: string, fallbackName?: string | null): Promise<Device> => {
    const deviceConnection = await bleManager.connectToDevice(deviceId);
    await deviceConnection.discoverAllServicesAndCharacteristics();

    try {
      const mtu = await deviceConnection.requestMTU(64);
      console.log(`✅ MTU negotiated: ${mtu} bytes`);
    } catch (mtuError) {
      console.log("⚠️ MTU request failed, using default:", mtuError);
    }

    try {
      await dbService.initialize();

      const existingDevice = await dbService.getDevice(deviceId);
      if (!existingDevice) {
        const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const autoName = fallbackName || `PigFit - ${dateStr}`;
        await dbService.saveDevice(deviceId, deviceId, autoName);
        setConnectedDeviceName(autoName);
        console.log("✅ New device saved with name:", autoName);
      } else {
        setConnectedDeviceName(existingDevice.device_name);
        console.log("✅ Device loaded with name:", existingDevice.device_name);
      }
      await dbService.updateDeviceLastConnected(deviceId);
    } catch (dbError) {
      console.error("❌ Error saving/loading device metadata:", dbError);
      setConnectedDeviceName(fallbackName || "PigFit Device");
    }

    setupDisconnectionListener(deviceConnection, bleManager);
    await startStreamingData(deviceConnection);
    setConnectedDevice(deviceConnection);
    lastConnectedDeviceRef.current = {
      id: deviceConnection.id,
      name: deviceConnection.name || fallbackName || null,
    };
    setScanStatus("connected");
    setConnectionStatus("connected");
    resetReconnectState();

    await notifyBLEConnected(deviceConnection.name || fallbackName || "PigFit Device");
    return deviceConnection;
  };

  const startStreamingData = async (device: Device) => {
    if (!device) {
      console.log("No Device Connected");
      return;
    }

    if (characteristicSubscriptionRef.current) {
      characteristicSubscriptionRef.current.remove();
      characteristicSubscriptionRef.current = null;
    }

    characteristicSubscriptionRef.current = device.monitorCharacteristicForService(
      PIGFIT_SERVICE_UUID,
      PIGFIT_CHARACTERISTIC_UUID,
      onDataUpdate
    );
  };

  const setupDisconnectionListener = (device: Device, manager: BleManager) => {
    if (disconnectionSubscriptionRef.current) {
      disconnectionSubscriptionRef.current.remove();
      disconnectionSubscriptionRef.current = null;
    }

    const subscription = manager.onDeviceDisconnected(
      device.id,
      async (error) => {
        console.log(`⚠️ Device ${device.name} disconnected:`, error);
        const wasManualDisconnect = manualDisconnectRef.current;
        manualDisconnectRef.current = false;
        clearPendingUiUpdate();
        lastUiPacketSignatureRef.current = null;
        setConnectedDevice(null);
        setConnectedDeviceName(null);
        setReceivedData(null);
        stopScan("idle");

        if (wasManualDisconnect) {
          setConnectionStatus("idle");
          setBleError(null);
        } else {
          setConnectionStatus("reconnecting");
          setBleError(error?.message || "PigFit device disconnected unexpectedly.");
          await notifyBLEDisconnected(device.name || "PigFit Device");
          scheduleReconnect();
        }

        subscription.remove();
        disconnectionSubscriptionRef.current = null;
      }
    );
    disconnectionSubscriptionRef.current = subscription;
  };

  const attemptReconnectScan = async (targetDeviceId: string, targetName?: string | null): Promise<void> =>
    new Promise((resolve, reject) => {
      const sessionId = scanSessionIdRef.current + 1;
      scanSessionIdRef.current = sessionId;
      stopScan("idle");
      setScanStatus("scanning");

      let settled = false;
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        callback();
      };

      scanTimeoutRef.current = setTimeout(() => {
        settle(() => {
          stopScan("idle");
          reject(new Error("Reconnect scan timed out"));
        });
      }, RECONNECT_SCAN_WINDOW_MS);

      bleManager.startDeviceScan(null, null, (scanError, device) => {
        if (scanSessionIdRef.current !== sessionId || settled) {
          return;
        }

        if (scanError) {
          settle(() => {
            console.log("❌ Reconnect scan error:", scanError);
            stopScan("error");
            reject(scanError);
          });
          return;
        }

        if (!device) return;

        const matchesId = device.id === targetDeviceId;
        const matchesName = !!device.name?.includes(targetName || PIGFIT_DEVICE_NAME);
        if (!matchesId && !matchesName) {
          return;
        }

        settle(() => {
          stopScan("idle");
          void connectToDevice(device).then(resolve).catch(reject);
        });
      });
    });

  const scheduleReconnect = () => {
    if (manualDisconnectRef.current || isReconnectScheduledRef.current || isConnectingRef.current) {
      return;
    }

    const target = lastConnectedDeviceRef.current;
    if (!target) {
      setConnectionStatus("idle");
      return;
    }

    isReconnectScheduledRef.current = true;
    setReconnectAttemptCount((current) => {
      const nextAttempt = current + 1;
      const delay = Math.min(
        RECONNECT_BASE_DELAY_MS * Math.pow(2, Math.max(0, nextAttempt - 1)),
        RECONNECT_MAX_DELAY_MS
      );

      reconnectTimeoutRef.current = setTimeout(() => {
        isReconnectScheduledRef.current = false;
        if (manualDisconnectRef.current) {
          return;
        }

        setConnectionStatus("reconnecting");
        setScanStatus("idle");

        void connectToDeviceById(target.id, target.name)
          .catch(async (directError) => {
            console.log("⚠️ Direct reconnect failed, scanning for device:", directError);
            try {
              await attemptReconnectScan(target.id, target.name);
            } catch (scanError) {
              console.log("⚠️ Reconnect scan failed:", scanError);
              setBleError("PigFit device disconnected. Retrying connection...");
              scheduleReconnect();
            }
          });
      }, delay);

      return nextAttempt;
    });
  };

  const connectToDevice = async (device: Device): Promise<void> => {
    if (isConnectingRef.current || (connectedDevice?.id === device.id && connectionStatus === "connected")) {
      return;
    }

    try {
      isConnectingRef.current = true;
      manualDisconnectRef.current = false;
      clearReconnectTimer();
      setBleError(null);
      setScanStatus("connecting");
      setConnectionStatus(connectionStatus === "reconnecting" ? "reconnecting" : "connecting");
      stopScan("connecting");
      await connectToDeviceById(device.id, device.name || PIGFIT_DEVICE_NAME);
    } catch (error) {
      console.log("FAILED TO CONNECT", error);
      const message = error instanceof Error ? error.message : "Failed to connect to PigFit device.";
      setBleError(message);
      if (connectionStatus === "reconnecting") {
        setScanStatus("idle");
        setConnectionStatus("reconnecting");
        scheduleReconnect();
      } else {
        setScanStatus("error");
        setConnectionStatus("error");
      }
      setConnectedDevice(null);
      setConnectedDeviceName(null);
      setReceivedData(null);
    } finally {
      isConnectingRef.current = false;
    }
  };

  const scanForPeripherals = async (): Promise<void> => {
    if (scanStatus === "scanning" || scanStatus === "connecting" || isConnectingRef.current) {
      return;
    }

    try {
      console.log(">>> Starting BLE scan...");
      const sessionId = scanSessionIdRef.current + 1;
      scanSessionIdRef.current = sessionId;

      setAllDevices([]);
      setBleError(null);
      stopScan("idle");
      setScanStatus("scanning");
      setConnectionStatus("scanning");

      const beginScan = () => {
        if (scanSessionIdRef.current !== sessionId) {
          return;
        }

        scanTimeoutRef.current = setTimeout(() => {
          if (scanSessionIdRef.current !== sessionId || connectedDevice) return;
          console.log(">>> Scan timed out without finding PigFit device");
          setBleError("Could not find PigFit device. Please ensure your device is powered on and in range.");
          stopScan("timeout");
          setConnectionStatus("error");
        }, SCAN_TIMEOUT_MS);

        bleManager.startDeviceScan(null, null, (error, device) => {
          if (scanSessionIdRef.current !== sessionId) {
            return;
          }

          if (error) {
            console.log("❌ Scan Error:", error);
            setBleError(getBleErrorMessage(error, "Bluetooth scan failed. Check that Bluetooth and location are enabled."));
            stopScan("error");
            setConnectionStatus("error");
            return;
          }

          if (!device) return;

          console.log("✅ Scanned Device:", device.name || "UNNAMED", device.id);
          setAllDevices((prevState: Device[]) => {
            if (!isDuplicteDevice(prevState, device)) {
              return [...prevState, device];
            }
            return prevState;
          });

          if (device.name?.includes(PIGFIT_DEVICE_NAME)) {
            void connectToDevice(device);
          }
        });
      };

      const state = await bleManager.state();
      console.log(">>> BLE Manager State:", state);

      if (state === "PoweredOn") {
        beginScan();
        return;
      }

      const subscription = bleManager.onStateChange((nextState) => {
        console.log(">>> BLE State Changed:", nextState);
        if (scanSessionIdRef.current !== sessionId) {
          subscription.remove();
          return;
        }

        if (nextState === "PoweredOn") {
          subscription.remove();
          scanStateSubscriptionRef.current = null;
          beginScan();
        }
      }, true);
      scanStateSubscriptionRef.current = subscription;
    } catch (error) {
      console.log("❌ Failed to start BLE scan:", error);
      setBleError(
        getBleErrorMessage(
          error,
          "Bluetooth could not start scanning. Check that Bluetooth and location are enabled, then try again."
        )
      );
      stopScan("error");
      setConnectionStatus("error");
      throw error;
    }
  };

  const disconnectFromDevice = async () => {
    manualDisconnectRef.current = true;
    clearReconnectTimer();
    resetReconnectState();

    if (!connectedDevice) {
      cancelScan();
      setConnectionStatus("idle");
      return;
    }

    const deviceName = connectedDeviceName || connectedDevice.name || "PigFit Device";
    setConnectionStatus("disconnecting");
    cancelScan();

    if (characteristicSubscriptionRef.current) {
      characteristicSubscriptionRef.current.remove();
      characteristicSubscriptionRef.current = null;
    }
    if (disconnectionSubscriptionRef.current) {
      disconnectionSubscriptionRef.current.remove();
      disconnectionSubscriptionRef.current = null;
    }

    await bleManager.cancelDeviceConnection(connectedDevice.id);
    clearPendingUiUpdate();
    lastUiPacketSignatureRef.current = null;
    setConnectedDevice(null);
    setConnectedDeviceName(null);
    setReceivedData(null);
    setScanStatus("idle");
    setConnectionStatus("idle");
    setBleError(null);

    await notifyBLEDisconnected(deviceName);
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
      const rawData = base64.decode(characteristic.value);
      const packet = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; i++) {
        packet[i] = rawData.charCodeAt(i);
      }

      if (packet.length < 4) {
        console.log(`❌ Packet too short: ${packet.length}`);
        return;
      }

      if (packet[0] !== PACKET_MAGIC_NUMBER) {
        console.log("❌ Invalid magic number");
        return;
      }

      const packetVersion = packet[1];
      const expectedPacketSize =
        packetVersion === PACKET_VERSION_V1
          ? LEGACY_PACKET_SIZE
          : packetVersion === PACKET_VERSION_V2
            ? RAW_AXES_PACKET_SIZE
            : 0;

      if (expectedPacketSize === 0) {
        console.log(`❌ Unsupported packet version: ${packetVersion}`);
        return;
      }

      if (packet.length !== expectedPacketSize) {
        console.log(`❌ Invalid packet size: ${packet.length} (expected ${expectedPacketSize})`);
        return;
      }

      const crcOffset = packet.length - 2;
      const receivedCRC = packet[crcOffset] | (packet[crcOffset + 1] << 8);
      const calculatedCRC = calculateCRC16(packet.slice(0, crcOffset));
      if (receivedCRC !== calculatedCRC) {
        console.log("❌ CRC mismatch");
        return;
      }

      const view = new DataView(packet.buffer);
      const parsedData: PigFitData =
        packetVersion === PACKET_VERSION_V2
          ? {
              temp: view.getFloat32(2, true),
              envTemp: view.getFloat32(6, true),
              humidity: view.getFloat32(10, true),
              accelX: view.getFloat32(14, true),
              accelY: view.getFloat32(18, true),
              accelZ: view.getFloat32(22, true),
              gyroX: view.getFloat32(26, true),
              gyroY: view.getFloat32(30, true),
              gyroZ: view.getFloat32(34, true),
              pitchAngle: view.getFloat32(38, true),
              activityIntensity: calculateActivityIntensity(
                view.getFloat32(14, true),
                view.getFloat32(18, true),
                view.getFloat32(22, true)
              ),
              feedingPostureDetected: packet[42] === 1,
            }
          : {
              temp: view.getFloat32(2, true),
              envTemp: view.getFloat32(6, true),
              humidity: view.getFloat32(10, true),
              activityIntensity: view.getFloat32(14, true),
              pitchAngle: view.getFloat32(18, true),
              feedingPostureDetected: packet[22] === 1,
            };

      if (LOG_BLE_PACKETS) {
        console.log("✅ Binary data parsed:", parsedData);
      }

      const now = Date.now();
      const packetSignature = JSON.stringify([
        parsedData.temp,
        parsedData.envTemp,
        parsedData.humidity,
        parsedData.activityIntensity,
        parsedData.pitchAngle,
        parsedData.accelX ?? null,
        parsedData.accelY ?? null,
        parsedData.accelZ ?? null,
        parsedData.gyroX ?? null,
        parsedData.gyroY ?? null,
        parsedData.gyroZ ?? null,
        parsedData.feedingPostureDetected ? 1 : 0,
      ]);

      if (
        packetSignature !== lastUiPacketSignatureRef.current &&
        now - lastUiUpdateAtRef.current >= UI_UPDATE_THROTTLE_MS
      ) {
        lastUiUpdateAtRef.current = now;
        lastUiPacketSignatureRef.current = packetSignature;
        clearPendingUiUpdate();
        pendingUiUpdateTimeoutRef.current = setTimeout(() => {
          pendingUiUpdateTimeoutRef.current = null;
          setReceivedData(parsedData);
        }, 0);
      }

      void logSensorData({
        timestamp: now,
        ...parsedData,
      }).catch((error) => {
        console.error("❌ Async sensor logging failed:", error);
      });
    } catch (e) {
      console.log("❌ Error parsing binary data:", e);
    }
  };

  const calculateCRC16 = (data: Uint8Array): number => {
    let crc = 0xffff;

    for (let i = 0; i < data.length; i++) {
      crc ^= data[i] << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = ((crc << 1) ^ 0x1021) & 0xffff;
        } else {
          crc = (crc << 1) & 0xffff;
        }
      }
    }

    return crc;
  };

  useEffect(() => {
    if (!connectedDevice) {
      if (aggregateBackstopRef.current) {
        clearInterval(aggregateBackstopRef.current);
        aggregateBackstopRef.current = null;
      }
      return;
    }

    aggregateBackstopRef.current = setInterval(() => {
      const pigId = getCurrentIngestionPigId();
      triggerPeriodAggregateRefresh(pigId, "timer");
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
      cancelScan();
      clearReconnectTimer();
      clearPendingUiUpdate();
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
    cancelScan,
    requestPermissions,
    connectToDevice,
    allDevices,
    discoveredDevices: allDevices,
    connectedDevice,
    connectedDeviceName,
    disconnectFromDevice,
    receivedData,
    loadDeviceMetadata,
    updateConnectedDeviceName,
    scanStatus,
    connectionStatus,
    reconnectAttemptCount,
    bleError,
    clearBleError,
  };
}

export default useBLE;
