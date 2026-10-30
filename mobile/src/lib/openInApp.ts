import type { NavigationProp } from '@react-navigation/native'
import type { RootStackParamList } from '../../App'

type Nav = NavigationProp<RootStackParamList>

/** Open URL inside the app WebView stack screen (never system browser tab). */
export function openInAppBrowser(
  navigation: Nav,
  url: string,
  title?: string,
) {
  const href = String(url || '').trim()
  if (!href) return
  navigation.navigate('InAppBrowser', { url: href, title })
}
