import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Share,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type {
  HotelGuestReview,
  MyTripDraft,
  TravelDeal,
  TravelDealHotel,
} from '@flightwatcher/shared'
import {
  boardLabelFr,
  dealAdults,
  directFlightLabel,
  formatFlightDuration,
  hotelStarsLabel,
  isFetchableHotelId,
  preferFrenchReviews,
  pricePpWithHotel,
  resolveFlightDurationMinutes,
  reviewExcerpt,
  reviewMetaLine,
} from '@flightwatcher/shared'
import { getApi, getWebOrigin } from '../lib/client'
import { openInAppBrowser } from '../lib/openInApp'
import { rememberTrip } from '../lib/tripRecovery'
import { warmHotelUpsell } from '../lib/partnerBook'
import { HeartIcon } from '../components/HeartIcon'
import { HotelPhotoGallery } from '../components/HotelPhotoGallery'
import { HotelComposeDetailSheet } from '../components/HotelComposeDetailSheet'
import { ReviewStars } from '../components/ReviewStars'
import { toUpsellHotel } from '../lib/hotelUpsell'
import { useLikedDeals } from '../hooks/useLikedDeals'
import { ScreenBackground } from '../components/ScreenBackground'
import {
  BedIcon,
  IconLabel,
  PlaneIcon,
  TipIcon,
} from '../components/UiIcons'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing, type } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'DealDetail'>

/** Room below hero for price + vol + 1er hôtel (then scroll). */
const ABOVE_FOLD_BELOW_HERO = 360

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatClock(iso?: string | null) {
  if (!iso) return null
  const m = String(iso).match(/T(\d{2}):(\d{2})/)
  if (m) return `${m[1]}:${m[2]}`
  return null
}

export function DealDetailScreen({ route, navigation }: Props) {
  const { dealId } = route.params
  const insets = useSafeAreaInsets()
  const { width: winW, height: winH } = useWindowDimensions()
  const { isLiked, toggleLike, refresh: refreshLikes } = useLikedDeals()

  // Large gallery (as before); shrink only on very short phones so 1er hôtel can peek.
  const ctaH = 64 + Math.max(insets.bottom, 12)
  const headerH = 52 + insets.top
  const foldBudget = Math.max(420, winH - ctaH - headerH)
  const preferredHero = Math.min(240, Math.round(winW * 0.52))
  const heroH = Math.round(
    Math.max(168, Math.min(preferredHero, foldBudget - ABOVE_FOLD_BELOW_HERO)),
  )
  const [deal, setDeal] = useState<TravelDeal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [startingTrip, setStartingTrip] = useState(false)
  const [composingHotel, setComposingHotel] = useState(false)
  const [hotelSheetOpen, setHotelSheetOpen] = useState(false)
  const [sheetHotelId, setSheetHotelId] = useState<string | null>(null)
  const [guestReviews, setGuestReviews] = useState<HotelGuestReview[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [reviewsExpanded, setReviewsExpanded] = useState(false)
  const [gallerySwipeActive, setGallerySwipeActive] = useState(false)
  /** Prefetched my-trip draft so « Organiser mon séjour » navigates instantly. */
  const draftPrefetchRef = useRef<{
    key: string
    promise: Promise<MyTripDraft>
    draft?: MyTripDraft
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const d = await getApi().getDeal(dealId)
        if (!cancelled) {
          setDeal(d)
          setHotelId(d.hotel?.id || null)
        }
        await refreshLikes()
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Deal introuvable')
          setDeal(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dealId, refreshLikes])

  const dealLiked = deal ? isLiked(deal.id) : false
  useEffect(() => {
    if (!deal) {
      navigation.setOptions({ headerRight: undefined })
      return
    }
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => void toggleLike(deal)}
          hitSlop={10}
          style={styles.headerLike}
          accessibilityRole="button"
          accessibilityLabel={dealLiked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          <HeartIcon
            size={22}
            filled={dealLiked}
            color={dealLiked ? colors.primary : colors.ink}
          />
        </Pressable>
      ),
    })
  }, [deal, dealLiked, navigation, toggleLike])

  const hotelOptions = useMemo(() => {
    if (!deal) return [] as TravelDealHotel[]
    const primary = deal.hotel
      ? [deal.hotel]
      : deal.hotel_name
        ? [
            {
              id: 'primary',
              name: deal.hotel_name,
              stars: deal.hotel_stars,
              board: deal.board,
              public_hotel_price: deal.price_breakdown?.hotel_public_total,
              excluded_fees: deal.price_breakdown?.excluded_fees,
              photo: deal.image_url,
            } as TravelDealHotel,
          ]
        : []
    const seen = new Set<string>()
    const out: TravelDealHotel[] = []
    for (const h of [...primary, ...(deal.alt_hotels || [])]) {
      if (!h?.id || seen.has(h.id)) continue
      seen.add(h.id)
      out.push(h)
    }
    return out
  }, [deal])

  const selected =
    hotelOptions.find((h) => h.id === (hotelId || hotelOptions[0]?.id)) || hotelOptions[0]

  const hotelPhoto = (
    selected?.photo ||
    deal?.hotel?.photo ||
    deal?.image_url ||
    ''
  ).trim()

  // Must run before any early return — otherwise hooks count changes after load.
  const seedPhotos = useMemo(
    () =>
      [
        ...(selected?.photos || deal?.hotel?.photos || []),
        hotelPhoto,
      ].filter((u, i, arr) => Boolean(u) && arr.indexOf(u) === i) as string[],
    [selected?.photos, deal?.hotel?.photos, hotelPhoto],
  )

  const reviewsHotelId = isFetchableHotelId(selected?.id)
    ? String(selected!.id)
    : isFetchableHotelId(deal?.hotel?.id)
      ? String(deal!.hotel!.id)
      : ''

  useEffect(() => {
    if (!reviewsHotelId) {
      setGuestReviews([])
      setReviewsLoading(false)
      setReviewsExpanded(false)
      return
    }
    let cancelled = false
    setGuestReviews([])
    setReviewsLoading(true)
    setReviewsExpanded(false)
    void getApi()
      .getHotelReviews(reviewsHotelId, { language: 'fr', limit: 10 })
      .then((r) => {
        if (cancelled) return
        const rows = Array.isArray(r.reviews) ? r.reviews.slice(0, 10) : []
        setGuestReviews(preferFrenchReviews(rows))
      })
      .catch(() => {
        if (!cancelled) setGuestReviews([])
      })
      .finally(() => {
        if (!cancelled) setReviewsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reviewsHotelId])

  const adults = deal ? dealAdults(deal) : 2
  const hotelTotal = deal
    ? selected?.public_hotel_price ?? deal.price_breakdown?.hotel_public_total ?? 0
    : 0
  const pricePp = deal
    ? selected
      ? pricePpWithHotel(deal, hotelTotal)
      : deal.price_per_person
    : 0
  const flightUrl = deal?.flight?.booking_url || ''

  const prefetchKey = useMemo(() => {
    if (!deal) return ''
    const hid = hotelId || deal.hotel?.id || ''
    return `${deal.deal_key || deal.id}|${hid}|${adults}`
  }, [deal, hotelId, adults])

  // Warm createMyTrip while the user reads the fiche (before early returns — hooks).
  useEffect(() => {
    if (!deal || !prefetchKey) return
    if (draftPrefetchRef.current?.key === prefetchKey) return
    const hotel = selected || deal.hotel
    const booking = flightUrl || deal.booking_url
    const body = {
      deal_key: deal.deal_key || deal.id,
      origin_iata: deal.origin_iata || deal.departure_airport,
      departure_airport: deal.origin_airport_label || deal.departure_airport,
      destination: deal.destination || deal.flight?.destination_iata || undefined,
      city: deal.city,
      dates: deal.dates,
      adults,
      flight: {
        ...deal.flight,
        price_pp: deal.flight?.price_pp,
        booking_url: booking,
        destination_iata:
          deal.flight?.destination_iata || deal.destination || undefined,
      },
      hotel,
      price_per_person: pricePp,
      booking_url: booking,
      baggage_line: deal.baggage_line,
      route_hint: deal.route_hint,
      price_pax_note: deal.price_pax_note || null,
      compose_hotel: !hotel?.id,
    }
    const key = prefetchKey
    const promise = getApi()
      .createMyTrip(body)
      .then((d) => {
        if (draftPrefetchRef.current?.key === key) {
          draftPrefetchRef.current.draft = d
        }
        return d
      })
      .catch((e) => {
        if (draftPrefetchRef.current?.key === key) {
          draftPrefetchRef.current = null
        }
        throw e
      })
    draftPrefetchRef.current = { key, promise }
  }, [deal, prefetchKey, adults, selected, pricePp, flightUrl])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ScreenBackground />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!deal || error) {
    return (
      <View style={styles.centered}>
        <ScreenBackground />
        <Text style={styles.errorText}>{error || 'Deal introuvable'}</Text>
      </View>
    )
  }

  const fees = selected?.excluded_fees ?? deal.price_breakdown?.excluded_fees ?? 0
  const hasPartnerUrl = Boolean(deal.booking_url)
  const selectedStars = hotelStarsLabel(selected?.stars || deal.hotel_stars)
  const flightDurationMin = resolveFlightDurationMinutes(deal)
  const flightDurationLabel = formatFlightDuration(flightDurationMin)
  const directLabel = directFlightLabel(deal.flight, {
    originIata: deal.flight?.origin_iata || deal.departure_airport,
    destIata: deal.flight?.destination_iata,
    withDuration: true,
  })

  const openFlight = async () => {
    let url = flightUrl
    const key = deal.deal_key || deal.id
    if (adults > 2 && key) {
      try {
        const rv = await getApi().revalidateDealFlight(key, adults)
        if (rv.booking_url) url = rv.booking_url
      } catch {
        /* keep */
      }
    }
    if (url) openInAppBrowser(navigation, url, 'Réserver le vol')
  }

  /** Sync payload — no blocking flight revalidate (keeps CTA snappy). */
  const buildDraftPayload = (opts?: { composeHotel?: boolean }) => {
    const booking = flightUrl || deal.booking_url
    const key = deal.deal_key || deal.id
    const dest =
      deal.destination || deal.flight?.destination_iata || undefined
    const hotel = selected || deal.hotel
    return {
      deal_key: key,
      origin_iata: deal.origin_iata || deal.departure_airport,
      departure_airport: deal.origin_airport_label || deal.departure_airport,
      destination: dest,
      city: deal.city,
      dates: deal.dates,
      adults,
      flight: {
        ...deal.flight,
        price_pp: deal.flight?.price_pp,
        booking_url: booking,
        destination_iata:
          deal.flight?.destination_iata || deal.destination || undefined,
      },
      hotel,
      price_per_person: pricePp,
      booking_url: booking,
      baggage_line: deal.baggage_line,
      route_hint: deal.route_hint,
      price_pax_note: deal.price_pax_note || null,
      compose_hotel: Boolean(opts?.composeHotel),
    }
  }

  const resolveDraft = async (opts?: { composeHotel?: boolean }) => {
    const hotel = selected || deal.hotel
    const compose = Boolean(opts?.composeHotel ?? !hotel?.id)
    if (!compose && draftPrefetchRef.current?.key === prefetchKey) {
      try {
        const d =
          draftPrefetchRef.current.draft ||
          (await draftPrefetchRef.current.promise)
        draftPrefetchRef.current = null
        return d
      } catch {
        /* fall through */
      }
    }
    return getApi().createMyTrip(buildDraftPayload({ composeHotel: compose }))
  }

  const startMyTrip = async () => {
    setStartingTrip(true)
    try {
      const draft = await resolveDraft()
      void rememberTrip({
        draft_token: draft.draft_token,
        city: draft.city_name || deal.city,
      })
      warmHotelUpsell({
        iata: draft.dest_iata || deal.destination,
        checkin: draft.out_date || deal.dates?.outbound,
        checkout: draft.ret_date || deal.dates?.inbound,
        participants: adults,
        flight_pp: deal.flight?.price_pp,
      })
      navigation.navigate('TripSummary', {
        draftToken: draft.draft_token,
        seed: draft,
      })
    } catch {
      if (flightUrl) openInAppBrowser(navigation, flightUrl, 'Réserver le vol')
    } finally {
      setStartingTrip(false)
    }
  }

  const startComposeHotel = async () => {
    setComposingHotel(true)
    try {
      const draft = await resolveDraft({ composeHotel: true })
      void rememberTrip({
        draft_token: draft.draft_token,
        city: draft.city_name || deal.city,
      })
      warmHotelUpsell({
        iata: draft.dest_iata || deal.destination,
        checkin: draft.out_date || deal.dates?.outbound,
        checkout: draft.ret_date || deal.dates?.inbound,
        participants: adults,
        flight_pp: deal.flight?.price_pp,
      })
      navigation.navigate('HotelCompose', {
        draftToken: draft.draft_token,
        seed: draft,
      })
    } catch {
      Alert.alert('Erreur', 'Impossible d’ouvrir la composition hôtel — réessaie')
    } finally {
      setComposingHotel(false)
    }
  }

  const outTime = formatClock(deal.flight?.outbound_local || deal.flight?.out_dep_local)
  const inTime = formatClock(deal.flight?.inbound_local || deal.flight?.ret_dep_local)
  const flightPp = Math.round(deal.flight?.price_pp ?? deal.price_breakdown?.flight_pp ?? 0)
  const hotelPp = Math.max(0, Math.round(pricePp - flightPp))

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <ScrollView
        scrollEnabled={!gallerySwipeActive}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 168 }}
      >
        <HotelPhotoGallery
          hotelId={selected?.id || deal.hotel?.id}
          seedPhoto={hotelPhoto}
          seedPhotos={seedPhotos}
          alt={selected?.name || deal.hotel_name || deal.city}
          hotelName={selected?.name || deal.hotel_name}
          cityLabel={[deal.city, deal.country].filter(Boolean).join(' · ')}
          height={heroH}
          onHorizontalGesture={setGallerySwipeActive}
          bottomLeft={
            <View>
              {deal.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{deal.badge}</Text>
                </View>
              ) : null}
              <Text style={styles.city}>{deal.city}</Text>
              <Text style={styles.country}>{deal.country}</Text>
            </View>
          }
        />

        <View style={styles.content}>
          {/* Above the fold: prix + vol + 1er hôtel — puis scroll */}
          <View style={styles.aboveFold}>
            <View style={styles.priceBlock}>
              <Text style={styles.price}>{Math.round(pricePp)} €</Text>
              <Text style={styles.priceHint} numberOfLines={2}>
                {deal.price_pax_note
                  ? deal.price_pax_note
                  : `par personne · ${deal.nights} nuit${deal.nights > 1 ? 's' : ''} · ${adults} voyageur${adults > 1 ? 's' : ''}`}
                {flightPp > 0 || hotelPp > 0
                  ? ` · vol ${flightPp || '—'} € + hôtel ${hotelPp || '—'} €`
                  : ''}
              </Text>
              {fees > 0 ? (
                <Text style={styles.tax}>
                  + {Math.round(fees)} € de taxes à régler à l’hôtel
                </Text>
              ) : null}
            </View>

            <View style={[styles.infoCard, styles.flightCard, shadow.soft]}>
              <IconLabel
                section
                label="Vol"
                icon={<PlaneIcon size={14} />}
                style={{ marginBottom: 6 }}
              />
              <Text style={styles.airportLine} numberOfLines={2}>
                {deal.origin_airport_label || deal.departure_airport || '—'}
                <Text style={styles.airportArrowInline}> → </Text>
                {deal.arrival_airport_label || deal.city}
              </Text>
              <View style={styles.legRow}>
                <Text style={styles.legLabel}>Aller</Text>
                <Text style={styles.legValue}>
                  {formatDate(deal.dates.outbound)}
                  {outTime ? ` · ${outTime}` : ''}
                </Text>
              </View>
              <View style={styles.legRow}>
                <Text style={styles.legLabel}>Retour</Text>
                <Text style={styles.legValue}>
                  {formatDate(deal.dates.inbound)}
                  {inTime ? ` · ${inTime}` : ''}
                </Text>
              </View>
              {flightDurationLabel ? (
                <View style={styles.legRow}>
                  <Text style={styles.legLabel}>Durée</Text>
                  <Text style={[styles.legValue, styles.durationValue]}>
                    {deal.flight?.direct
                      ? `Vol direct · ${flightDurationLabel}`
                      : flightDurationLabel}
                  </Text>
                </View>
              ) : directLabel ? (
                <Text style={styles.directHint}>{directLabel}</Text>
              ) : null}
              {deal.baggage_line ? (
                <Text style={styles.baggage} numberOfLines={2}>
                  {deal.baggage_line}
                </Text>
              ) : null}
              {flightPp > 0 ? (
                <Text style={styles.flightPriceLine}>{flightPp} € / pers. vol A/R</Text>
              ) : null}
            </View>

            <View style={[styles.infoCard, styles.hotelCard, shadow.soft]}>
              <IconLabel
                section
                label="Hôtel"
                icon={<BedIcon size={14} />}
                style={{ marginBottom: 6 }}
              />
              <Pressable
                onPress={() => {
                  setSheetHotelId(selected?.id || deal.hotel?.id || null)
                  setHotelSheetOpen(true)
                }}
              >
                {selectedStars ? (
                  <Text style={styles.hotelStars}>{selectedStars}</Text>
                ) : null}
                <Text style={styles.hotelTitle} numberOfLines={2}>
                  {selected?.name || deal.hotel_name || '—'}
                </Text>
                {boardLabelFr(selected?.board || deal.board) ? (
                  <Text style={styles.hotelMeta}>
                    {boardLabelFr(selected?.board || deal.board)}
                  </Text>
                ) : null}
                {selected?.rating != null ? (
                  <Text style={styles.hotelMeta}>
                    {Number(selected.rating).toFixed(1)}/10
                    {selected.review_count != null
                      ? ` · ${selected.review_count} avis`
                      : ''}
                  </Text>
                ) : null}
                <Text style={styles.ficheLink}>Voir photos et détails →</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.stack}>
          <View style={styles.notice}>
            <TipIcon size={16} />
            <Text style={styles.noticeText}>
              Tu réserves le vol et l’hôtel en deux étapes simples — chacun de son côté.
            </Text>
          </View>

          {hotelOptions.length > 1 ? (
            <View style={styles.switchBlock}>
              <Text style={styles.sectionLabel}>
                {deal.city ? `Hôtels à ${deal.city}` : 'Changer d’hôtel'}
              </Text>
              {hotelOptions.map((h) => {
                const active = h.id === selected?.id
                const hPp = pricePpWithHotel(deal, h.public_hotel_price ?? hotelTotal)
                const stars = hotelStarsLabel(h.stars)
                return (
                  <Pressable
                    key={h.id}
                    onPress={() => setHotelId(h.id)}
                    onLongPress={() => {
                      setSheetHotelId(h.id)
                      setHotelSheetOpen(true)
                    }}
                    style={[styles.hotelOption, active && styles.hotelOptionActive]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.hotelOptionName} numberOfLines={1}>
                        {stars ? `${stars}  ${h.name}` : h.name}
                      </Text>
                      <Text style={styles.hotelOptionMeta} numberOfLines={1}>
                        {[
                          boardLabelFr(h.board),
                          h.refundable ? 'Annulation flexible' : null,
                          h.rating != null ? `${h.rating}/10` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                      <Pressable
                        onPress={() => {
                          setHotelId(h.id)
                          setSheetHotelId(h.id)
                          setHotelSheetOpen(true)
                        }}
                        hitSlop={6}
                      >
                        <Text style={styles.optionFiche}>Voir le détail</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.hotelOptionPrice}>{Math.round(hPp)} €</Text>
                  </Pressable>
                )
              })}
            </View>
          ) : null}

          <Pressable
            onPress={() => void startComposeHotel()}
            disabled={composingHotel || startingTrip}
            style={({ pressed }) => [
              styles.composeBtn,
              styles.composeBtnStandalone,
              pressed && { opacity: 0.9 },
              (composingHotel || startingTrip) && { opacity: 0.55 },
            ]}
          >
            <BedIcon size={15} />
            <Text style={styles.composeBtnText}>
              {composingHotel ? '…' : 'Changer d’hôtel'}
            </Text>
          </Pressable>

          {reviewsLoading || guestReviews.length > 0 ? (
            <View style={styles.reviewsBlock}>
              <View style={styles.reviewsHead}>
                <Text style={styles.sectionLabel}>Avis</Text>
                <Text style={styles.reviewCountHint}>
                  {[
                    selected?.review_count != null && selected.review_count > 0
                      ? `${Number(selected.review_count).toLocaleString('fr-FR')} avis`
                      : null,
                    'en français',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {reviewsLoading && guestReviews.length === 0 ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  {(reviewsExpanded ? guestReviews : guestReviews.slice(0, 3)).map(
                    (r, i) => {
                      const meta = reviewMetaLine(r)
                      const excerpt = reviewExcerpt(r)
                      return (
                        <View
                          key={`${r.name || 'avis'}-${r.date || i}`}
                          style={styles.reviewCard}
                        >
                          <View style={styles.reviewTop}>
                            <ReviewStars score={r.score} />
                            {meta ? (
                              <Text style={styles.reviewMeta} numberOfLines={1}>
                                {meta}
                              </Text>
                            ) : null}
                          </View>
                          {excerpt ? (
                            <Text
                              style={styles.reviewText}
                              numberOfLines={reviewsExpanded ? undefined : 3}
                            >
                              {excerpt}
                            </Text>
                          ) : null}
                        </View>
                      )
                    },
                  )}
                  {guestReviews.length > 3 ? (
                    <Pressable
                      style={styles.moreReviews}
                      onPress={() => setReviewsExpanded((v) => !v)}
                    >
                      <Text style={styles.moreReviewsText}>
                        {reviewsExpanded
                          ? 'Réduire'
                          : `Voir tout · ${guestReviews.length} avis`}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          {(deal.why_good?.length || deal.hook) ? (
            <View style={[styles.whyGoodCard, shadow.soft]}>
              <Text style={styles.whyGoodTitle}>Pourquoi c’est un bon plan</Text>
              {(deal.why_good?.length ? deal.why_good : deal.hook ? [deal.hook] : []).map(
                (b, i, arr) => (
                  <View
                    key={b}
                    style={[
                      styles.whyGoodRow,
                      i < arr.length - 1 && styles.whyGoodRowSpaced,
                    ]}
                  >
                    <Text style={styles.whyGoodCheck}>✓</Text>
                    <Text style={styles.whyGoodText}>{b}</Text>
                  </View>
                ),
              )}
            </View>
          ) : null}

          {deal.highlights?.length ? (
            <View style={styles.highlights}>
              <Text style={styles.sectionLabel}>Inclus</Text>
              {deal.highlights.slice(0, 4).map((h) => (
                <View key={h} style={styles.highlightRow}>
                  <Text style={styles.bullet}>·</Text>
                  <Text style={styles.highlightText}>{h}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {(deal.related_deals?.length ?? 0) > 0 ? (
            <View style={styles.switchBlock}>
              <Text style={styles.sectionLabel}>Autres dates</Text>
              {deal.related_deals!.slice(0, 5).map((r) => (
                <Pressable
                  key={r.deal_key || r.id}
                  onPress={() => {
                    if (r.deal_key || r.id) {
                      navigation.push('DealDetail', {
                        dealId: String(r.deal_key || r.id),
                      })
                    }
                  }}
                  style={styles.hotelOption}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.hotelOptionName} numberOfLines={1}>
                      {r.dates?.outbound
                        ? `${formatDate(r.dates.outbound)}${
                            r.dates?.inbound ? ` → ${formatDate(r.dates.inbound)}` : ''
                          }`
                        : r.nights != null
                          ? `${r.nights} nuits`
                          : 'Autre date'}
                    </Text>
                    <Text style={styles.hotelOptionMeta} numberOfLines={1}>
                      {[
                        `depuis ${
                          r.origin_airport_label ||
                          r.departure_airport ||
                          r.origin_iata ||
                          '—'
                        }`,
                        r.nights != null ? `${r.nights}n` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.hotelOptionPrice}>
                    {Math.round(r.price_per_person || 0)} €
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          </View>

          <View style={styles.secondaryLinks}>
            <Pressable
              onPress={() => {
                const price = Math.round(deal.price_per_person)
                const origin =
                  deal.origin_airport_label ||
                  deal.departure_airport ||
                  deal.origin_iata ||
                  ''
                const link = `${getWebOrigin()}?deal=${encodeURIComponent(deal.deal_key || deal.id)}`
                const text = [
                  `Bon plan ${deal.city} : ${price} € / pers.`,
                  origin ? `depuis ${origin}` : null,
                  deal.hook || null,
                  link,
                ]
                  .filter(Boolean)
                  .join(' — ')
                void Share.share({ message: text })
              }}
              hitSlop={8}
            >
              <Text style={styles.linkText}>Partager</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                navigation.navigate('Main', {
                  screen: 'Search',
                  params: {
                    origin: deal.origin_iata || deal.departure_airport,
                    adults,
                    destination: deal.destination,
                    city: deal.city,
                  },
                })
              }}
              hitSlop={8}
            >
              <Text style={styles.linkText}>Voir d’autres dates</Text>
            </Pressable>
            {deal.provider === 'liteapi' || deal.deal_key ? (
              <Pressable
                onPress={() =>
                  navigation.navigate('DealCheckout', {
                    dealId: deal.id,
                    hotelId: selected?.id || deal.hotel?.id,
                  })
                }
                hitSlop={8}
              >
                <Text style={styles.linkText}>Réserver seulement l’hôtel</Text>
              </Pressable>
            ) : hasPartnerUrl ? (
              <Pressable
                onPress={() =>
                  openInAppBrowser(navigation, deal.booking_url!, 'Voir l’offre')
                }
                hitSlop={8}
              >
                <Text style={styles.linkText}>Voir l’offre</Text>
              </Pressable>
            ) : null}
            {flightUrl ? (
              <Pressable onPress={() => void openFlight()} hitSlop={8}>
                <Text style={styles.linkText}>Réserver le vol</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* Sticky decision bar — price + primary CTA only */}
      <View style={[styles.ctaBar, { paddingBottom: Math.max(insets.bottom, 12) }, shadow.lift]}>
        <View style={styles.ctaPriceCol}>
          <Text style={styles.ctaPrice}>
            {Math.round(pricePp)} €
            <Text style={styles.ctaPriceUnit}> / pers.</Text>
          </Text>
          <Text style={styles.ctaPriceMeta} numberOfLines={1}>
            {formatDate(deal.dates.outbound)} → {formatDate(deal.dates.inbound)}
            {' · '}
            {deal.nights}n
          </Text>
        </View>
        <Pressable
          onPress={() => void startMyTrip()}
          disabled={startingTrip || composingHotel}
          style={({ pressed }) => [
            styles.ctaPrimary,
            pressed && { opacity: 0.9 },
            (startingTrip || composingHotel) && { opacity: 0.6 },
          ]}
        >
          <PlaneIcon size={16} color={colors.white} />
          <Text style={styles.ctaText}>
            {startingTrip ? '…' : 'Organiser mon séjour'}
          </Text>
        </Pressable>
      </View>

      <HotelComposeDetailSheet
        visible={hotelSheetOpen}
        hotel={toUpsellHotel(
          hotelOptions.find((h) => h.id === (sheetHotelId || selected?.id)) ||
            selected ||
            deal.hotel,
        )}
        cityLabel={[deal.city, deal.country].filter(Boolean).join(' · ')}
        checkin={deal.dates?.outbound}
        checkout={deal.dates?.inbound}
        adults={adults}
        closeLabel="Fermer"
        confirmLabel="Garder cet hôtel"
        onClose={() => setHotelSheetOpen(false)}
        onConfirm={() => {
          const id = sheetHotelId || selected?.id
          if (id) setHotelId(id)
          setHotelSheetOpen(false)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
    padding: 24,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
  },
  headerLike: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.full,
    marginBottom: 8,
  },
  badgeText: { color: colors.white, fontFamily: fonts.bold, fontSize: 12 },
  city: {
    color: colors.white,
    fontFamily: fonts.extrabold,
    fontSize: 26,
    letterSpacing: -0.6,
  },
  country: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.medium,
    fontSize: 13,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
  },
  aboveFold: {
    gap: 12,
    marginBottom: 18,
  },
  priceBlock: {},
  stack: {
    gap: 18,
  },
  price: { ...type.price, fontSize: 30, lineHeight: 34 },
  priceHint: { ...type.caption, marginTop: 2, lineHeight: 16 },
  baggage: {
    marginTop: 8,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.inkSoft,
    lineHeight: 16,
  },
  tax: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#92400e',
  },
  notice: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noticeText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.primaryInk,
  },
  infoCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  flightCard: {
    paddingVertical: 12,
  },
  hotelCard: {
    paddingVertical: 12,
  },
  whyGoodCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#BBF7D0',
  },
  whyGoodTitle: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: '#047857',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  whyGoodRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  whyGoodRowSpaced: {
    marginBottom: 12,
  },
  whyGoodCheck: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.success,
    lineHeight: 22,
    width: 22,
    marginRight: 10,
  },
  whyGoodText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 22,
  },
  cardSectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.faint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  airportLine: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
    marginBottom: 2,
  },
  airportArrowInline: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.faint,
  },
  legRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 5,
  },
  legLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.muted,
    width: 52,
  },
  legValue: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.ink,
    textAlign: 'right',
    lineHeight: 17,
  },
  durationValue: {
    color: '#047857',
  },
  directHint: {
    marginTop: 6,
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: '#047857',
  },
  reviewsBlock: {
    paddingTop: 4,
  },
  reviewsHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  reviewCountHint: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    color: colors.muted,
  },
  reviewCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  reviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'nowrap',
  },
  reviewMeta: {
    flex: 1,
    flexShrink: 1,
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.muted,
  },
  reviewText: {
    marginTop: 8,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  moreReviews: {
    marginTop: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  moreReviewsText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  flightPriceLine: {
    marginTop: 6,
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.ink,
  },
  hotelStars: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 1,
    color: '#D97706',
    marginBottom: 2,
  },
  hotelTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
    lineHeight: 21,
  },
  ficheLink: {
    marginTop: 6,
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primaryDeep,
  },
  optionFiche: {
    marginTop: 4,
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.primaryDeep,
  },
  hotelMeta: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  composeBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  composeBtnStandalone: {
    marginTop: 0,
  },
  composeBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.primaryInk,
  },
  switchBlock: {},
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 12,
  },
  hotelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 10,
  },
  hotelOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  hotelOptionName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  hotelOptionMeta: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, marginTop: 2 },
  hotelOptionPrice: { fontFamily: fonts.bold, fontSize: 14, color: colors.primary },
  highlights: {},
  highlightRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  bullet: { fontFamily: fonts.bold, fontSize: 16, color: colors.primary, lineHeight: 22 },
  highlightText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  secondaryLinks: {
    marginTop: spacing.xl,
    gap: 14,
    paddingBottom: spacing.md,
    alignItems: 'flex-start',
  },
  linkText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.primary,
  },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  ctaPriceCol: { flex: 1, minWidth: 0 },
  ctaPrice: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.primary,
  },
  ctaPriceUnit: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.muted,
  },
  ctaPriceMeta: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  ctaPrimary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  ctaText: { ...type.button, color: colors.white },
})
