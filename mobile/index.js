import { DevSettings, LogBox } from 'react-native'
import { registerRootComponent } from 'expo'
import App from './App'

/**
 * Expo Go iOS < 58.0.7: DevSettings.reload() / Fast Refresh full reload
 * reuses a dead AppContext → "Cannot find native module 'ExpoAsset'",
 * often surfaced by Hermes as RejectionTrackingOptions.onUnhandled.
 * Prefer expo.reloadAppAsync when available (fixed path).
 * @see https://github.com/expo/expo/issues/52146
 */
function patchExpoGoBrokenReload() {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return

  try {
    LogBox.ignoreLogs([
      /ExpoAsset/,
      /RejectionTrackingOptions/,
      /runtime not ready/,
      /AppRegistryBinding::stopSurface/,
    ])
  } catch {
    /* ignore */
  }

  const expoGlobal = globalThis.expo
  const hasReloadAsync =
    expoGlobal && typeof expoGlobal.reloadAppAsync === 'function'

  const safeReload = () => {
    if (!hasReloadAsync) {
      console.warn(
        '[expo-go] Skip DevSettings.reload — update Expo Go to 58.0.7+ or fully kill & reopen the app.',
      )
      return
    }
    Promise.resolve(expoGlobal.reloadAppAsync()).catch((err) => {
      console.warn(
        '[expo-go] reloadAppAsync failed — kill Expo Go completely and reopen:',
        err,
      )
    })
  }

  try {
    if (DevSettings && typeof DevSettings.reload === 'function') {
      DevSettings.reload = safeReload
    }
  } catch {
    /* ignore */
  }

  try {
    const loc = globalThis.window?.location
    if (loc && typeof loc === 'object') {
      loc.reload = safeReload
    }
  } catch {
    /* ignore */
  }
}

patchExpoGoBrokenReload()
registerRootComponent(App)
