import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Modal,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Image,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  boardLabelFr,
  hotelCancelLabel,
  type HotelGalleryPhoto,
  type HotelGuestReview,
  type HotelUpsellOption,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { HotelPhotoGallery } from './HotelPhotoGallery'
import { colors, fonts, radius, spacing } from '../theme'

type Props = {
  visible: boolean
  hotel: HotelUpsellOption | null
  cityLabel?: string | null
  checkin?: string | null
  checkout?: string | null
  adults?: number
  saving?: boolean
  onClose: () => void
  onConfirm: () => void
}

function hotelIdOf(h: HotelUpsellOption | null) {
  if (!h) return ''
  return String(h.id || h.hotel_id || '')
}

function formatDistance(m?: number | null) {
  if (m == null || Number.isNaN(Number(m))) return null
  const n = Number(m)
  if (n < 1000) return `${Math.round(n)} m du centre`
  return `${(n / 1000).toFixed(1)} km du centre`
}

function formatStationDistOnly(m?: number | null) {
  if (m == null || Number.isNaN(Number(m))) return null
  const n = Number(m)
  return n < 1000 ? `${Math.round(n)} m` : `${(n / 1000).toFixed(1)} km`
}

function ratingLabel(rating?: number | null) {
  if (rating == null || Number.isNaN(Number(rating))) return null
  const r = Number(rating)
  if (r >= 9) return 'Exceptionnel'
  if (r >= 8.5) return 'Excellent'
  if (r >= 8) return 'Très bien'
  if (r >= 7) return 'Bien'
  return 'Correct'
}

function formatShortDate(dateStr?: string | null) {
  if (!dateStr) return null
  try {
    return new Date(dateStr.slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return dateStr.slice(0, 10)
  }
}

function htmlToPlainText(raw: string): string {
  let s = String(raw || '').trim()
  if (!s) return ''
  s = s.replace(/<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|section|article)[^>]*>/gi, '\n')
  s = s.replace(/<[^>]+>/g, '')
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
  return s
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

function stayOfferLabels(h: HotelUpsellOption, facilities: string[]): string[] {
  const out: string[] = []
  const boardFr = boardLabelFr(h.board)
  const raw = String(h.board || '').trim()
  const code = raw.toUpperCase()
  const facilityBreakfast = facilities.some((f) => /petit|breakfast|café|cafe/i.test(f))
  const facilityRestaurant = facilities.some((f) =>
    /restaurant|demi-pension|pension|half.?board|full.?board/i.test(f),
  )

  if (
    boardFr === 'Petit-déjeuner inclus' ||
    code === 'BI' ||
    code === 'BB' ||
    code === 'BDI' ||
    code === 'BLI'
  ) {
    out.push('Petit-déjeuner inclus')
  } else if (boardFr === 'Demi-pension' || code === 'HB') {
    out.push('Demi-pension')
  } else if (boardFr === 'Pension complète' || code === 'FB') {
    out.push('Pension complète')
  } else if (boardFr === 'All inclusive' || code === 'AI') {
    out.push('All inclusive')
  } else if (boardFr === 'Chambre seule' || code === 'RO' || /room.?only/i.test(raw)) {
    out.push('Chambre seule')
    if (facilityBreakfast) out.push('Petit-déj. en option')
  } else if (boardFr) {
    out.push(boardFr)
  } else if (facilityBreakfast) {
    out.push('Petit-déj. à l’hôtel')
  }

  if (
    facilityRestaurant &&
    !out.some((l) => /demi-pension|pension complète|all inclusive|restaurant/i.test(l))
  ) {
    out.push('Restaurant')
  }

  const flex = hotelCancelLabel({
    refundable: h.refundable,
    cancel_deadline: h.cancel_deadline,
  })
  if (flex) out.push(flex)
  return out
}

function formatReviewDate(raw?: string | null): string | null {
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) {
    const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(raw).slice(0, 10)
  }
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatReviewCountry(raw?: string | null): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s) return null
  if (/^[a-z]{2}$/i.test(s)) {
    try {
      const name = new Intl.DisplayNames(['fr'], { type: 'region' }).of(s.toUpperCase())
      if (name) return name
    } catch {
      /* ignore */
    }
    return s.toUpperCase()
  }
  return s
}

function formatReviewType(raw?: string | null): string | null {
  if (!raw) return null
  const t = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!t) return null
  const map: Record<string, string> = {
    couple: 'En couple',
    family: 'En famille',
    family_with_children: 'En famille',
    family_with_kids: 'En famille',
    solo: 'Solo',
    solo_traveller: 'Solo',
    solo_traveler: 'Solo',
    business: 'Affaires',
    group: 'Entre amis',
    friends: 'Entre amis',
    other: 'Voyageur',
  }
  if (map[t]) return map[t]
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ')
}

function reviewMeta(r: HotelGuestReview) {
  return [r.name?.trim() || null, formatReviewCountry(r.country), formatReviewType(r.type), formatReviewDate(r.date)]
    .filter(Boolean)
    .join(' · ')
}

function mapsSearchUrl(name: string, city?: string | null) {
  const q = [name, city].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

export function HotelComposeDetailSheet({
  visible,
  hotel,
  cityLabel,
  checkin,
  checkout,
  adults = 2,
  saving = false,
  onClose,
  onConfirm,
}: Props) {
  const insets = useSafeAreaInsets()
  const hotelId = hotelIdOf(hotel)

  const [description, setDescription] = useState<string | null>(null)
  const [galleryPhotos, setGalleryPhotos] = useState<HotelGalleryPhoto[]>([])
  const [facilities, setFacilities] = useState<string[]>([])
  const [hotelAddress, setHotelAddress] = useState<string | null>(null)
  const [checkinTime, setCheckinTime] = useState<string | null>(null)
  const [checkoutTime, setCheckoutTime] = useState<string | null>(null)
  const [guestReviews, setGuestReviews] = useState<HotelGuestReview[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [reviewsExpanded, setReviewsExpanded] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)

  useEffect(() => {
    if (!visible || !hotelId) {
      setDescription(null)
      setGalleryPhotos([])
      setFacilities([])
      setHotelAddress(null)
      setCheckinTime(null)
      setCheckoutTime(null)
      setGuestReviews([])
      setReviewsLoading(false)
      setReviewsExpanded(false)
      setDescExpanded(false)
      return
    }
    let cancelled = false
    setDescription(null)
    setGalleryPhotos([])
    setFacilities([])
    setHotelAddress(null)
    setCheckinTime(null)
    setCheckoutTime(null)
    setGuestReviews([])
    setReviewsLoading(true)
    setReviewsExpanded(false)
    setDescExpanded(false)

    const seed = hotel?.photo || hotel?.thumbnail
    if (seed) {
      setGalleryPhotos([{ url: String(seed), thumb: String(seed), order: 0 }])
    }

    const api = getApi()
    void api
      .getHotelGallery(hotelId, { language: 'fr' })
      .then((g) => {
        if (cancelled) return
        const d =
          typeof g.description === 'string' ? htmlToPlainText(g.description) : ''
        setDescription(d || null)
        setFacilities(
          Array.isArray(g.facilities)
            ? g.facilities.filter((x): x is string => Boolean(x && String(x).trim()))
            : [],
        )
        setHotelAddress(
          typeof g.address === 'string' && g.address.trim() ? g.address.trim() : null,
        )
        setCheckinTime(
          typeof g.checkin_time === 'string' && g.checkin_time.trim()
            ? g.checkin_time.trim()
            : null,
        )
        setCheckoutTime(
          typeof g.checkout_time === 'string' && g.checkout_time.trim()
            ? g.checkout_time.trim()
            : null,
        )
        const photos = Array.isArray(g.photos) ? g.photos.filter((p) => p?.url) : []
        if (photos.length) setGalleryPhotos(photos)
      })
      .catch(() => {
        if (!cancelled) setDescription(null)
      })

    void api
      .getHotelReviews(hotelId, { language: 'fr', limit: 10 })
      .then((r) => {
        if (cancelled) return
        setGuestReviews(Array.isArray(r.reviews) ? r.reviews.slice(0, 10) : [])
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
  }, [visible, hotelId, hotel?.photo, hotel?.thumbnail])

  const nights = useMemo(() => {
    if (!checkin || !checkout) return null
    try {
      const a = new Date(checkin + 'T12:00:00').getTime()
      const b = new Date(checkout + 'T12:00:00').getTime()
      const n = Math.round((b - a) / 86400000)
      return n > 0 ? n : null
    } catch {
      return null
    }
  }, [checkin, checkout])

  const offerChips = useMemo(
    () => (hotel ? stayOfferLabels(hotel, facilities) : []),
    [hotel, facilities],
  )

  const amenityChips = useMemo(() => {
    if (!hotel) return [] as string[]
    const skip = new Set<string>([
      ...offerChips,
      'Petit-déjeuner',
      'Petit-déjeuner inclus',
      'Petit-déj. en option',
      'Petit-déj. à l’hôtel',
      'Restaurant',
      'Chambre seule',
      'Demi-pension',
      'Pension complète',
      'All inclusive',
    ])
    const boardFr = boardLabelFr(hotel.board)
    if (boardFr) skip.add(boardFr)
    const seen = new Set<string>()
    const out: string[] = []
    const dist = formatDistance(hotel.distance_m)
    const extras = [
      dist,
      ...facilities,
    ].filter(Boolean) as string[]
    for (const a of extras) {
      const t = String(a || '').trim()
      if (!t || seen.has(t) || skip.has(t)) continue
      if (/petit|breakfast|annul|pension|inclusive|chambre seule|non remboursable/i.test(t))
        continue
      seen.add(t)
      out.push(t)
      if (out.length >= 7) break
    }
    return out
  }, [hotel, facilities, offerChips])

  const bodyPhotos = useMemo(
    () => (galleryPhotos.length > 1 ? galleryPhotos.slice(1, 6) : []),
    [galleryPhotos],
  )
  const mosaicExtra = Math.max(0, galleryPhotos.length - 1 - bodyPhotos.length)
  const visibleReviews = reviewsExpanded ? guestReviews : guestReviews.slice(0, 5)
  const rLabel = hotel ? ratingLabel(hotel.rating) : null
  const outLabel = formatShortDate(checkin)
  const retLabel = formatShortDate(checkout)
  const price =
    hotel?.hotel_pp != null
      ? Math.round(Number(hotel.hotel_pp))
      : hotel?.public_hotel_price != null
        ? Math.round(Number(hotel.public_hotel_price))
        : null

  if (!hotel) return null

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.backBtn} hitSlop={8}>
            <Text style={styles.backText}>‹ Liste</Text>
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {hotel.name || 'Hôtel'}
          </Text>
          <View style={{ width: 64 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        >
          <HotelPhotoGallery
            hotelId={hotelId}
            seedPhoto={hotel.photo || hotel.thumbnail}
            seedPhotos={galleryPhotos.map((p) => p.url)}
            alt={hotel.name || 'Hôtel'}
            hotelName={hotel.name}
            cityLabel={cityLabel || undefined}
            height={260}
          />

          <View style={styles.body}>
            <View style={styles.identity}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name}>{hotel.name || 'Hôtel'}</Text>
                <View style={styles.metaRow}>
                  {hotel.stars ? (
                    <Text style={styles.stars}>{'★'.repeat(Math.min(5, Math.round(hotel.stars)))}</Text>
                  ) : null}
                  {hotel.rating != null ? (
                    <View style={styles.ratingRow}>
                      <View style={styles.ratingBadge}>
                        <Text style={styles.ratingBadgeText}>
                          {Number(hotel.rating).toFixed(1)}
                        </Text>
                      </View>
                      <Text style={styles.ratingText}>
                        {rLabel || 'Note'}
                        {hotel.review_count != null && hotel.review_count > 0
                          ? ` · ${Number(hotel.review_count).toLocaleString('fr-FR')} avis`
                          : ''}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {(formatDistance(hotel.distance_m) || cityLabel) && (
                  <Text style={styles.locLine}>
                    {formatDistance(hotel.distance_m) || cityLabel}
                    {hotel.station_name && formatStationDistOnly(hotel.station_distance_m)
                      ? ` · ${formatStationDistOnly(hotel.station_distance_m)} de ${hotel.station_name}`
                      : ''}
                  </Text>
                )}
              </View>
              {price != null ? (
                <View style={styles.priceBlock}>
                  <Text style={styles.price}>{price}€</Text>
                  <Text style={styles.priceUnit}>/ pers. hôtel</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.stayBox}>
              {(outLabel || retLabel || nights) && (
                <Text style={styles.stayDates}>
                  {[outLabel, retLabel].filter(Boolean).join(' → ')}
                  {nights != null ? ` · ${nights} nuit${nights > 1 ? 's' : ''}` : ''}
                  {adults > 0 ? ` · ${adults} voy.` : ''}
                </Text>
              )}
              {offerChips.length ? (
                <View style={styles.chipWrap}>
                  {offerChips.map((label) => (
                    <View key={label} style={styles.offerChip}>
                      <Text style={styles.offerChipText}>{label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {(checkinTime || checkoutTime) && (
                <View style={styles.chipWrap}>
                  {checkinTime ? (
                    <View style={styles.timeChip}>
                      <Text style={styles.timeChipText}>Arrivée {checkinTime}</Text>
                    </View>
                  ) : null}
                  {checkoutTime ? (
                    <View style={styles.timeChip}>
                      <Text style={styles.timeChipText}>Départ {checkoutTime}</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>

            {amenityChips.length ? (
              <View style={styles.chipWrap}>
                {amenityChips.map((a) => (
                  <View key={a} style={styles.amenityChip}>
                    <Text style={styles.amenityText}>✓ {a}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {bodyPhotos.length > 0 ? (
              <View>
                <Text style={styles.sectionTitle}>Photos</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {bodyPhotos.map((p, i) => (
                    <View key={`${p.url}-${i}`} style={styles.mosaicItem}>
                      <Image
                        source={{ uri: p.thumb || p.url }}
                        style={styles.mosaicImg}
                      />
                      {i === bodyPhotos.length - 1 && mosaicExtra > 0 ? (
                        <View style={styles.mosaicMore}>
                          <Text style={styles.mosaicMoreText}>+{mosaicExtra}</Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {description ? (
              <View>
                <Text style={styles.sectionTitle}>À propos</Text>
                <Text
                  style={styles.desc}
                  numberOfLines={descExpanded ? undefined : 4}
                >
                  {description}
                </Text>
                {description.length > 160 ? (
                  <Pressable onPress={() => setDescExpanded((v) => !v)} hitSlop={8}>
                    <Text style={styles.link}>
                      {descExpanded ? 'Réduire' : 'Lire la suite'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Emplacement</Text>
                <Pressable
                  onPress={() =>
                    void Linking.openURL(mapsSearchUrl(hotel.name || '', cityLabel))
                  }
                  hitSlop={8}
                >
                  <Text style={styles.link}>Ouvrir Maps</Text>
                </Pressable>
              </View>
              {hotelAddress ? (
                <Text style={styles.address}>
                  {hotelAddress}
                  {cityLabel ? `, ${cityLabel}` : ''}
                </Text>
              ) : null}
              {hotel.stations && hotel.stations.length > 0
                ? hotel.stations.slice(0, 2).map((s, idx) => {
                    const dist = formatStationDistOnly(s.distance_m)
                    return (
                      <Text key={s.name} style={styles.stationLine}>
                        {dist ? `${dist} · ` : ''}
                        {s.name}
                        {idx === 0 ? ' · gare principale' : ''}
                      </Text>
                    )
                  })
                : hotel.station_name && formatStationDistOnly(hotel.station_distance_m) ? (
                    <Text style={styles.stationLine}>
                      {formatStationDistOnly(hotel.station_distance_m)} · {hotel.station_name}{' '}
                      · gare principale
                    </Text>
                  ) : null}
            </View>

            {reviewsLoading || guestReviews.length > 0 ? (
              <View style={styles.reviewsBlock}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Avis</Text>
                  {hotel.review_count != null && hotel.review_count > 0 ? (
                    <Text style={styles.reviewCount}>
                      {Number(hotel.review_count).toLocaleString('fr-FR')} avis
                    </Text>
                  ) : null}
                </View>
                {reviewsLoading && guestReviews.length === 0 ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    {visibleReviews.map((r, i) => {
                      const meta = reviewMeta(r)
                      const excerpt = r.pros || r.text || r.headline || r.cons || ''
                      return (
                        <View key={`${r.name || 'avis'}-${r.date || i}`} style={styles.reviewCard}>
                          <View style={styles.reviewTop}>
                            {r.score != null ? (
                              <Text style={styles.reviewScore}>
                                {Number(r.score).toFixed(1)}/10
                              </Text>
                            ) : null}
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
                              {r.headline && r.headline !== excerpt ? (
                                <Text style={styles.reviewHeadline}>{r.headline} · </Text>
                              ) : null}
                              {excerpt}
                            </Text>
                          ) : null}
                        </View>
                      )
                    })}
                    {guestReviews.length > 5 ||
                    guestReviews.some((r) => String(r.pros || r.text || '').length > 120) ? (
                      <Pressable
                        style={styles.moreReviews}
                        onPress={() => setReviewsExpanded((v) => !v)}
                      >
                        <Text style={styles.moreReviewsText}>
                          {reviewsExpanded
                            ? 'Voir moins'
                            : guestReviews.length > 5
                              ? `Voir plus · ${guestReviews.length - 5} avis`
                              : 'Voir plus'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            style={[styles.cta, saving && styles.ctaDisabled]}
            disabled={saving}
            onPress={onConfirm}
          >
            <Text style={styles.ctaText}>
              {saving ? '…' : 'Réserver cet hôtel'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  backBtn: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  backText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.extrabold,
    fontSize: 15,
    color: colors.ink,
  },
  body: { padding: spacing.lg, gap: spacing.lg },
  identity: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  name: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    color: colors.ink,
    lineHeight: 28,
  },
  metaRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  stars: { color: '#D97706', fontSize: 14, letterSpacing: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingBadge: {
    backgroundColor: colors.ink,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ratingBadgeText: {
    fontFamily: fonts.extrabold,
    fontSize: 11,
    color: colors.white,
  },
  ratingText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.inkSoft },
  locLine: {
    marginTop: 8,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  priceBlock: { alignItems: 'flex-end', paddingTop: 2 },
  price: { fontFamily: fonts.extrabold, fontSize: 26, color: colors.ink },
  priceUnit: { fontFamily: fonts.semibold, fontSize: 10, color: colors.muted, marginTop: 2 },
  stayBox: {
    backgroundColor: colors.canvas,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 10,
  },
  stayDates: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  offerChip: {
    backgroundColor: colors.successSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#B7E4CF',
  },
  offerChipText: { fontFamily: fonts.bold, fontSize: 11, color: colors.success },
  timeChip: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  timeChipText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.inkSoft },
  amenityChip: {
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  amenityText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.inkSoft },
  sectionTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 11,
    color: colors.ink,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  mosaicItem: {
    width: 112,
    height: 88,
    borderRadius: radius.sm,
    overflow: 'hidden',
    marginRight: 8,
    backgroundColor: colors.line,
  },
  mosaicImg: { width: '100%', height: '100%' },
  mosaicMore: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26,18,14,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mosaicMoreText: { fontFamily: fonts.extrabold, color: colors.white, fontSize: 16 },
  desc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 20,
  },
  link: {
    marginTop: 6,
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primary,
  },
  address: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.inkSoft,
    marginBottom: 8,
    lineHeight: 18,
  },
  stationLine: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.inkSoft,
    marginBottom: 4,
  },
  reviewsBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing.lg,
  },
  reviewCount: { fontFamily: fonts.semibold, fontSize: 10, color: colors.muted },
  reviewCard: {
    backgroundColor: colors.canvas,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: 8,
  },
  reviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  reviewScore: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  reviewMeta: { flex: 1, fontFamily: fonts.regular, fontSize: 10, color: colors.muted },
  reviewText: {
    marginTop: 8,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  reviewHeadline: { fontFamily: fonts.bold, color: colors.ink },
  moreReviews: {
    marginTop: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  moreReviewsText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
    backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: colors.line },
  ctaText: { fontFamily: fonts.bold, color: colors.white, fontSize: 15 },
})
