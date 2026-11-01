/** Hero CTA Activités — photo ville + overlay (parity web). */
import React from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ImageBackground,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  ACTIVITY_NO_TRIP_CTA_BODY_FR,
  ACTIVITY_NO_TRIP_CTA_BUTTON_FR,
  ACTIVITY_NO_TRIP_CTA_TITLE_FR,
  ACTIVITY_OPEN_PLANNER_FR,
  ACTIVITY_SYNC_CITY_FR,
  ACTIVITY_TRIP_HERO_KICKER_FR,
  ACTIVITY_TRIP_IN_PROGRESS_HINT_FR,
  ACTIVITY_TRIP_PLANNER_COUNT_FR,
  cityImageUrl,
} from '@flightwatcher/shared'
import { colors, fonts, radius, shadow, spacing } from '../theme'

type ActiveProps = {
  mode: 'active'
  cityLabel: string
  imageCity?: string
  plannerCount: number
  showSyncCity?: boolean
  onOpenPlanner: () => void
  onSyncCity?: () => void
}

type EmptyProps = {
  mode: 'empty'
  onBrowseTrips: () => void
}

type Props = ActiveProps | EmptyProps

export function ActivityTripHero(props: Props) {
  if (props.mode === 'empty') {
    return (
      <ImageBackground
        source={{ uri: cityImageUrl(null) }}
        style={[styles.hero, shadow.soft]}
        imageStyle={styles.image}
      >
        <LinearGradient
          colors={['rgba(20,12,8,0.35)', 'rgba(20,12,8,0.55)', 'rgba(20,12,8,0.88)']}
          locations={[0, 0.45, 1]}
          style={styles.overlay}
        >
          <Text style={styles.kickerMuted}>ACTIVITÉS + SÉJOUR</Text>
          <Text style={styles.titleEmpty}>{ACTIVITY_NO_TRIP_CTA_TITLE_FR}</Text>
          <Text style={styles.hint}>{ACTIVITY_NO_TRIP_CTA_BODY_FR}</Text>
          <Pressable
            onPress={props.onBrowseTrips}
            style={({ pressed }) => [
              styles.btnPrimary,
              pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
            ]}
          >
            <Text style={styles.btnPrimaryText}>
              {ACTIVITY_NO_TRIP_CTA_BUTTON_FR}
            </Text>
          </Pressable>
        </LinearGradient>
      </ImageBackground>
    )
  }

  const imageUrl = cityImageUrl(props.imageCity || props.cityLabel)

  return (
    <ImageBackground
      source={{ uri: imageUrl }}
      style={[styles.hero, styles.heroTall, shadow.soft]}
      imageStyle={styles.image}
    >
      <LinearGradient
        colors={[
          'rgba(8,4,2,0.25)',
          'rgba(8,4,2,0.35)',
          'rgba(8,4,2,0.88)',
        ]}
        locations={[0, 0.4, 1]}
        style={styles.overlay}
      >
        <View style={styles.badgeRow}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{ACTIVITY_TRIP_HERO_KICKER_FR}</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {ACTIVITY_TRIP_PLANNER_COUNT_FR(props.plannerCount)}
            </Text>
          </View>
        </View>

        <View style={styles.bottom}>
          <Text style={styles.city}>{props.cityLabel}</Text>
          <Text style={styles.hint}>{ACTIVITY_TRIP_IN_PROGRESS_HINT_FR}</Text>
          <View style={styles.actions}>
            <Pressable
              onPress={props.onOpenPlanner}
              style={({ pressed }) => [
                styles.btnPrimary,
                pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Text style={styles.btnPrimaryText}>{ACTIVITY_OPEN_PLANNER_FR}</Text>
            </Pressable>
            {props.showSyncCity && props.onSyncCity ? (
              <Pressable
                onPress={props.onSyncCity}
                style={({ pressed }) => [
                  styles.btnGhost,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={styles.btnGhostText}>
                  {ACTIVITY_SYNC_CITY_FR(props.cityLabel)}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </LinearGradient>
    </ImageBackground>
  )
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: spacing.md,
    minHeight: 168,
  },
  heroTall: { minHeight: 210 },
  image: { borderRadius: radius.xl },
  overlay: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'space-between',
    minHeight: 168,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#34D399',
  },
  liveText: {
    fontFamily: fonts.extrabold,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.white,
  },
  countBadge: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  countText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.92)',
  },
  kickerMuted: {
    fontFamily: fonts.extrabold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: 'rgba(255,255,255,0.72)',
    marginBottom: 8,
  },
  bottom: { marginTop: 28 },
  city: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    letterSpacing: -0.8,
    color: colors.white,
    includeFontPadding: false,
  },
  titleEmpty: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    letterSpacing: -0.4,
    color: colors.white,
    lineHeight: 28,
    marginBottom: 6,
  },
  hint: {
    marginTop: 6,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.86)',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  btnPrimary: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 13,
    minHeight: 48,
    justifyContent: 'center',
  },
  btnPrimaryText: {
    fontFamily: fonts.extrabold,
    fontSize: 14,
    color: colors.ink,
  },
  btnGhost: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 48,
    justifyContent: 'center',
  },
  btnGhostText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.white,
  },
})
