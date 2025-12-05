import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import useBLE from './useBLE';
import { useEffect, useState } from 'react';

// --- 2A. STATUS CARD COMPONENT ---
interface StatusCardProps {
  label: string;
  value: string;
  color: string;
  bgColor: string;
}

const StatusCard = ({ label, value, color, bgColor }: StatusCardProps) => (
  <View style={[styles.statusCard, { backgroundColor: bgColor }]}>
    <Text style={styles.statusLabel}>{label}</Text>
    <Text style={[styles.statusValue, { color: color }]}>{value}</Text>
  </View>
);

// --- 2B. LIVESTOCK ITEM COMPONENT ---
interface LivestockItemProps {
  id: string;
  temp: number;
  hr: number;
  feed: number;
  status: string;
}

const LivestockItem = ({ id, temp, hr, feed, status }: LivestockItemProps) => {
  // Logic to determine status color based on the value
  const statusColor = status === 'Active' ? '#28a745' : status === 'Resting' ? '#6c757d' : '#ffc107';
  const statusBgColor = status === 'Active' ? '#e5f3e5' : status === 'Resting' ? '#e9ecef' : '#fff3cd';

  return (
    // Outer container for the pig item
    <View style={styles.livestockContainer}>
      {/* Pig ID and Status Header */}
      <View style={styles.rowHeader}>
        <Text style={styles.pigId}>{id}</Text>
        <View style={[styles.statusPill, { backgroundColor: statusBgColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
        </View>
      </View>

      {/* Sensor Data (Temperature, Heart Rate, Feed) */}
      <View style={styles.dataRow}>
        <View style={styles.dataColumn}>
          <Text style={styles.dataLabel}>Temp</Text>
          <Text style={styles.dataValue}>{temp.toFixed(1)}°C</Text>
        </View>
        <View style={styles.dataColumn}>
          <Text style={styles.dataLabel}>Heart Rate</Text>
          <Text style={styles.dataValue}>{hr} bpm</Text>
        </View>
        <View style={styles.dataColumn}>
          <Text style={styles.dataLabel}>Activity</Text>
          <Text style={styles.dataValue}>{status} </Text>
        </View>
      </View>
    </View>
  );
};

// --- 3. MAIN APP COMPONENT ---
export default function App() {
  const {
    requestPermissions,
    scanForPeripherals,
    allDevices,
    connectToDevice,
    connectedDevice,
    receivedData,
  } = useBLE();

  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    console.log(">>> App mounted, initializing BLE...");
    const initBLE = async () => {
      const granted = await requestPermissions();
      console.log(">>> Permissions granted:", granted);
      if (granted) {
        console.log(">>> Calling scanForPeripherals...");
        scanForPeripherals();
        setIsScanning(true);
      } else {
        console.log(">>> Permissions DENIED!");
      }
    };
    initBLE();
  }, []);

  useEffect(() => {
    // Auto-connect to the first found device (which should be PigFit_Device due to filtering)
    if (allDevices.length > 0 && !connectedDevice) {
      connectToDevice(allDevices[0]);
      setIsScanning(false);
    }
  }, [allDevices, connectedDevice]);

  // Derive status from sensor data (simple logic for now)
  const getStatus = (accelX: number, accelY: number, accelZ: number) => {
    const totalAccel = Math.sqrt(accelX * accelX + accelY * accelY + accelZ * accelZ);
    if (totalAccel > 1.5) return 'Active';
    if (totalAccel > 1.1) return 'Eating';
    return 'Resting';
  };

  const currentStatus = receivedData 
    ? getStatus(receivedData.accelX, receivedData.accelY, receivedData.accelZ) 
    : 'Waiting...';

  return (
    <View style={styles.container}>
      {/* Header and Subheader */}
      <Text style={styles.header}>Farm Monitor</Text>
      <Text style={styles.subheader}>
        {connectedDevice ? `Connected to ${connectedDevice.name}` : isScanning ? "Scanning for PigFit..." : "Initializing..."}
      </Text>
      
      {/* --- Overall Status Section --- */}
      <Text style={styles.sectionTitle}>Current Status</Text>
      <View style={styles.overallStatusRow}>
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
        {/* REMOVE THIS SHIT */}
        <StatusCard 
          label="Activity" 
          value={currentStatus} 
          color="#ffc107" 
          bgColor="#fffbe9" 
        />
      </View>

      {/* --- Livestock List Section --- */}
      <Text style={styles.sectionTitle}>Live Data</Text>
      <View style={styles.listContainer}>
        {receivedData ? (
          <LivestockItem 
            id="LIVE-PIG-01"
            temp={receivedData.temp}
            hr={receivedData.hr}
            feed={receivedData.feed}
            status={currentStatus}
          />
        ) : (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#3498db" />
            <Text style={{ marginTop: 10, color: '#666' }}>Waiting for data...</Text>
          </View>
        )}
      </View>

      <StatusBar style="auto" />
    </View>
  );
}

// --- 4. STYLESHEET ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8', // Light gray background
    paddingTop: 50, // Space from the top edge
    paddingHorizontal: 20,
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  subheader: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#444',
    marginTop: 20,
    marginBottom: 10,
  },
  // --- Overall Status Styles ---
  overallStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statusCard: {
    width: '32%',
    padding: 15,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  statusLabel: {
    fontSize: 12,
    color: '#6c757d',
    fontWeight: '500',
    marginBottom: 5,
  },
  statusValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  // --- Livestock List Styles ---
  listContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  livestockContainer: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  pigId: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 15,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dataColumn: {
    flex: 1,
  },
  dataLabel: {
    fontSize: 12,
    color: '#6c757d',
  },
  dataValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 3,
  },
});