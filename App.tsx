import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeTab from './navigators/Dashboard';
import { useEffect } from 'react';
import { initializeAppServices } from './services/app/bootstrap';
import { initializeNotifications } from './services/notificationService';

export default function App() {
  useEffect(() => {
    // Initialize service layer on app launch (DB + AI config)
    const initServices = async () => {
      try {
        console.log('🚀 Initializing app services at startup...');
        await initializeAppServices();
        console.log('✅ Services ready for data logging and analysis');
      } catch (error) {
        console.error('❌ Failed to initialize app services:', error);
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

    initServices();
    initNotifications();
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <HomeTab />
        <StatusBar style="auto" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
