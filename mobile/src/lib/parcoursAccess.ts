import Constants from 'expo-constants'
import { canCreateParcours } from '@flightwatcher/shared'

/** Expo Go or Metro __DEV__ — unlock create parcours for testing. */
export function isExpoParcoursDevBypass(): boolean {
  return Constants.appOwnership === 'expo' || (typeof __DEV__ !== 'undefined' && __DEV__)
}

export function canCreateParcoursOnDevice(email?: string | null): boolean {
  return canCreateParcours({
    email,
    expoDevBypass: isExpoParcoursDevBypass(),
  })
}
