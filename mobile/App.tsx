import React from 'react'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { ActivityIndicator, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import { LoginScreen } from './src/screens/LoginScreen'
import { SearchScreen } from './src/screens/SearchScreen'
import { ResultsScreen } from './src/screens/ResultsScreen'
import { FavoritesScreen } from './src/screens/FavoritesScreen'
import { ProfileScreen } from './src/screens/ProfileScreen'
import type { EnrichedTripResponse } from '@flightwatcher/shared'
import { colors } from './src/theme'

export type RootStackParamList = {
  Login: undefined
  Main: undefined
  Results: { trips: EnrichedTripResponse[]; title?: string }
}

export type MainTabParamList = {
  Search: undefined
  Favorites: undefined
  Profile: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator<MainTabParamList>()

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.white,
    text: colors.slate900,
    border: colors.slate200,
    primary: colors.primary,
  },
}

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Search: '🔍',
    Favorites: '❤️',
    Profile: '👤',
  }
  return (
    <Text style={{ fontSize: focused ? 20 : 18, opacity: focused ? 1 : 0.55 }}>
      {icons[label] || '•'}
    </Text>
  )
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: {
          backgroundColor: colors.white,
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTitleStyle: { fontWeight: '900', color: colors.slate900, fontSize: 18 },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.slate200,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.slate400,
        tabBarLabelStyle: { fontWeight: '700', fontSize: 12 },
        tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
      })}
    >
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: 'Recherche', headerShown: false }} />
      <Tab.Screen name="Favorites" component={FavoritesScreen} options={{ title: 'Favoris' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
    </Tab.Navigator>
  )
}

function RootNavigator() {
  const { user, loading } = useAuth()
  const [guest, setGuest] = React.useState(false)

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  const signedIn = !!user || guest

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {signedIn ? (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen
            name="Results"
            component={ResultsScreen}
            options={{
              headerShown: true,
              title: 'Résultats',
              headerStyle: { backgroundColor: colors.white },
              headerTintColor: colors.primary,
              headerTitleStyle: { fontWeight: '900', color: colors.slate900 },
              headerShadowVisible: false,
            }}
          />
        </>
      ) : (
        <Stack.Screen name="Login">
          {() => <LoginScreen onContinueAsGuest={() => setGuest(true)} />}
        </Stack.Screen>
      )}
    </Stack.Navigator>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer theme={navTheme}>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  )
}
