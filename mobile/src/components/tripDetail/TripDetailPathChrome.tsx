import React, { useEffect, useState, type ReactNode } from 'react'
import {
  View,
  Text,
  ImageBackground,
  Image,
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

type InsideChip = {
  label: string
  icon?: string
  tab?: TripDetailTabId
  onClick?: () => void
}

type Props = {
  tripId: string
  heroUrl: string
  title: string
  metaLine: string
  metaChips?: string[]
  phaseLabel: string
  primary: TripPrimaryAction
  onPrimary: () => void
  onBack: () => void
  onShare?: () => void
  guideAvatarUrl?: string | null
  guideName?: string | null
  guideSubtitle?: string | null
  groupRow?: ReactNode
  apercu: ReactNode
  programme: ReactNode
  carnet: ReactNode
  insideChips?: InsideChip[]
}

export function TripDetailPathChrome({
  tripId,
  heroUrl,
  title,
  metaLine,
  metaChips,
  phaseLabel,
  primary,
  onPrimary,
  onBack,
  onShare,
  guideAvatarUrl,
  guideName,
  guideSubtitle,
  groupRow,
  apercu,
  programme,
  carnet,
  insideChips,
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

  const chips =
    metaChips && metaChips.length > 0 ? metaChips : [phaseLabel].filter(Boolean)

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <ImageBackground source={{ uri: heroUrl }} style={styles.hero}>
          <LinearGradient
            colors={['rgba(0,0,0,0.38)', 'transparent', 'rgba(0,0,0,0.72)']}
            locations={[0, 0.35, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroTop, { paddingTop: insets.top + 6 }]}>
            <Pressable onPress={onBack} style={styles.glassBtn}>
              <Text style={styles.glassIcon}>←</Text>
            </Pressable>
            {onShare ? (
              <Pressable onPress={onShare} style={styles.glassBtn}>
                <Text style={styles.glassIcon}>↗</Text>
              </Pressable>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.title} numberOfLines={3}>
              {title}
            </Text>
            <View style={styles.chipRow}>
              {chips.map((c, i) => (
                <View key={`${c}-${i}`} style={styles.chipItem}>
                  {i > 0 ? <Text style={styles.chipDot}> · </Text> : null}
                  <Text style={styles.chipText}>{c}</Text>
                </View>
              ))}
            </View>
            {metaLine && chips.join(' · ') !== metaLine ? (
              <Text style={styles.meta}>{metaLine}</Text>
            ) : null}
          </View>
        </ImageBackground>

        <View style={styles.sheet}>
          {(guideName || groupRow) && (
            <View style={styles.guideRow}>
              <View style={styles.guideLeft}>
                <View style={styles.avatar}>
                  {guideAvatarUrl ? (
                    <Image
                      source={{ uri: guideAvatarUrl }}
                      style={styles.avatarImg}
                    />
                  ) : (
                    <Text style={styles.avatarLetter}>
                      {(guideName || '?').slice(0, 1).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.guideName} numberOfLines={1}>
                    {guideName || 'Organisateur'}
                  </Text>
                  <Text style={styles.guideSub} numberOfLines={1}>
                    {guideSubtitle || 'Organisateur du voyage'}
                  </Text>
                </View>
              </View>
              {onShare ? (
                <Pressable onPress={onShare} style={styles.inviteBtn}>
                  <Text style={styles.inviteText}>Inviter</Text>
                </Pressable>
              ) : null}
            </View>
          )}
          {groupRow && !guideName ? groupRow : null}

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

          {tab === 'apercu' && insideChips && insideChips.length > 0 ? (
            <View style={styles.insideGrid}>
              {insideChips.map((chip) => (
                <Pressable
                  key={chip.label}
                  onPress={() => {
                    if (chip.tab) setTab(chip.tab)
                    chip.onClick?.()
                  }}
                  style={styles.insideChip}
                >
                  <View style={styles.insideIcon}>
                    <Text style={styles.insideIconText}>
                      {chip.icon || chip.label.slice(0, 1)}
                    </Text>
                  </View>
                  <Text style={styles.insideLabel}>{chip.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.panel}>{body}</View>

          {!primary.informational ? (
            <Pressable onPress={onPrimary} style={styles.inlineCta}>
              <Text style={styles.inlineCtaText}>{primary.label}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F4EF' },
  hero: {
    minHeight: 420,
    justifyContent: 'space-between',
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  glassBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  glassIcon: {
    color: '#fff',
    fontFamily: fonts.semibold,
    fontSize: 16,
  },
  heroCopy: {
    paddingHorizontal: 20,
    paddingBottom: 44,
    gap: 8,
  },
  title: {
    color: '#fff',
    fontFamily: fonts.serifItalic,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -0.6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  chipItem: { flexDirection: 'row', alignItems: 'center' },
  chipDot: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  chipText: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  meta: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  sheet: {
    marginTop: -28,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 20,
    minHeight: 420,
    shadowColor: '#140C08',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 8,
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    gap: 12,
  },
  guideLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EDE8E1',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 44, height: 44 },
  avatarLetter: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: '#6B5C50',
  },
  guideName: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
  },
  guideSub: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#8A7B6E',
    marginTop: 1,
  },
  inviteBtn: {
    backgroundColor: colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  inviteText: {
    color: '#fff',
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  tabs: {
    flexDirection: 'row',
    gap: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EDE8E1',
    marginBottom: 18,
  },
  tab: { paddingBottom: 12 },
  tabLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: '#A3988C',
  },
  tabLabelActive: { color: colors.ink },
  tabUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.ink,
  },
  insideGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  insideChip: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F7F4EF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  insideIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  insideIconText: { fontSize: 15 },
  insideLabel: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    color: '#5C4F44',
    textAlign: 'center',
  },
  panel: { paddingBottom: 16 },
  inlineCta: {
    marginTop: 8,
    marginBottom: 8,
    alignSelf: 'stretch',
    backgroundColor: colors.ink,
    paddingVertical: 15,
    borderRadius: 999,
    alignItems: 'center',
  },
  inlineCtaText: {
    color: '#fff',
    fontFamily: fonts.semibold,
    fontSize: 15,
  },
})
