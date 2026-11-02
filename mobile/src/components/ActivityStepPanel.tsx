import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Platform,
  ScrollView,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import {
  ACTIVITY_ADD_LABEL_FR,
  ACTIVITY_BOOK_VIATOR_FR,
  ACTIVITY_BOOKED_PROMPT_FR,
  ACTIVITY_BROWSE_CATALOG_FR,
  ACTIVITY_SKIP_LABEL_FR,
  ACTIVITY_VALIDATE_LABEL_FR,
  canonicalViatorProductUrl,
  isTripItemsAuthError,
  pickTripItemOwner,
  reorderKeysMoving,
  tripItemStatusLabelFr,
  tripItemsErrorLabelFr,
} from '@flightwatcher/shared'
import { useAuth } from '../context/AuthContext'
import { auth, getApi } from '../lib/client'
import { openInAppBrowser } from '../lib/openInApp'
import { rememberTrip } from '../lib/tripRecovery'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, spacing } from '../theme'

type ItemRow = {
  id: string
  status?: string
  sort_key?: string
  inherited?: boolean
  meta?: Record<string, unknown>
  places?: { name?: string } | null
}

export function ActivityStepPanel(props: {
  draftToken?: string | null
  plannedTripId?: string | null
  citySlug?: string | null
  enabled?: boolean
  surface?: string
}) {
  const { draftToken, plannedTripId, enabled = true, surface = 'my_trip' } = props
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { signInWithGoogle, user, session, viewUser } = useAuth()
  const owner = useMemo(
    () =>
      pickTripItemOwner({
        draftToken,
        plannedTripId,
      }),
    [draftToken, plannedTripId],
  )
  const [items, setItems] = useState<ItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<Record<string, unknown>[]>([])
  const [pendingBook, setPendingBook] = useState<ItemRow | null>(null)
  const [askBooked, setAskBooked] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [resuming, setResuming] = useState(false)
  const pendingRef = useRef<ItemRow | null>(null)
  const authRetryRef = useRef(false)
  const hasAccount = Boolean(user || session?.user || viewUser)

  const platform = Platform.OS === 'ios' ? 'ios' : 'android'
  const needsAuth = isTripItemsAuthError(error)

  const load = useCallback(async () => {
    if (!owner.draft_token && !owner.planned_trip_id) return
    setLoading(true)
    setError(null)
    try {
      const res = await getApi().listTripItems(owner)
      setItems((res.items || []) as ItemRow[])
      authRetryRef.current = false
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur'
      if (isTripItemsAuthError(msg) && !authRetryRef.current) {
        authRetryRef.current = true
        const token = await auth.refreshAccessToken()
        if (token) {
          try {
            const res = await getApi().listTripItems(owner)
            setItems((res.items || []) as ItemRow[])
            setError(null)
            return
          } catch (e2) {
            setError(e2 instanceof Error ? e2.message : msg)
            setItems([])
            return
          } finally {
            setLoading(false)
          }
        }
      }
      setError(msg)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [owner])

  const onResumeSession = async () => {
    setResuming(true)
    authRetryRef.current = false
    await auth.refreshAccessToken()
    await load()
    setResuming(false)
  }

  const onSignIn = async () => {
    setSigningIn(true)
    const { error: err } = await signInWithGoogle()
    if (err) setError(err.message)
    else {
      setError(null)
      authRetryRef.current = false
      await load()
    }
    setSigningIn(false)
  }

  useEffect(() => {
    if (enabled) void load()
  }, [enabled, load])

  useEffect(() => {
    if (!enabled) return
    if (user || session?.user) {
      authRetryRef.current = false
      void load()
    }
  }, [enabled, user?.id, session?.access_token, load])

  useEffect(() => {
    pendingRef.current = pendingBook
  }, [pendingBook])

  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s === 'active' && pendingRef.current) setAskBooked(true)
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [])

  const track = (event: string, meta?: Record<string, unknown>) => {
    void getApi()
      .trackActivityEvent({
        domain: 'activity',
        event,
        surface,
        platform,
        ...owner,
        meta,
      })
      .catch(() => undefined)
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    await getApi().patchTripItem(id, {
      ...body,
      draft_token: owner.draft_token,
    })
    await load()
  }

  const move = async (from: number, to: number) => {
    const keys = reorderKeysMoving(
      items.map((i) => i.id),
      from,
      to,
    )
    await getApi().reorderTripItems(keys, owner)
    await load()
  }

  const titleOf = (it: ItemRow) => String(it.places?.name || it.meta?.title || 'Activité')

  if (!enabled) {
    return <Text style={styles.muted}>Activités bientôt disponibles.</Text>
  }

  const openCatalog = () => {
    track('browse_catalog')
    const city = props.citySlug || 'paris'
    if (draftToken) {
      void rememberTrip({ draft_token: draftToken, city })
    }
    navigation.navigate('Main', {
      screen: 'Activities',
      params: {
        city,
        draftToken: draftToken || undefined,
        plannedTripId: plannedTripId || undefined,
      },
    })
  }

  if (needsAuth && !loading) {
    return (
      <View style={styles.authCard}>
        <Text style={styles.authKicker}>
          {hasAccount ? 'SESSION' : 'COMPTE REQUIS'}
        </Text>
        <Text style={styles.authTitle}>
          {hasAccount
            ? 'Reprendre ton compte'
            : 'Connecte-toi pour tes activités'}
        </Text>
        <Text style={styles.authBody}>
          {hasAccount
            ? 'Tu es déjà connecté — on recharge tes activités avec ta session.'
            : tripItemsErrorLabelFr(error)}
        </Text>
        {hasAccount ? (
          <Pressable
            style={[styles.cta, resuming && { opacity: 0.6 }]}
            disabled={resuming}
            onPress={() => void onResumeSession()}
          >
            <Text style={styles.ctaText}>
              {resuming ? 'Reprise…' : 'Reprendre ma session'}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.cta, signingIn && { opacity: 0.6 }]}
            disabled={signingIn}
            onPress={() => void onSignIn()}
          >
            <Text style={styles.ctaText}>
              {signingIn ? 'Connexion…' : 'Se connecter avec Google'}
            </Text>
          </Pressable>
        )}
        <Pressable style={styles.secondary} onPress={openCatalog}>
          <Text style={styles.secondaryText}>Voir le catalogue</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable style={styles.cta} onPress={openCatalog}>
          <Text style={styles.ctaText}>{ACTIVITY_BROWSE_CATALOG_FR}</Text>
        </Pressable>
        <Pressable
          style={styles.secondary}
          onPress={async () => {
            setPickerOpen(true)
            try {
              const res = await getApi().listCityActivities(props.citySlug || 'paris', 2)
              setSuggestions(Array.isArray(res.items) ? res.items.slice(0, 12) : [])
            } catch {
              setSuggestions([])
            }
          }}
        >
          <Text style={styles.secondaryText}>{ACTIVITY_ADD_LABEL_FR}</Text>
        </Pressable>
        <Pressable
          style={styles.secondary}
          onPress={async () => {
            track('skip')
            try {
              await getApi().addTripItem({
                product_code: `skip-${Date.now()}`,
                title: ACTIVITY_SKIP_LABEL_FR,
                ...owner,
                platform,
                surface,
              })
              const res = await getApi().listTripItems(owner)
              const last = (res.items || []).slice(-1)[0] as ItemRow | undefined
              if (last?.id) await patch(last.id, { status: 'skipped' })
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Erreur')
            }
          }}
        >
          <Text style={styles.secondaryText}>{ACTIVITY_SKIP_LABEL_FR}</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text style={styles.err}>{tripItemsErrorLabelFr(error)}</Text> : null}

      {items.map((it, idx) => (
        <View key={it.id} style={styles.card}>
          <View style={styles.itemTitleRow}>
            <Text style={[styles.title, { flex: 1 }]}>{titleOf(it)}</Text>
            {it.inherited ? <Text style={styles.groupBadge}>IDÉE DU GROUPE</Text> : null}
          </View>
          <Text style={styles.muted}>{tripItemStatusLabelFr(it.status)}</Text>
          <View style={styles.row}>
            {!it.inherited && idx > 0 ? (
              <Pressable onPress={() => void move(idx, idx - 1)}>
                <Text style={styles.link}>Monter</Text>
              </Pressable>
            ) : null}
            {!it.inherited && idx < items.length - 1 ? (
              <Pressable onPress={() => void move(idx, idx + 1)}>
                <Text style={styles.link}>Descendre</Text>
              </Pressable>
            ) : null}
            {!it.inherited && it.status !== 'validated' && it.status !== 'booked' && it.status !== 'skipped' ? (
              <Pressable onPress={() => void patch(it.id, { status: 'validated' })}>
                <Text style={styles.link}>{ACTIVITY_VALIDATE_LABEL_FR}</Text>
              </Pressable>
            ) : null}
            {it.meta?.product_url || it.meta?.product_code ? (
              <Pressable
                onPress={() => {
                  const url = canonicalViatorProductUrl(
                    it.meta?.product_url != null
                      ? String(it.meta.product_url)
                      : null,
                    {
                      productCode:
                        it.meta?.product_code != null
                          ? String(it.meta.product_code)
                          : null,
                    },
                  )
                  if (!url) return
                  if (!it.inherited) setPendingBook(it)
                  track('book_click', { trip_item_id: it.id })
                  openInAppBrowser(navigation, url, titleOf(it))
                }}
              >
                <Text style={styles.linkPrimary}>{ACTIVITY_BOOK_VIATOR_FR}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}

      <Modal visible={pickerOpen} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.title}>Suggestions</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {suggestions.map((s) => (
                <Pressable
                  key={String(s.product_code)}
                  style={styles.suggest}
                  onPress={async () => {
                    await getApi().addTripItem({
                      product_code: s.product_code,
                      title: s.title,
                      product_url: s.product_url,
                      ...owner,
                      platform,
                      surface,
                    })
                    setPickerOpen(false)
                    await load()
                  }}
                >
                  <Text style={styles.title}>{String(s.title || '')}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.secondary} onPress={() => setPickerOpen(false)}>
              <Text style={styles.secondaryText}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={askBooked && !!pendingBook} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.title}>
              {ACTIVITY_BOOKED_PROMPT_FR(pendingBook ? titleOf(pendingBook) : 'cette activité')}
            </Text>
            <View style={styles.row}>
              <Pressable
                style={[styles.cta, { flex: 1 }]}
                onPress={() => {
                  if (pendingBook) void patch(pendingBook.id, { status: 'booked' })
                  track('booked_yes')
                  setPendingBook(null)
                  setAskBooked(false)
                }}
              >
                <Text style={styles.ctaText}>Oui</Text>
              </Pressable>
              <Pressable
                style={[styles.secondary, { flex: 1 }]}
                onPress={() => {
                  if (pendingBook) void patch(pendingBook.id, { status: 'validated' })
                  track('booked_no')
                  setPendingBook(null)
                  setAskBooked(false)
                }}
              >
                <Text style={styles.secondaryText}>Pas encore</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ctaText: { color: '#fff', fontFamily: fonts.bold, fontSize: 13 },
  secondary: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryText: { fontFamily: fonts.semibold, color: colors.ink, fontSize: 13 },
  authCard: {
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FED7AA',
    backgroundColor: '#FFF8F3',
    padding: 14,
  },
  authKicker: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.primary,
  },
  authTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  authBody: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 12,
    gap: 4,
  },
  title: { fontFamily: fonts.bold, color: colors.ink, fontSize: 14 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupBadge: {
    fontFamily: fonts.bold,
    fontSize: 8,
    color: colors.primaryInk,
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  muted: { fontFamily: fonts.regular, color: colors.muted, fontSize: 12 },
  err: { color: colors.danger, fontFamily: fonts.medium, fontSize: 12 },
  link: { fontFamily: fonts.semibold, color: colors.inkSoft, fontSize: 12 },
  linkPrimary: { fontFamily: fonts.bold, color: colors.primary, fontSize: 12 },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  suggest: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
})
