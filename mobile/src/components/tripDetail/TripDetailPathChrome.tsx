import React, { useEffect, useState, type ReactNode } from 'react'
import {
  View,
  Text,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  TRIP_DETAIL_TABS,
  trackTripTabViewed,
  type TripDetailTabId,
  type TripPrimaryAction,
} from '@flightwatcher/shared'
import { getApi } from '../../lib/client'
import { colors, fonts } from '../../theme'

type Props = {
  tripId: string
  heroUrl: string
  title: string
  metaLine: string
  phaseLabel: string
  primary: TripPrimaryAction
  onPrimary: () => void
  onBack: () => void
  onShare?: () => void
  groupRow?: ReactNode
  apercu: ReactNode
  programme: ReactNode
  carnet: ReactNode
  estimatedTotalLabel?: string | null
}

export function TripDetailPathChrome({
  tripId,
  heroUrl,
  title,
  metaLine,
  phaseLabel,
  primary,
  onPrimary,
  onBack,
  onShare,
  groupRow,
  apercu,
  programme,
  carnet,
  estimatedTotalLabel,
}: Props) {
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<TripDetailTabId>('apercu')

  useEffect(() => {
    void trackTripTabViewed((body) => getApi().trackActivityEvent(body), {
      tripId,
      variant: 'v2',
      tab,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    })
  }, [tab, tripId])

  const body =
    tab === 'apercu' ? apercu : tab === 'programme' ? programme : carnet

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        stickyHeaderIndices={[]}
      >
        <ImageBackground source={{ uri: heroUrl }} style={styles.hero}>
          <LinearGradient
            colors={['rgba(20,12,8,0.35)', 'rgba(20,12,8,0.92)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroTop, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={onBack} style={styles.glassBtn}>
              <Text style={styles.glassBtnText}>←</Text>
            </Pressable>
            {onShare ? (
              <Pressable onPress={onShare} style={styles.glassPill}>
                <Text style={styles.glassBtnText}>Partager</Text>
              </Pressable>
            ) : (
              <View />
            )}
          </View>
          <View style={styles.heroCopy}>
            <View style={styles.phasePill}>
              <Text style={styles.phaseText}>{phaseLabel}</Text>
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.meta}>{metaLine}</Text>
          </View>
        </ImageBackground>

        <View style={styles.sheet}>
          {groupRow}
          <View style={styles.tabs}>
            {TRIP_DETAIL_TABS.map((t) => {
              const active = tab === t.id
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTab(t.id)}
                  style={styles.tab}
                >
                  <Text
                    style={[styles.tabLabel, active && styles.tabLabelActive]}
                  >
                    {t.label}
                  </Text>
                  {active ? <View style={styles.tabUnderline} /> : null}
                </Pressable>
              )
            })}
          </View>
          <View style={styles.panel}>{body}</View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.sticky,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        {estimatedTotalLabel ? (
          <Text style={styles.stickyPrice} numberOfLines={1}>
            {estimatedTotalLabel}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {primary.informational ? (
          <Text style={styles.stickyInfo}>{primary.label}</Text>
        ) : (
          <Pressable onPress={onPrimary} style={styles.stickyCta}>
            <Text style={styles.stickyCtaText}>{primary.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF9F5' },
  hero: { minHeight: 280, justifyContent: 'space-between' },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  glassBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  glassPill: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  glassBtnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 15 },
  heroCopy: { paddingHorizontal: 20, paddingBottom: 36, gap: 8 },
  phasePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  phaseText: {
    color: '#fff',
    fontFamily: fonts.bold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  title: {
    color: '#fff',
    fontFamily: fonts.extrabold,
    fontSize: 32,
    fontStyle: 'italic',
  },
  meta: { color: 'rgba(255,255,255,0.78)', fontFamily: fonts.medium, fontSize: 14 },
  sheet: {
    marginTop: -24,
    backgroundColor: '#FFF9F5',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 18,
    minHeight: 400,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#FFDCC8',
    marginBottom: 16,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabLabel: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: '#94A3B8',
  },
  tabLabelActive: { color: colors.ink },
  tabUnderline: {
    marginTop: 8,
    height: 2,
    width: '40%',
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  panel: { paddingBottom: 24 },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(255,249,245,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#FFDCC8',
  },
  stickyPrice: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
  stickyInfo: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: '#64748B',
  },
  stickyCta: {
    backgroundColor: '#1A120E',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
  },
  stickyCtaText: {
    color: '#fff',
    fontFamily: fonts.extrabold,
    fontSize: 14,
  },
})
