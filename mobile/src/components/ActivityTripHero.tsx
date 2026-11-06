/** Hero CTA Activités — photo ville + overlay (parity web). */
import React, { useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ImageBackground,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  ACTIVITY_CHANGE_TRIP_FR,
  ACTIVITY_CHOOSE_TRIP_FR,
  ACTIVITY_NO_TRIP_CTA_BODY_FR,
  ACTIVITY_NO_TRIP_CTA_SECONDARY_FR,
  ACTIVITY_NO_TRIP_CTA_TITLE_FR,
  ACTIVITY_OPEN_PLANNER_FR,
  ACTIVITY_SYNC_CITY_FR,
  ACTIVITY_TRIP_PLANNER_COUNT_FR,
  ACTIVITY_TRIP_TIMING_HINT_FR,
  ACTIVITY_TRIP_TIMING_KICKER_FR,
  activityTripTimingStatus,
  cityImageUrl,
  type ActivityTripTimingStatus,
} from '@flightwatcher/shared'
import Svg, { Path } from 'react-native-svg'
import { colors, fonts, radius, shadow, spacing } from '../theme'

function ChevronDownIcon({ size = 14, color = colors.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <Path
        d="M2.1 4.2L6 8.2l3.9-4"
        stroke={color}
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

const DOT_COLOR: Record<ActivityTripTimingStatus, string> = {
  upcoming: '#38BDF8',
  ongoing: '#34D399',
  past: 'rgba(255,255,255,0.55)',
  undated: '#38BDF8',
}

type ActiveProps = {
  mode: 'active'
  cityLabel: string
  imageCity?: string
  plannerCount: number
  outDate?: string | null
  retDate?: string | null
  showSyncCity?: boolean
  onOpenPlanner: () => void
  onSyncCity?: () => void
  onChangeTrip?: () => void
}

type EmptyProps = {
  mode: 'empty'
  onBrowseTrips: () => void
  onChooseTrip?: () => void
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
          <View style={styles.actions}>
            {props.onChooseTrip ? (
              <Pressable
                onPress={props.onChooseTrip}
                style={({ pressed }) => [
                  styles.btnPrimary,
                  pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Text style={styles.btnPrimaryText}>{ACTIVITY_CHOOSE_TRIP_FR}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={props.onBrowseTrips}
              style={({ pressed }) => [
                styles.btnGhost,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.btnGhostText}>
                {ACTIVITY_NO_TRIP_CTA_SECONDARY_FR}
              </Text>
            </Pressable>
          </View>
        </LinearGradient>
      </ImageBackground>
    )
  }

  const timing = useMemo(
    () => activityTripTimingStatus(props.outDate, props.retDate),
    [props.outDate, props.retDate],
  )
  const kicker = ACTIVITY_TRIP_TIMING_KICKER_FR[timing]
  const hint = ACTIVITY_TRIP_TIMING_HINT_FR[timing]
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
            <View
              style={[styles.liveDot, { backgroundColor: DOT_COLOR[timing] }]}
            />
            <Text style={styles.liveText}>{kicker}</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {ACTIVITY_TRIP_PLANNER_COUNT_FR(props.plannerCount)}
            </Text>
          </View>
        </View>

        <View style={styles.bottom}>
          {props.onChangeTrip ? (
            <Pressable
              onPress={props.onChangeTrip}
              accessibilityLabel={ACTIVITY_CHOOSE_TRIP_FR}
              accessibilityHint={ACTIVITY_CHANGE_TRIP_FR}
              hitSlop={6}
              style={({ pressed }) => [
                styles.cityBtn,
                pressed && { opacity: 0.92 },
              ]}
            >
              <Text style={styles.city} numberOfLines={1}>
                {props.cityLabel}
              </Text>
              <View style={styles.changeChip}>
                <ChevronDownIcon size={14} color={colors.ink} />
              </View>
            </Pressable>
          ) : (
            <Text style={styles.city}>{props.cityLabel}</Text>
          )}
          <Text style={styles.hint}>{hint}</Text>
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
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
    minHeight: 140,
  },
  heroTall: { minHeight: 168 },
  image: { borderRadius: radius.lg },
  overlay: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'space-between',
    minHeight: 140,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  },
  liveText: {
    fontFamily: fonts.extrabold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.white,
  },
  countBadge: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  countText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.92)',
  },
  bottom: { gap: 8, marginTop: 20 },
  cityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
  },
  city: {
    flexShrink: 1,
    fontFamily: fonts.extrabold,
    fontSize: 22,
    letterSpacing: -0.4,
    color: colors.white,
  },
  changeChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.85)',
  },
  kickerMuted: {
    fontFamily: fonts.extrabold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 6,
  },
  titleEmpty: {
    fontFamily: fonts.extrabold,
    fontSize: 17,
    color: colors.white,
    marginBottom: 4,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  btnPrimary: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  btnPrimaryText: {
    fontFamily: fonts.extrabold,
    fontSize: 12,
    color: colors.ink,
  },
  btnGhost: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  btnGhostText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.white,
  },
})
