import React, { Suspense, useCallback, useEffect, useState } from 'react'
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

export type MainTabParamList = {
  Search:
    | {
        origin?: string
        adults?: number
        destination?: string
        city?: string
        outbound?: string
        inbound?: string
        autoSearch?: boolean
      }
    | undefined
  Deals: undefined
  Planner: undefined
  Favorites: undefined
  Profile: undefined
}

export type RootStackParamList = {
  Login: undefined
  Main:
    | undefined
    | {
        screen?: keyof MainTabParamList
        params?: MainTabParamList[keyof MainTabParamList]
      }
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
    /** Création → lancer le scan immédiatement */
    autoScan?: boolean
  }
  Security: undefined
  Bookings: undefined
  DealCheckout: { dealId: string; hotelId?: string }
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

function BootSpinner() {
  return (
    <View style={styles.boot}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  )
}

/** Defer heavy screens until first navigation — keeps cold start lean. */
function lazyScreen<P extends object>(
  loader: () => Promise<{ default: React.ComponentType<P> }>,
): React.ComponentType<P> {
  const Lazy = React.lazy(loader)
  function Wrapped(props: P) {
    return (
      <Suspense fallback={<BootSpinner />}>
        <Lazy {...props} />
      </Suspense>
    )
  }
  Wrapped.displayName = 'LazyScreen'
  return Wrapped
}

const DealsScreen = lazyScreen(() =>
  import('./src/screens/DealsScreen').then((m) => ({ default: m.DealsScreen })),
)
const PlannerScreen = lazyScreen(() =>
  import('./src/screens/PlannerScreen').then((m) => ({ default: m.PlannerScreen })),
)
const FavoritesScreen = lazyScreen(() =>
  import('./src/screens/FavoritesScreen').then((m) => ({ default: m.FavoritesScreen })),
)
const ProfileScreen = lazyScreen(() =>
  import('./src/screens/ProfileScreen').then((m) => ({ default: m.ProfileScreen })),
)
const ResultsScreen = lazyScreen(() =>
  import('./src/screens/ResultsScreen').then((m) => ({ default: m.ResultsScreen })),
)
const DealDetailScreen = lazyScreen(() =>
  import('./src/screens/DealDetailScreen').then((m) => ({ default: m.DealDetailScreen })),
)
const TripDetailScreen = lazyScreen(() =>
  import('./src/screens/TripDetailScreen').then((m) => ({ default: m.TripDetailScreen })),
)
const BookingsScreen = lazyScreen(() =>
  import('./src/screens/BookingsScreen').then((m) => ({ default: m.BookingsScreen })),
)
const DealCheckoutScreen = lazyScreen(() =>
  import('./src/screens/DealCheckoutScreen').then((m) => ({ default: m.DealCheckoutScreen })),
)
const SecurityScreen = lazyScreen(() =>
  import('./src/screens/SecurityScreen').then((m) => ({ default: m.SecurityScreen })),
)

function MainTabs() {
  const insets = useSafeAreaInsets()
  const tabClearance = FLOATING_TAB_HEIGHT + FLOATING_TAB_MARGIN + Math.max(insets.bottom, 10)

  // Airports after first paint — never compete with boot JS/fonts/auth
  React.useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      if (cancelled) return
      void import('./src/lib/airportsCache')
        .then(({ getCachedAirports }) => getCachedAirports())
        .catch((e) => {
          if (__DEV__) console.warn('[airports] prefetch failed', e)
        })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [])

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
        lazy: true,
        freezeOnBlur: true,
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
        options={{ title: 'Vols', headerShown: false }}
      />
      <Tab.Screen
        name="Deals"
        component={DealsScreen}
        options={{ title: 'Séjours', headerShown: false }}
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
    return <BootSpinner />
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
          <Stack.Screen
            name="Security"
            component={SecurityScreen}
            options={{
              headerShown: true,
              title: 'Sécurité',
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
            name="Bookings"
            component={BookingsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="DealCheckout"
            component={DealCheckoutScreen}
            options={{
              headerShown: true,
              title: 'Réservation hôtel',
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

const FONT_GATE_MS = 1500

export default function App() {
  const [fontsLoaded] = useFonts({
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
  })
  const [fontsTimedOut, setFontsTimedOut] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setFontsTimedOut(true), FONT_GATE_MS)
    return () => clearTimeout(t)
  }, [])

  const onLayoutRoot = useCallback(() => undefined, [])
  const ready = fontsLoaded || fontsTimedOut

  if (!ready) {
    return <BootSpinner />
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
