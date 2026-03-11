import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import HomeTab from './navigators/Dashboard';
import { useEffect } from 'react';
import { dbService } from './services/database';
import { initializeNotifications } from './services/notificationService';

export default function App() {
  useEffect(() => {
    // Initialize database on app launch (MUST happen before BLE data arrives)
    const initDB = async () => {
      try {
        console.log('🚀 Initializing database at app startup...');
        await dbService.initialize();
        console.log('✅ Database ready for data logging');
      } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        // App continues even if DB fails, data will be queued for retry
      }
    };

    // Initialize push notifications
    const initNotifications = async () => {
      try {
        console.log('🚀 Initializing push notifications...');
        await initializeNotifications();
        console.log('✅ Push notifications ready');
      } catch (error) {
        console.error('❌ Failed to initialize notifications:', error);
      }
    };

    initDB();
    initNotifications();
  }, []);

  return (
    <NavigationContainer>
      <HomeTab />
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}