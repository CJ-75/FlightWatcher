import { createApiClient, createSupabaseAuth, createAsyncKVStore, type ApiClient } from '@flightwatcher/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Linking from 'expo-linking'
import Constants from 'expo-constants'

const apiBase =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ||
  'http://localhost:8000'

export const kv = createAsyncKVStore(AsyncStorage)

export const redirectTo = Linking.createURL('auth/callback')

export const auth = createSupabaseAuth({
  apiBaseUrl: apiBase,
  redirectTo,
  authOptions: {
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
    storage: AsyncStorage,
  },
})

let api: ApiClient | null = null

export function getApi(): ApiClient {
  if (!api) {
    api = createApiClient({
      baseUrl: apiBase,
      getToken: () => auth.getAccessToken(),
    })
  }
  return api
}

export { apiBase }
