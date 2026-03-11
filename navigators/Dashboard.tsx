import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import DashboardScreen from "../screens/DashboardScreen";
import Profile from "../screens/Profile";
import Analyze from "../screens/Analyze";

const tab = createBottomTabNavigator();

const HomeTab = () => {
    return (
        <tab.Navigator>
            <tab.Screen name="Profile" component={Profile} options={{ headerShown: false }}/>
            <tab.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false }}/>
            <tab.Screen name="Analyze" component={Analyze} options={{ headerShown: false }}/>
        </tab.Navigator>
    )
}

export default HomeTab;