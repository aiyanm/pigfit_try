import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeTab from './navigators/Dashboard';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { initializeAppServices } from './services/app/bootstrap';
import { initializeNotifications } from './services/notificationService';

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);

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

    // Initialize both services in parallel, then mark as ready
    const initialize = async () => {
      try {
        await Promise.all([initServices(), initNotifications()]);
        setIsInitialized(true);
        console.log('🎯 App fully initialized - navigation ready');
      } catch (error) {
        console.error('⚠️ Initialization error caught:', error);
        // Still mark as initialized to allow app to continue
        setIsInitialized(true);
      }
    };

    initialize();
  }, []);

  // Show splash/loading screen while initializing
  if (!isInitialized) {
    return (
      <SafeAreaProvider>
        <View className="flex-1 justify-center items-center bg-white">
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <HomeTab />
        <StatusBar style="auto" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
