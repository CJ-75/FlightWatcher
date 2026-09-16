import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { ActivityIndicator, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import { LoginScreen } from './src/screens/LoginScreen'
import { SearchScreen } from './src/screens/SearchScreen'
import { ResultsScreen } from './src/screens/ResultsScreen'
import { FavoritesScreen } from './src/screens/FavoritesScreen'
import { ProfileScreen } from './src/screens/ProfileScreen'
import type { EnrichedTripResponse } from '@flightwatcher/shared'

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

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0B1F33' },
        headerTintColor: '#F4F7FA',
        tabBarStyle: { backgroundColor: '#0B1F33' },
        tabBarActiveTintColor: '#3DBDA7',
        tabBarInactiveTintColor: '#8FA3B5',
      }}
    >
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: 'Recherche' }} />
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
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B1F33' }}>
        <ActivityIndicator color="#3DBDA7" size="large" />
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
            options={{ headerShown: true, title: 'Résultats', headerStyle: { backgroundColor: '#0B1F33' }, headerTintColor: '#fff' }}
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
      <NavigationContainer>
        <StatusBar style="light" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  )
}
