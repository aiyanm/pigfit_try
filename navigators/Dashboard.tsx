import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import DashboardScreen from "../screens/DashboardScreen";
import { Ionicons } from '@expo/vector-icons';
import Profile from "../screens/Profile";
import Analyze from "../screens/Analyze";


const tab = createBottomTabNavigator();

const HomeTab = () => {
    return (
        <tab.Navigator>
            <tab.Screen name="Profile" component={Profile} options={{ headerShown: false, tabBarIcon: ({ focused, color, size }) => (
                <Ionicons name="person" size={size} color={color} />
            ) }} />

            <tab.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false, tabBarIcon: ({ focused, color, size }) => (
                <Ionicons name="home" size={size} color={color} />
            ) }} />

            <tab.Screen name="Analyze" component={Analyze} options={{ headerShown: false, tabBarIcon: ({ focused, color, size }) => (
                <Ionicons name="analytics" size={size} color={color} />
            ) }} />
        </tab.Navigator>
    )
}

export default HomeTab;