import { Linking } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import type { NavigationProp } from '@react-navigation/native'
import type { RootStackParamList } from '../navigation/types'

type Nav = NavigationProp<RootStackParamList>

function normalizeHttpUrl(url: string): string {
  const href = String(url || '').trim()
  if (!href) return ''
  if (/^https?:\/\//i.test(href)) return href
  if (href.startsWith('//')) return `https:${href}`
  return `https://${href}`
}

/**
 * Open a partner / external URL in an in-app browser sheet
 * (SFSafariViewController / Chrome Custom Tabs).
 * Falls back to the WebView stack screen, then system Linking.
 */
export async function openInAppBrowser(
  navigation: Nav | null | undefined,
  url: string,
  title?: string,
): Promise<void> {
  const href = normalizeHttpUrl(url)
  if (!href) return

  try {
    await WebBrowser.openBrowserAsync(href, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      controlsColor: '#FF6B35',
      toolbarColor: '#FFF9F5',
      showTitle: true,
      enableBarCollapsing: true,
    })
    return
  } catch {
    /* fallback below */
  }

  try {
    if (navigation?.navigate) {
      navigation.navigate('InAppBrowser', { url: href, title })
      return
    }
  } catch {
    /* fallback below */
  }

  try {
    await Linking.openURL(href)
  } catch {
    /* caller may show its own alert */
  }
}
