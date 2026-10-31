import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getWebOrigin } from '../lib/client'
import type { RootStackParamList } from '../../App'
import { colors, fonts, spacing } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'HotelPayWebView'>

export function HotelPayWebViewScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets()
  const {
    bookingId,
    publicKey,
    secretKey,
    draftToken,
    firstName,
    lastName,
    email,
    liteapiEnv,
  } = route.params
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const url = useMemo(() => {
    const q = new URLSearchParams({
      booking_id: bookingId,
      public_key: publicKey,
      secret_key: secretKey,
      firstName,
      lastName,
      email,
    })
    if (draftToken) q.set('draft_token', draftToken)
    if (liteapiEnv) q.set('env', liteapiEnv)
    return `${getWebOrigin()}/pay/hotel?${q.toString()}`
  }, [
    bookingId,
    publicKey,
    secretKey,
    draftToken,
    firstName,
    lastName,
    email,
    liteapiEnv,
  ])

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type?: string
        confirmation_code?: string
        booking_id?: string
        message?: string
      }
      if (data.type === 'booked') {
        navigation.navigate({
          name: 'DealCheckout',
          params: {
            dealId: route.params.returnDealId,
            draftToken: draftToken || undefined,
            hotelId: route.params.returnHotelId,
            payResult: {
              confirmation: String(
                data.confirmation_code || data.booking_id || 'ok',
              ),
              bookingId: data.booking_id || bookingId,
            },
          },
          merge: true,
        })
        navigation.goBack()
      } else if (data.type === 'error' && data.message) {
        setError(data.message)
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.done} hitSlop={8}>
          <Text style={styles.doneText}>Fermer</Text>
        </Pressable>
        <Text style={styles.title}>Paiement</Text>
        <View style={{ width: 64 }} />
      </View>
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      <View style={styles.webWrap}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}
        <WebView
          source={{ uri: url }}
          onLoadEnd={() => setLoading(false)}
          onMessage={onMessage}
          startInLoadingState
          setSupportMultipleWindows={false}
          style={styles.web}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.white,
  },
  done: { minWidth: 64, minHeight: 40, justifyContent: 'center' },
  doneText: { fontFamily: fonts.bold, fontSize: 15, color: colors.primary },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  errorBanner: {
    padding: 10,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  webWrap: { flex: 1 },
  web: { flex: 1, backgroundColor: colors.white },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    backgroundColor: colors.canvas,
  },
})
