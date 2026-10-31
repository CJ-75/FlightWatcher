import React, { Suspense, useCallback, useEffect, useState } from 'react'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native'
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
import { colors, fonts } from './src/theme'
import { FloatingTabBar, FLOATING_TAB_HEIGHT, FLOATING_TAB_MARGIN } from './src/components/FloatingTabBar'
import { stackHeaderOptions } from './src/navigation/stackHeader'
import type { MainTabParamList, RootStackParamList } from './src/navigation/types'

export type {
  SearchInfo,
  MainTabParamList,
  RootStackParamList,
} from './src/navigation/types'

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

/** App cold start only — branded splash. */
function AppSplash() {
  return (
    <View style={styles.boot}>
      {/* System font — Sora may not be loaded yet */}
      <Text style={styles.bootBrand}>FlightWatcher</Text>
      <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
    </View>
  )
}

/** In-app loads (lazy routes, auth) — spinner only, no brand. */
function RouteSpinner() {
  return (
    <View style={styles.routeSpin}>
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
      <Suspense fallback={<RouteSpinner />}>
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
  import('./src/screens/BookingsScreen').then((m) => ({
    default: m.BookingsScreen ?? (m as { default: typeof m.BookingsScreen }).default,
  })),
)
const DealCheckoutScreen = lazyScreen(() =>
  import('./src/screens/DealCheckoutScreen').then((m) => ({ default: m.DealCheckoutScreen })),
)
const HotelComposeScreen = lazyScreen(() =>
  import('./src/screens/HotelComposeScreen').then((m) => ({ default: m.HotelComposeScreen })),
)
const TripSummaryScreen = lazyScreen(() =>
  import('./src/screens/TripSummaryScreen').then((m) => ({ default: m.TripSummaryScreen })),
)
const PlannerInviteScreen = lazyScreen(() =>
  import('./src/screens/PlannerInviteScreen').then((m) => ({ default: m.PlannerInviteScreen })),
)
const HotelPayWebViewScreen = lazyScreen(() =>
  import('./src/screens/HotelPayWebViewScreen').then((m) => ({
    default: m.HotelPayWebViewScreen,
  })),
)
const InAppBrowserScreen = lazyScreen(() =>
  import('./src/screens/InAppBrowserScreen').then((m) => ({ default: m.InAppBrowserScreen })),
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
      initialRouteName="Search"
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

  // Auth boot: branded carousel — 1100ms hold if session, then Main → Search
  if (loading) {
    return <LoginScreen />
  }

  const signedIn = !!user || isGuest

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={signedIn ? 'Main' : 'Login'}
    >
      {signedIn ? (
        <>
          <Stack.Screen
            name="Main"
            component={MainTabs}
            initialParams={{ screen: 'Search' }}
          />
          <Stack.Screen
            name="Results"
            component={ResultsScreen}
            options={stackHeaderOptions('Résultats')}
          />
          <Stack.Screen
            name="DealDetail"
            component={DealDetailScreen}
            options={stackHeaderOptions('Deal')}
          />
          <Stack.Screen
            name="TripDetail"
            component={TripDetailScreen}
            options={stackHeaderOptions('Voyage')}
          />
          <Stack.Screen
            name="Security"
            component={SecurityScreen}
            options={stackHeaderOptions('Sécurité')}
          />
          <Stack.Screen
            name="Bookings"
            component={BookingsScreen}
            options={{
              ...stackHeaderOptions(''),
              headerTransparent: true,
              headerTitle: '',
              headerTintColor: '#FFF9F5',
            }}
          />
          <Stack.Screen
            name="HotelCompose"
            component={HotelComposeScreen}
            options={stackHeaderOptions('Choisir un hôtel')}
          />
          <Stack.Screen
            name="TripSummary"
            component={TripSummaryScreen}
            options={stackHeaderOptions('Mon voyage')}
          />
          <Stack.Screen
            name="PlannerInvite"
            component={PlannerInviteScreen}
            options={stackHeaderOptions('Invitation')}
          />
          <Stack.Screen
            name="DealCheckout"
            component={DealCheckoutScreen}
            options={stackHeaderOptions('Payer l’hôtel')}
          />
          <Stack.Screen
            name="HotelPayWebView"
            component={HotelPayWebViewScreen}
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="InAppBrowser"
            component={InAppBrowserScreen}
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen
            name="PlannerInvite"
            component={PlannerInviteScreen}
            options={stackHeaderOptions('Invitation')}
          />
        </>
      )}
    </Stack.Navigator>
  )
}

const linking = {
  prefixes: ['flightwatcher://'],
  config: {
    screens: {
      PlannerInvite: 'planner/invite/:token',
      Main: {
        screens: {
          Search: 'vols',
          Deals: 'sejours',
          Planner: 'planner',
          Favorites: 'favoris',
          Profile: 'profil',
        },
      },
    },
  },
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
    return <AppSplash />
  }

  return (
    <SafeAreaProvider onLayout={onLayoutRoot}>
      <AuthProvider>
        <NavigationContainer theme={navTheme} linking={linking as any}>
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
    backgroundColor: '#0A0604',
    paddingHorizontal: 28,
  },
  bootBrand: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: '#FFF9F5',
  },
  routeSpin: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
})
