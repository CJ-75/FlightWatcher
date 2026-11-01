import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
  Modal,
  AppState,
  type AppStateStatus,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import * as Location from 'expo-location'
import {
  ACTIVITY_BOOKED_PROMPT_FR,
  ACTIVITY_CATEGORY_TAGS_FR,
  ACTIVITY_NEARBY_LABEL_FR,
  ACTIVITY_SORT_LABEL_FR,
  ACTIVITY_TRANSPARENCY_FR,
  toActivityCardModel,
  type ActivityCardModel,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { openInAppBrowser } from '../lib/openInApp'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, spacing } from '../theme'

const BIG_CITIES = [
  { slug: 'paris', label: 'Paris' },
  { slug: 'rome', label: 'Rome' },
  { slug: 'barcelone', label: 'Barcelone' },
  { slug: 'lisbonne', label: 'Lisbonne' },
  { slug: 'milan', label: 'Milan' },
  { slug: 'amsterdam', label: 'Amsterdam' },
]

function eventPlatform(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android'
}

export function ActivitiesScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [citySlug, setCitySlug] = useState('paris')
  const [adults] = useState(2)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [header, setHeader] = useState<string | null>(null)
  const [fallbackHint, setFallbackHint] = useState<string | null>(null)
  const [sort, setSort] = useState<'recommended' | 'price' | 'rating'>('recommended')
  const [geoBusy, setGeoBusy] = useState(false)
  const [detail, setDetail] = useState<ActivityCardModel | null>(null)
  const [pendingBook, setPendingBook] = useState<ActivityCardModel | null>(null)
  const [askBooked, setAskBooked] = useState(false)
  const pendingRef = useRef<ActivityCardModel | null>(null)

  const cards = useMemo(() => {
    let list = items.map((r) => toActivityCardModel(r, adults))
    if (sort === 'price') {
      list = [...list].sort((a, b) => {
        const pa = a.priceLabel ? parseInt(a.priceLabel.replace(/\D/g, ''), 10) : 9999
        const pb = b.priceLabel ? parseInt(b.priceLabel.replace(/\D/g, ''), 10) : 9999
        return pa - pb
      })
    } else if (sort === 'rating') {
      list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0))
    }
    return list
  }, [items, adults, sort])

  const loadCity = useCallback(
    async (slug: string) => {
      if (!slug) return
      setLoading(true)
      setError(null)
      setHeader(null)
      setFallbackHint(null)
      try {
        const res = await getApi().listCityActivities(slug, adults)
        if (!res.ok) throw new Error(res.error || 'Chargement impossible')
        setItems(Array.isArray(res.items) ? res.items : [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur')
        setItems([])
      } finally {
        setLoading(false)
      }
    },
    [adults],
  )

  useEffect(() => {
    void loadCity(citySlug)
  }, [citySlug, loadCity])

  useEffect(() => {
    pendingRef.current = pendingBook
  }, [pendingBook])

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active' && pendingRef.current) setAskBooked(true)
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [])

  const track = (event: string, card?: ActivityCardModel | null) => {
    void getApi()
      .trackActivityEvent({
        domain: 'activity',
        event,
        surface: 'tab',
        platform: eventPlatform(),
        meta: card ? { product_code: card.productCode } : undefined,
      })
      .catch(() => undefined)
  }

  const onNearby = async () => {
    setGeoBusy(true)
    setError(null)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setError('Localisation refusée')
        return
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      // Never store precise coords — round before send
      const lat = Math.round(pos.coords.latitude * 100) / 100
      const lng = Math.round(pos.coords.longitude * 100) / 100
      const res = await getApi().nearbyActivities({ lat, lng, adults })
      if (!res.ok) throw new Error(res.error || 'Aucune activité')
      setItems(Array.isArray(res.items) ? res.items : [])
      setHeader(res.header || null)
      setFallbackHint(res.fallback_hint || null)
      setCitySlug('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setGeoBusy(false)
    }
  }

  const onBook = (card: ActivityCardModel) => {
    if (!card.productUrl) return
    setPendingBook(card)
    track('book_click', card)
    openInAppBrowser(navigation, card.productUrl, card.title)
  }

  return (
    <ScreenBackground>
      <FlatList
        data={cards}
        keyExtractor={(c) => c.productCode || c.title}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.md,
          paddingBottom: 120,
          gap: spacing.md,
        }}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Text style={styles.kicker}>Activités</Text>
            <Text style={styles.title}>Que faire sur place</Text>
            <Text style={styles.sub}>
              Sélection FlightWatcher · réservation sur Viator · commission transparente
            </Text>
            <View style={styles.rowWrap}>
              <Pressable
                onPress={() => void onNearby()}
                disabled={geoBusy}
                style={[styles.pillDark, geoBusy && { opacity: 0.6 }]}
              >
                <Text style={styles.pillDarkText}>
                  {geoBusy ? 'Localisation…' : ACTIVITY_NEARBY_LABEL_FR}
                </Text>
              </Pressable>
              {BIG_CITIES.map((c) => (
                <Pressable
                  key={c.slug}
                  onPress={() => setCitySlug(c.slug)}
                  style={[styles.pill, citySlug === c.slug && styles.pillActive]}
                >
                  <Text style={[styles.pillText, citySlug === c.slug && styles.pillTextActive]}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.rowWrap}>
              {ACTIVITY_CATEGORY_TAGS_FR.map((t) => (
                <View key={t.id} style={styles.tag}>
                  <Text style={styles.tagText}>{t.label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.rowWrap}>
              {(Object.keys(ACTIVITY_SORT_LABEL_FR) as Array<keyof typeof ACTIVITY_SORT_LABEL_FR>).map(
                (k) => (
                  <Pressable key={k} onPress={() => setSort(k)}>
                    <Text style={[styles.sort, sort === k && styles.sortActive]}>
                      {ACTIVITY_SORT_LABEL_FR[k]}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
            {header ? <Text style={styles.headerLine}>{header}</Text> : null}
            {fallbackHint ? <Text style={styles.hint}>{fallbackHint}</Text> : null}
            {error ? <Text style={styles.err}>{error}</Text> : null}
            {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} /> : null}
          </View>
        }
        renderItem={({ item: c }) => (
          <Pressable style={styles.card} onPress={() => setDetail(c)}>
            {c.photoUrl ? (
              <Image source={{ uri: c.photoUrl }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder]} />
            )}
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {c.title}
              </Text>
              <Text style={styles.meta}>
                {c.rating != null ? `${c.rating.toFixed(1)} · ${c.reviewCount || 0} avis` : '—'}
                {c.durationLabel ? ` · ${c.durationLabel}` : ''}
              </Text>
              {c.distanceLabel ? <Text style={styles.meta}>{c.distanceLabel}</Text> : null}
              <Text style={styles.price}>{c.priceLabel || 'Voir le tarif'}</Text>
              <Pressable style={styles.cta} onPress={() => onBook(c)}>
                <Text style={styles.ctaText}>Réserver sur Viator</Text>
              </Pressable>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.meta}>Choisis une ville ou Autour de moi.</Text>
          ) : null
        }
        ListFooterComponent={
          <Text style={[styles.meta, { marginTop: 8, lineHeight: 18 }]}>
            {ACTIVITY_TRANSPARENCY_FR}
          </Text>
        }
      />

      <Modal visible={!!detail} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>{detail?.title}</Text>
            <Text style={styles.meta}>
              {detail?.priceLabel} · {detail?.durationLabel || 'Durée variable'}
            </Text>
            <Pressable
              style={styles.cta}
              onPress={() => detail && onBook(detail)}
            >
              <Text style={styles.ctaText}>Réserver sur Viator</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => setDetail(null)}>
              <Text style={styles.secondaryText}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={askBooked && !!pendingBook} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>
              {ACTIVITY_BOOKED_PROMPT_FR(pendingBook?.title || 'cette activité')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                style={[styles.cta, { flex: 1, backgroundColor: '#059669' }]}
                onPress={() => {
                  track('booked_yes', pendingBook)
                  setPendingBook(null)
                  setAskBooked(false)
                }}
              >
                <Text style={styles.ctaText}>Oui</Text>
              </Pressable>
              <Pressable
                style={[styles.secondary, { flex: 1 }]}
                onPress={() => {
                  track('booked_no', pendingBook)
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
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  headerBlock: { gap: 10, marginBottom: 8 },
  kicker: { fontFamily: fonts.semibold, color: colors.primary, fontSize: 13 },
  title: { fontFamily: fonts.bold, color: colors.ink, fontSize: 26 },
  sub: { fontFamily: fonts.regular, color: colors.muted, fontSize: 14, lineHeight: 20 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillDark: {
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillDarkText: { color: '#fff', fontFamily: fonts.bold, fontSize: 13 },
  pill: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pillText: { fontFamily: fonts.semibold, color: colors.ink, fontSize: 13 },
  pillTextActive: { color: colors.primary },
  tag: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { fontSize: 11, color: colors.muted, fontFamily: fonts.medium },
  sort: { fontFamily: fonts.semibold, color: colors.muted, paddingVertical: 6, paddingHorizontal: 8 },
  sortActive: { color: colors.primary, backgroundColor: colors.primarySoft, borderRadius: 8 },
  headerLine: { fontFamily: fonts.semibold, color: colors.ink, fontSize: 14 },
  hint: {
    backgroundColor: '#fffbeb',
    color: '#92400e',
    padding: 10,
    borderRadius: 12,
    overflow: 'hidden',
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  err: { color: '#dc2626', fontFamily: fonts.medium, fontSize: 13 },
  card: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  photo: { width: '100%', height: 160 },
  photoPlaceholder: { backgroundColor: '#e2e8f0' },
  cardBody: { padding: 12, gap: 4 },
  cardTitle: { fontFamily: fonts.bold, color: colors.ink, fontSize: 15 },
  meta: { fontFamily: fonts.regular, color: colors.muted, fontSize: 12 },
  price: { fontFamily: fonts.bold, color: colors.ink, fontSize: 16, marginTop: 4 },
  cta: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
  secondary: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryText: { fontFamily: fonts.semibold, color: colors.ink },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
})
