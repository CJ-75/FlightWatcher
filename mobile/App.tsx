import React, { useCallback } from 'react'
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
import { ResultsScreen } from './src/screens/ResultsScreen'
import { FavoritesScreen } from './src/screens/FavoritesScreen'
import { ProfileScreen } from './src/screens/ProfileScreen'
import type { EnrichedTripResponse } from '@flightwatcher/shared'
import { colors, fonts } from './src/theme'

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
    background: colors.canvas,
    card: colors.surface,
    text: colors.ink,
    border: colors.line,
    primary: colors.primary,
  },
}

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Search: '⌕',
    Favorites: '♥',
    Profile: '◎',
  }
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <Text style={[styles.tabIconText, focused && styles.tabIconTextActive]}>
        {icons[label] || '•'}
      </Text>
    </View>
  )
}

function MainTabs() {
  const insets = useSafeAreaInsets()
  const bottom = Math.max(insets.bottom, 8)

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
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
          backgroundColor: colors.white,
          borderTopColor: colors.line,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 58 + bottom,
          paddingBottom: bottom,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: {
          fontFamily: fonts.semibold,
          fontSize: 11,
          marginTop: 2,
        },
        tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
      })}
    >
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{ title: 'Recherche', headerShown: false }}
      />
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
      <View style={styles.boot}>
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
        <Stack.Screen name="Login">
          {() => <LoginScreen onContinueAsGuest={() => setGuest(true)} />}
        </Stack.Screen>
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
  tabIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconActive: {
    backgroundColor: colors.primarySoft,
  },
  tabIconText: {
    fontSize: 15,
    color: colors.faint,
    fontFamily: fonts.semibold,
  },
  tabIconTextActive: {
    color: colors.primary,
  },
})
