import React, { useCallback } from 'react'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { ActivityIndicator, View, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  useFonts,
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
} from '@expo-google-fonts/sora'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import { LoginScreen } from './src/screens/LoginScreen'
import { SearchScreen } from './src/screens/SearchScreen'
import { ResultsScreen } from './src/screens/ResultsScreen'
import { DealsScreen } from './src/screens/DealsScreen'
import { DealDetailScreen } from './src/screens/DealDetailScreen'
import { PlannerScreen } from './src/screens/PlannerScreen'
import { TripDetailScreen } from './src/screens/TripDetailScreen'
import { FavoritesScreen } from './src/screens/FavoritesScreen'
import { ProfileScreen } from './src/screens/ProfileScreen'
import type { DateAvecHoraire, DatePresetId, EnrichedTripResponse } from '@flightwatcher/shared'
import { colors, fonts } from './src/theme'
import { FloatingTabBar, FLOATING_TAB_HEIGHT, FLOATING_TAB_MARGIN } from './src/components/FloatingTabBar'

export type SearchInfo = {
  airport: string
  budget: number
  passengers?: number
  datePreset: DatePresetId
  datesDepart: DateAvecHoraire[]
  datesRetour: DateAvecHoraire[]
  excludedDestinations: string[]
  searchEventId?: string | null
}

export type RootStackParamList = {
  Login: undefined
  Main: undefined
  Results: {
    trips: EnrichedTripResponse[]
    title?: string
    searchInfo?: SearchInfo
  }
  DealDetail: {
    dealId: string
  }
  TripDetail: {
    tripId: string
  }
}

export type MainTabParamList = {
  Search: undefined
  Deals: undefined
  Planner: undefined
  Favorites: undefined
  Profile: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator<MainTabParamList>()

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.canvas,
    card: colors.surface,
    text: colors.ink,
    border: colors.line,
    primary: colors.primary,
  },
}

function MainTabs() {
  const insets = useSafeAreaInsets()
  const tabClearance = FLOATING_TAB_HEIGHT + FLOATING_TAB_MARGIN + Math.max(insets.bottom, 10)

  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.canvas,
        },
        headerTitleStyle: {
          fontFamily: fonts.bold,
          color: colors.ink,
          fontSize: 18,
        },
        headerShadowVisible: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
        sceneStyle: {
          paddingBottom: tabClearance,
        },
      }}
    >
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{ title: 'Recherche', headerShown: false }}
      />
      <Tab.Screen
        name="Deals"
        component={DealsScreen}
        options={{ title: 'Deals', headerShown: false }}
      />
      <Tab.Screen
        name="Planner"
        component={PlannerScreen}
        options={{ title: 'Planner', headerShown: false }}
      />
      <Tab.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{ title: 'Favoris', headerShown: false }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profil', headerShown: false }}
      />
    </Tab.Navigator>
  )
}

function RootNavigator() {
  const { user, loading, isGuest } = useAuth()

  if (loading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  const signedIn = !!user || isGuest

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
              headerStyle: { backgroundColor: colors.canvas },
              headerTintColor: colors.primary,
              headerTitleStyle: {
                fontFamily: fonts.bold,
                color: colors.ink,
                fontSize: 18,
              },
              headerShadowVisible: false,
              headerBackTitle: 'Retour',
            }}
          />
          <Stack.Screen
            name="DealDetail"
            component={DealDetailScreen}
            options={{
              headerShown: true,
              title: 'Deal',
              headerStyle: { backgroundColor: colors.canvas },
              headerTintColor: colors.primary,
              headerTitleStyle: {
                fontFamily: fonts.bold,
                color: colors.ink,
                fontSize: 18,
              },
              headerShadowVisible: false,
              headerBackTitle: 'Retour',
            }}
          />
          <Stack.Screen
            name="TripDetail"
            component={TripDetailScreen}
            options={{
              headerShown: true,
              title: 'Voyage',
              headerStyle: { backgroundColor: colors.canvas },
              headerTintColor: colors.primary,
              headerTitleStyle: {
                fontFamily: fonts.bold,
                color: colors.ink,
                fontSize: 18,
              },
              headerShadowVisible: false,
              headerBackTitle: 'Retour',
            }}
          />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  )
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
  })

  const onLayoutRoot = useCallback(() => undefined, [])

  if (!fontsLoaded) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  return (
    <SafeAreaProvider onLayout={onLayoutRoot}>
      <AuthProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="dark" />
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
})
