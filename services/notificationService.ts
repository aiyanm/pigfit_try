/**
 * Push Notification Service
 * Handles all push notifications for BLE connection/disconnection events
 * and critical health alerts
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Configure notification handler
 * This determines what happens when a notification arrives while app is in foreground
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Notification types for categorization
 */
export enum NotificationType {
  BLE_CONNECTED = 'ble_connected',
  BLE_DISCONNECTED = 'ble_disconnected',
  HEALTH_ALERT = 'health_alert',
  ANALYSIS_COMPLETE = 'analysis_complete',
}

/**
 * Initialize notifications - call once on app startup
 */
export const initializeNotifications = async (): Promise<void> => {
  try {
    // Request permissions
    const { status } = await Notifications.requestPermissionsAsync();

    if (status !== 'granted') {
      console.warn('⚠️ Notification permissions not granted');
      return;
    }

    console.log('✅ Notification permissions granted');

    // Configure notification channels for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('ble_alerts', {
        name: 'BLE Connection Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF3D00',
        sound: 'default',
        enableVibrate: true,
        enableLights: true,
      });

      await Notifications.setNotificationChannelAsync('health_alerts', {
        name: 'Health Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#FF6B6B',
        sound: 'default',
        enableVibrate: true,
        enableLights: true,
      });

      await Notifications.setNotificationChannelAsync('analysis_complete', {
        name: 'Analysis Complete',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 100, 100, 100],
        lightColor: '#4CAF50',
        sound: 'default',
        enableVibrate: true,
      });
    }
  } catch (error) {
    console.error('❌ Failed to initialize notifications:', error);
  }
};

/**
 * Send BLE connected notification
 */
export const notifyBLEConnected = async (deviceName: string): Promise<void> => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '📡 BLE Connected',
        body: `Successfully connected to ${deviceName}`,
        data: {
          type: NotificationType.BLE_CONNECTED,
          deviceName,
          timestamp: new Date().toISOString(),
        },
        sound: 'default',
        badge: 1,
      },
      trigger: null, // Send immediately
    });

    console.log(`✅ BLE connected notification sent for ${deviceName}`);
  } catch (error) {
    console.error('❌ Failed to send BLE connected notification:', error);
  }
};

/**
 * Send BLE disconnected notification
 */
export const notifyBLEDisconnected = async (deviceName: string): Promise<void> => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '📡 BLE Disconnected',
        body: `Lost connection to ${deviceName}. Check device proximity and battery.`,
        data: {
          type: NotificationType.BLE_DISCONNECTED,
          deviceName,
          timestamp: new Date().toISOString(),
        },
        sound: 'default',
        badge: 2,
      },
      trigger: null, // Send immediately
    });

    console.log(`⚠️ BLE disconnected notification sent for ${deviceName}`);
  } catch (error) {
    console.error('❌ Failed to send BLE disconnected notification:', error);
  }
};

/**
 * Send health alert notification
 */
export const notifyHealthAlert = async (
  pigId: string,
  alertType: string,
  severity: 'low' | 'medium' | 'high' | 'critical'
): Promise<void> => {
  try {
    const severityEmoji = {
      low: '⚠️',
      medium: '🟡',
      high: '🔴',
      critical: '🚨',
    };

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${severityEmoji[severity]} Health Alert - ${pigId}`,
        body: alertType,
        data: {
          type: NotificationType.HEALTH_ALERT,
          pigId,
          alertType,
          severity,
          timestamp: new Date().toISOString(),
        },
        sound: 'default',
        badge: severity === 'critical' ? 3 : 1,
      },
      trigger: null, // Send immediately
    });

    console.log(`${severityEmoji[severity]} Health alert sent: ${pigId} - ${alertType}`);
  } catch (error) {
    console.error('❌ Failed to send health alert notification:', error);
  }
};

/**
 * Send analysis complete notification
 */
export const notifyAnalysisComplete = async (
  pigId: string,
  status: 'healthy' | 'needs_watching' | 'needs_help',
  timeMs: number
): Promise<void> => {
  try {
    const statusEmoji = {
      healthy: '✅',
      needs_watching: '⚠️',
      needs_help: '🚨',
    };

    const statusText = {
      healthy: 'Healthy',
      needs_watching: 'Needs Watching',
      needs_help: 'Needs Help Now',
    };

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${statusEmoji[status]} Analysis Complete`,
        body: `${pigId}: ${statusText[status]} (completed in ${(timeMs / 1000).toFixed(1)}s)`,
        data: {
          type: NotificationType.ANALYSIS_COMPLETE,
          pigId,
          status,
          timeMs,
          timestamp: new Date().toISOString(),
        },
        sound: 'default',
        badge: 1,
      },
      trigger: null,
    });

    console.log(
      `✅ Analysis complete notification sent: ${pigId} - ${statusText[status]}`
    );
  } catch (error) {
    console.error('❌ Failed to send analysis complete notification:', error);
  }
};

/**
 * Listen for notification responses (when user taps notification)
 * Usage: call once in your main App component
 */
export const setupNotificationListeners = (
  onNotificationResponse: (
    type: NotificationType,
    data: Record<string, any>
  ) => void
): (() => void) => {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as Record<string, any>;
      if (data && data.type) {
        const { type, ...restData } = data;
        onNotificationResponse(type as NotificationType, restData);
      }
    }
  );

  return () => subscription.remove();
};

/**
 * Clear all pending notifications
 */
export const clearAllNotifications = async (): Promise<void> => {
  try {
    await Notifications.dismissAllNotificationsAsync();
    console.log('✅ All notifications cleared');
  } catch (error) {
    console.error('❌ Failed to clear notifications:', error);
  }
};

/**
 * Get notification badge count
 */
export const getNotificationBadgeCount = async (): Promise<number> => {
  try {
    return await Notifications.getBadgeCountAsync();
  } catch (error) {
    console.error('❌ Failed to get badge count:', error);
    return 0;
  }
};

/**
 * Set notification badge count
 */
export const setNotificationBadgeCount = async (count: number): Promise<void> => {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (error) {
    console.error('❌ Failed to set badge count:', error);
  }
};
