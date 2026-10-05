import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  Pressable,
  Linking,
  ActivityIndicator,
  Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { TravelDeal } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { HeartIcon } from '../components/HeartIcon'
import { useLikedDeals } from '../hooks/useLikedDeals'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../../App'
import { colors, fonts, radius, shadow, spacing, type } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'DealDetail'>

const width = Dimensions.get('window').width

function formatDate(dateStr: string) {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

const PROVIDER_LABEL: Record<string, string> = {
  mock: 'Offre partenaire',
  expedia: 'Expedia',
  lastminute: 'lastminute.com',
}

export function DealDetailScreen({ route }: Props) {
  const { dealId } = route.params
  const insets = useSafeAreaInsets()
  const { isLiked, toggleLike, refresh: refreshLikes } = useLikedDeals()
  const [deal, setDeal] = useState<TravelDeal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const d = await getApi().getDeal(dealId)
        if (!cancelled) setDeal(d)
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

  const openOffer = async () => {
    if (!deal?.booking_url) return
    await Linking.openURL(deal.booking_url)
  }

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

  const partner = PROVIDER_LABEL[deal.provider] || 'Partenaire'

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        <View style={styles.hero}>
          {!failed ? (
            <Image
              source={{ uri: deal.image_url }}
              style={styles.heroImage}
              onError={() => setFailed(true)}
            />
          ) : (
            <LinearGradient colors={[colors.primary, colors.primaryDeep]} style={styles.heroImage}>
              <Text style={styles.fallbackCity}>{deal.city}</Text>
            </LinearGradient>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(12,18,34,0.75)']}
            style={styles.heroFade}
          />
          <Pressable
            onPress={() => void toggleLike(deal)}
            hitSlop={10}
            style={[styles.likeBtn, { top: Math.max(insets.top, 12) + 8 }]}
            accessibilityRole="button"
            accessibilityLabel={isLiked(deal.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <HeartIcon
              size={22}
              filled={isLiked(deal.id)}
              color={isLiked(deal.id) ? colors.primary : colors.ink}
            />
          </Pressable>
          <View style={styles.heroCaption}>
            {deal.badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{deal.badge}</Text>
              </View>
            ) : null}
            <Text style={styles.city}>{deal.city}</Text>
            <Text style={styles.country}>{deal.country}</Text>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.priceBlock}>
            <Text style={styles.price}>{Math.round(deal.price_per_person)} €</Text>
            <Text style={styles.priceHint}>par personne · {deal.nights} nuit{deal.nights > 1 ? 's' : ''}</Text>
          </View>

          <Text style={styles.title}>{deal.title}</Text>
          <Text style={styles.description}>{deal.description}</Text>

          <View style={[styles.infoCard, shadow.soft]}>
            <InfoRow label="Départ" value={deal.departure_airport} />
            <InfoRow
              label="Dates"
              value={`${formatDate(deal.dates.outbound)} → ${formatDate(deal.dates.inbound)}`}
            />
            {deal.hotel_name ? (
              <InfoRow
                label="Hôtel"
                value={`${deal.hotel_name}${deal.hotel_stars ? ` · ${deal.hotel_stars}★` : ''}`}
              />
            ) : null}
            {deal.board ? <InfoRow label="Pension" value={deal.board} last /> : null}
          </View>

          {deal.highlights.length > 0 ? (
            <View style={styles.highlights}>
              <Text style={styles.sectionLabel}>Inclus</Text>
              {deal.highlights.map((h) => (
                <View key={h} style={styles.highlightRow}>
                  <Text style={styles.bullet}>·</Text>
                  <Text style={styles.highlightText}>{h}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={styles.partnerNote}>
            Offre via {partner}. Les prix et disponibilités sont confirmés sur le site partenaire.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.ctaBar, { paddingBottom: Math.max(insets.bottom, 12) }, shadow.lift]}>
        <Pressable
          onPress={() => void openOffer()}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
        >
          <Text style={styles.ctaText}>Voir l’offre</Text>
        </Pressable>
      </View>
    </View>
  )
}

function InfoRow({
  label,
  value,
  last,
}: {
  label: string
  value: string
  last?: boolean
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

const heroH = Math.min(280, Math.round(width * 0.62))

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
  hero: { height: heroH, backgroundColor: colors.line },
  heroImage: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  heroFade: {
    ...StyleSheet.absoluteFillObject,
    top: '40%',
  },
  likeBtn: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  fallbackCity: {
    color: colors.white,
    fontFamily: fonts.extrabold,
    fontSize: 32,
  },
  heroCaption: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 20,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.full,
    marginBottom: 8,
  },
  badgeText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  city: {
    color: colors.white,
    fontFamily: fonts.extrabold,
    fontSize: 30,
    letterSpacing: -0.8,
  },
  country: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.medium,
    fontSize: 14,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  priceBlock: { marginBottom: spacing.md },
  price: { ...type.price, fontSize: 36 },
  priceHint: { ...type.caption, marginTop: 2 },
  title: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.ink,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  description: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 24,
    color: colors.inkSoft,
    marginBottom: spacing.xl,
  },
  infoCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  infoRow: {
    paddingVertical: 14,
  },
  infoRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  infoLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoValue: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  highlights: { marginBottom: spacing.xl },
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  highlightRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  bullet: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.primary,
    lineHeight: 22,
  },
  highlightText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
    lineHeight: 22,
  },
  partnerNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.faint,
    marginBottom: 8,
  },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    ...type.button,
    color: colors.white,
  },
})
