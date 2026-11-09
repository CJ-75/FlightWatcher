import React, { Suspense, useCallback, useEffect, useState } from 'react'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { readPendingInvite } from './src/lib/pendingInvite'
import { navigationRef } from './src/navigation/navigationRef'
import {
  useFonts,
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
} from '@expo-google-fonts/sora'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import { scheduleActivitiesWarmup } from './src/lib/activitiesWarmup'
import { AuthSheetHost } from './src/components/onboarding/AuthSheetHost'
import { OnboardingFlowScreen } from './src/screens/OnboardingFlowScreen'
import {
  FirstNameSheet,
  shouldPromptFirstName,
} from './src/components/onboarding/FirstNameSheet'
import {
  OnboardingGateProvider,
  useOnboardingGate,
} from './src/context/OnboardingGateContext'
import {
  configureOnboardingKv,
  loadOnboardingPrefs,
} from '@flightwatcher/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'

configureOnboardingKv({
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  removeItem: (k) => AsyncStorage.removeItem(k),
})
import { LoginScreen } from './src/screens/LoginScreen'
import { SearchScreen } from './src/screens/SearchScreen'
import { ParcoursHubScreen } from './src/screens/ParcoursHubScreen'
import { ActivitiesScreen } from './src/screens/ActivitiesScreen'
import { PlannerScreen } from './src/screens/PlannerScreen'
import { FavoritesScreen } from './src/screens/FavoritesScreen'
import { ProfileScreen } from './src/screens/ProfileScreen'
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

/** Stack screens only — tab screens are eager (Metro + React.lazy flaky under Fabric). */
function lazyScreen<P extends object>(
  loader: () => Promise<{ default: React.ComponentType<P> }>,
  label = 'Screen',
): React.ComponentType<P> {
  const Lazy = React.lazy(async () => {
    const mod = await loader()
    if (!mod?.default) {
      throw new Error(`[lazyScreen] ${label}: export default manquant`)
    }
    return mod
  })
  function Wrapped(props: P) {
    return (
      <Suspense fallback={<RouteSpinner />}>
        <Lazy {...props} />
      </Suspense>
    )
  }
  Wrapped.displayName = `LazyScreen(${label})`
  return Wrapped
}

const ResultsScreen = lazyScreen(
  () =>
    import('./src/screens/ResultsScreen').then((m) => ({ default: m.ResultsScreen })),
  'ResultsScreen',
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
const ItineraryDetailScreen = lazyScreen(() =>
  import('./src/screens/ItineraryDetailScreen').then((m) => ({
    default: m.ItineraryDetailScreen,
  })),
)
const SecurityScreen = lazyScreen(() =>
  import('./src/screens/SecurityScreen').then((m) => ({ default: m.SecurityScreen })),
)
const NotFoundScreen = lazyScreen(() =>
  import('./src/screens/NotFoundScreen').then((m) => ({ default: m.NotFoundScreen })),
)

function MainTabs() {
  const insets = useSafeAreaInsets()
  const tabClearance =
    FLOATING_TAB_HEIGHT + FLOATING_TAB_MARGIN + Math.max(insets.bottom, 10)
  const [activitiesUiEnabled, setActivitiesUiEnabled] = useState(true)

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

  React.useEffect(() => {
    let cancelled = false
    void import('./src/lib/client')
      .then(({ getApi }) => getApi().getConfig())
      .then((cfg) => {
        if (!cancelled) setActivitiesUiEnabled(cfg.activities_ui_enabled !== false)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Tab.Navigator
      initialRouteName="Deals"
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
        name="Activities"
        component={ActivitiesScreen}
        options={{
          title: 'Activités',
          headerShown: false,
          href: activitiesUiEnabled ? undefined : null,
        }}
      />
      <Tab.Screen
        name="Deals"
        component={ParcoursHubScreen}
        options={{ title: 'Parcours', headerShown: false }}
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
        options={{
          title: 'Profil',
          headerShown: false,
          // Compte via avatar haut-droite — pas dans la tab bar
          href: null,
        }}
      />
    </Tab.Navigator>
  )
}

function RootNavigator() {
  const { user, loading, isGuest } = useAuth()
  const pendingInviteHandled = React.useRef(false)
  const { forceOnboarding, clearForceOnboarding } = useOnboardingGate()
  const [needsOnboarding, setNeedsOnboarding] = React.useState<boolean | null>(
    null,
  )
  const [showFirstName, setShowFirstName] = React.useState(false)

  // Après Google OAuth : reprendre le lien d’invite → join auto.
  useEffect(() => {
    if (loading || !user || isGuest || pendingInviteHandled.current) return
    let cancelled = false
    void (async () => {
      const token = await readPendingInvite()
      if (cancelled || !token || token.startsWith('dev-invite-')) return
      pendingInviteHandled.current = true
      const go = () => {
        if (!navigationRef.isReady()) {
          requestAnimationFrame(go)
          return
        }
        navigationRef.navigate('PlannerInvite', { token })
      }
      go()
    })()
    return () => {
      cancelled = true
    }
  }, [loading, user, isGuest])

  useEffect(() => {
    if (loading) return
    if (!user && !isGuest) {
      setNeedsOnboarding(false)
      return
    }
    let cancelled = false
    const fallback = setTimeout(() => {
      if (!cancelled) setNeedsOnboarding(false)
    }, 1500)
    void loadOnboardingPrefs()
      .then((p) => {
        if (!cancelled) setNeedsOnboarding(!p.onboardingCompletedAt)
      })
      .catch(() => {
        if (!cancelled) setNeedsOnboarding(false)
      })
      .finally(() => clearTimeout(fallback))
    return () => {
      cancelled = true
      clearTimeout(fallback)
    }
  }, [loading, user, isGuest])

  useEffect(() => {
    if (loading || !user || isGuest) return
    const meta = user.user_metadata || {}
    const oauthName =
      (meta.full_name as string) ||
      (meta.name as string) ||
      (meta.given_name as string) ||
      ''
    void shouldPromptFirstName(oauthName).then((need) => {
      if (need) setShowFirstName(true)
    })
  }, [loading, user, isGuest])

  // Post-login/guest only: background warm for likely next screens (activités).
  // Never from LoginScreen — keep pre-auth boot free of API catalogue work.
  useEffect(() => {
    if (loading || needsOnboarding === null) return
    if (needsOnboarding || forceOnboarding) return
    if (!user && !isGuest) return
    const key = user?.id || (isGuest ? 'guest' : '')
    if (!key) return
    scheduleActivitiesWarmup(key)
  }, [loading, needsOnboarding, forceOnboarding, user, isGuest])

  // Auth boot — puis Main → Parcours (home)
  if (loading || needsOnboarding === null) {
    return <LoginScreen />
  }

  const signedIn = !!user || isGuest

  if (signedIn && (needsOnboarding || forceOnboarding)) {
    return (
      <>
        <OnboardingFlowScreen
          onDone={() => {
            clearForceOnboarding()
            setNeedsOnboarding(false)
          }}
        />
        <FirstNameSheet
          open={showFirstName}
          onDone={() => setShowFirstName(false)}
        />
      </>
    )
  }

  return (
    <>
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={signedIn ? 'Main' : 'Login'}
    >
      {signedIn ? (
        <>
          <Stack.Screen
            name="Main"
            component={MainTabs}
            initialParams={{ screen: 'Deals' }}
          />
          <Stack.Screen
            name="Results"
            component={ResultsScreen}
            options={stackHeaderOptions('Résultats')}
          />
          <Stack.Screen
            name="DealDetail"
            component={DealDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="TripDetail"
            component={TripDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Security"
            component={SecurityScreen}
            options={stackHeaderOptions('Sécurité')}
          />
          <Stack.Screen
            name="Bookings"
            component={BookingsScreen}
            options={stackHeaderOptions('')}
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
          <Stack.Screen
            name="ItineraryDetail"
            component={ItineraryDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="NotFound"
            component={NotFoundScreen}
            options={{ headerShown: false }}
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
          <Stack.Screen
            name="NotFound"
            component={NotFoundScreen}
            options={{ headerShown: false }}
          />
        </>
      )}
    </Stack.Navigator>
    <FirstNameSheet
      open={showFirstName}
      onDone={() => setShowFirstName(false)}
    />
    </>
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
          Activities: {
            path: 'activites/:city?',
            parse: { city: (c: string) => c },
          },
          Planner: 'planner',
          Favorites: 'favoris',
          Profile: 'profil',
        },
      },
      ItineraryDetail: 'parcours/:itineraryId',
      NotFound: '*',
    },
  },
}

const FONT_GATE_MS = 1500

export default function App() {
  // Instrument Serif is vendored under assets/fonts — Metro cannot reliably
  // resolve @expo-google-fonts/instrument-serif from the monorepo root hoist.
  const [fontsLoaded] = useFonts({
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
    InstrumentSerif_400Regular: require('./assets/fonts/InstrumentSerif_400Regular.ttf'),
    InstrumentSerif_400Regular_Italic: require('./assets/fonts/InstrumentSerif_400Regular_Italic.ttf'),
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
        <OnboardingGateProvider>
          <AuthSheetHost>
            <NavigationContainer
              ref={navigationRef}
              theme={navTheme}
              linking={linking as any}
            >
              <StatusBar style="dark" />
              <RootNavigator />
            </NavigationContainer>
          </AuthSheetHost>
        </OnboardingGateProvider>
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
