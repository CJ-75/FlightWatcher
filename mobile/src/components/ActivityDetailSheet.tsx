import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Modal,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ACTIVITY_ADD_TO_PLANNER_FR,
  activityDetailFromCard,
  toActivityDetailModel,
  type ActivityCardModel,
  type ActivityDetailModel,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { HotelPhotoGallery } from './HotelPhotoGallery'
import { ReviewStars } from './ReviewStars'
import { colors, fonts, radius, spacing } from '../theme'

type Props = {
  visible: boolean
  card: ActivityCardModel | null
  adults?: number
  addBusy?: boolean
  alreadyAdded?: boolean
  addLabel?: string
  onBook: (card: ActivityCardModel) => void
  onAdd: (card: ActivityCardModel) => void
  onClose: () => void
}

export function ActivityDetailSheet({
  visible,
  card,
  adults = 2,
  addBusy = false,
  alreadyAdded = false,
  addLabel,
  onBook,
  onAdd,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets()
  const [detail, setDetail] = useState<ActivityDetailModel | null>(null)
  const [loading, setLoading] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const [gallerySwipeActive, setGallerySwipeActive] = useState(false)

  useEffect(() => {
    if (!visible || !card) {
      setDetail(null)
      return
    }
    setDetail(activityDetailFromCard(card))
    setDescExpanded(false)
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const res = await getApi().getActivityProduct(card.productCode)
        if (cancelled || !res?.product) return
        setDetail(
          toActivityDetailModel(
            res.product as Record<string, unknown>,
            adults,
            card,
          ),
        )
      } catch {
        /* keep seed */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [visible, card, adults])

  const seedPhotos = useMemo(
    () => (detail?.photos || []).map((p) => p.url).filter(Boolean),
    [detail?.photos],
  )

  if (!card) return null
  const d = detail || activityDetailFromCard(card)

  const chips = [
    d.freeCancellation ? 'Annulation gratuite' : null,
    d.instantConfirmation ? 'Confirmation instantanée' : null,
    d.durationLabel,
    d.category,
  ].filter(Boolean) as string[]

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
            <Text style={styles.backText}>Fermer</Text>
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {d.title}
          </Text>
          <View style={{ width: 64 }} />
        </View>

        <ScrollView
          scrollEnabled={!gallerySwipeActive}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        >
          <HotelPhotoGallery
            seedPhoto={d.photoUrl}
            seedPhotos={seedPhotos}
            alt={d.title}
            hotelName={d.title}
            cityLabel={d.destinationLabel || undefined}
            height={260}
            onHorizontalGesture={setGallerySwipeActive}
          />

          <View style={styles.body}>
            <View style={styles.identity}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name}>{d.title}</Text>
                {d.rating != null ? (
                  <View style={styles.ratingRow}>
                    <ReviewStars rating={d.rating} size={14} />
                    {d.reviewCount != null && d.reviewCount > 0 ? (
                      <Text style={styles.reviewText} numberOfLines={1}>
                        {d.reviewCount.toLocaleString('fr-FR')} avis
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {[
                  d.distanceLabel,
                  d.destinationLabel ? `À ${d.destinationLabel}` : null,
                ].some(Boolean) ? (
                  <Text style={styles.metaText} numberOfLines={2}>
                    {[
                      d.distanceLabel,
                      d.destinationLabel ? `À ${d.destinationLabel}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                ) : null}
              </View>
              {d.priceLabel ? (
                <View style={styles.priceBlock}>
                  <Text style={styles.price}>{d.priceLabel}</Text>
                  <Text style={styles.priceUnit}>indicatif</Text>
                </View>
              ) : null}
            </View>

            {chips.length ? (
              <View style={styles.chipWrap}>
                {chips.map((c) => (
                  <View key={c} style={styles.chip}>
                    <Text style={styles.chipText}>{c}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.loadingText}>Chargement du détail…</Text>
              </View>
            ) : null}

            {d.description ? (
              <View>
                <Text style={styles.sectionTitle}>À propos</Text>
                <Text
                  style={styles.desc}
                  numberOfLines={descExpanded ? undefined : 4}
                >
                  {d.description}
                </Text>
                {d.description.length > 160 ? (
                  <Pressable onPress={() => setDescExpanded((v) => !v)} hitSlop={8}>
                    <Text style={styles.link}>
                      {descExpanded ? 'Réduire' : 'Lire la suite'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {d.meetingPoint ? (
              <View>
                <Text style={styles.sectionTitle}>Point de rendez-vous</Text>
                <Text style={styles.desc}>{d.meetingPoint}</Text>
              </View>
            ) : null}

            {d.inclusions.length ? (
              <View>
                <Text style={styles.sectionTitle}>Inclus</Text>
                {d.inclusions.map((item) => (
                  <Text key={item} style={styles.listItem}>
                    ✓ {item}
                  </Text>
                ))}
              </View>
            ) : null}

            {d.exclusions.length ? (
              <View>
                <Text style={styles.sectionTitle}>Non inclus</Text>
                {d.exclusions.map((item) => (
                  <Text key={item} style={styles.listItem}>
                    – {item}
                  </Text>
                ))}
              </View>
            ) : null}

            {d.languages.length ? (
              <View>
                <Text style={styles.sectionTitle}>Langues</Text>
                <Text style={styles.desc}>{d.languages.join(' · ')}</Text>
              </View>
            ) : null}

            {d.additionalInfo.length ? (
              <View>
                <Text style={styles.sectionTitle}>Bon à savoir</Text>
                {d.additionalInfo.map((item) => (
                  <Text key={item} style={styles.listItem}>
                    {item}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <Pressable style={styles.cta} onPress={() => onBook(card)}>
            <Text style={styles.ctaText}>Réserver sur Viator</Text>
          </Pressable>
          {!alreadyAdded ? (
            <Pressable
              style={styles.secondary}
              disabled={addBusy}
              onPress={() => onAdd(card)}
            >
              <Text style={styles.secondaryText}>
                {addLabel || ACTIVITY_ADD_TO_PLANNER_FR}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  backBtn: { width: 64 },
  backText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.primary,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  body: {
    padding: spacing.md,
    gap: 16,
  },
  identity: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  name: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    minHeight: 18,
  },
  reviewText: {
    flexShrink: 1,
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 16,
  },
  metaText: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
  priceBlock: { alignItems: 'flex-end' },
  price: {
    fontFamily: fonts.extrabold,
    fontSize: 15,
    color: colors.ink,
  },
  priceUnit: {
    fontFamily: fonts.semibold,
    fontSize: 9,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: '#065f46',
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
  sectionTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 14,
    color: colors.ink,
    marginBottom: 6,
  },
  desc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  listItem: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    marginBottom: 3,
  },
  link: {
    marginTop: 4,
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primary,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: '#fff',
  },
  secondary: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
})
