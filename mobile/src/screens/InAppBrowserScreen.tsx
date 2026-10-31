import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { WebView } from 'react-native-webview'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { RootStackParamList } from '../navigation/types'
import { ModalScreenHeader } from '../components/ModalScreenHeader'
import { colors, fonts, spacing } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'InAppBrowser'>

/** Full-screen in-app browser — no system Safari/Chrome tab. */
export function InAppBrowserScreen({ route, navigation }: Props) {
  const { url, title } = route.params
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ModalScreenHeader
        title={title || 'FlightWatcher'}
        onClose={() => navigation.goBack()}
      />

      {failed ? (
        <View style={styles.center}>
          <Text style={styles.error}>Impossible de charger la page</Text>
          <Pressable
            style={styles.retry}
            onPress={() => {
              setFailed(false)
              setLoading(true)
              setReloadKey((k) => k + 1)
            }}
          >
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.webWrap}>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
          <WebView
            key={reloadKey}
            source={{ uri: url }}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false)
              setFailed(true)
            }}
            startInLoadingState
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            style={styles.web}
          />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  webWrap: { flex: 1 },
  web: { flex: 1, backgroundColor: colors.white },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    backgroundColor: colors.canvas,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: 12,
  },
  error: { fontFamily: fonts.medium, fontSize: 15, color: colors.inkSoft },
  retry: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  retryText: { fontFamily: fonts.bold, color: colors.white },
})
