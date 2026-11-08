import React, { useEffect, useState, type ReactNode } from 'react'
import {
  View,
  Text,
  ImageBackground,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Path } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  TRIP_DETAIL_TABS,
  trackTripTabViewed,
  type TripDetailTabId,
} from '@flightwatcher/shared'
import { getApi } from '../../lib/client'
import { colors, fonts } from '../../theme'

type Props = {
  tripId: string
  heroUrl: string
  city: string
  metaChips?: string[]
  phaseLabel: string
  onBack: () => void
  /** e.g. « Retour au parcours » when opened from Make trip */
  backAccessibilityLabel?: string
  onShare?: () => void
  onRename?: () => void
  titleEditing?: boolean
  titleDraft?: string
  onTitleDraftChange?: (value: string) => void
  onTitleSave?: () => void
  onTitleCancel?: () => void
  titleSaving?: boolean
  guideAvatarUrl?: string | null
  guideName?: string | null
  guideSubtitle?: string | null
  apercu: ReactNode
  programme: ReactNode
  voyageurs: ReactNode
  activeTab?: TripDetailTabId
  onTabChange?: (tab: TripDetailTabId) => void
  /** Lock vertical scroll while hotel gallery is swiped */
  scrollLocked?: boolean
}

function PencilIcon({ color = '#fff', size = 13 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 20h9"
        stroke={color}
        strokeWidth="1.85"
        strokeLinecap="round"
      />
      <Path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"
        stroke={color}
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function TripDetailPathChrome({
  tripId,
  heroUrl,
  city,
  metaChips,
  phaseLabel,
  onBack,
  backAccessibilityLabel = 'Retour',
  onShare,
  onRename,
  titleEditing,
  titleDraft,
  onTitleDraftChange,
  onTitleSave,
  onTitleCancel,
  titleSaving,
  guideAvatarUrl,
  guideName,
  guideSubtitle,
  apercu,
  programme,
  voyageurs,
  activeTab,
  onTabChange,
  scrollLocked = false,
}: Props) {
  const insets = useSafeAreaInsets()
  const [tabInternal, setTabInternal] = useState<TripDetailTabId>('apercu')
  const tab = activeTab ?? tabInternal
  const setTab = (next: TripDetailTabId) => {
    onTabChange?.(next)
    if (activeTab == null) setTabInternal(next)
  }

  useEffect(() => {
    void trackTripTabViewed((body) => getApi().trackActivityEvent(body), {
      tripId,
      variant: 'v2',
      tab,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    })
  }, [tab, tripId])

  const body =
    tab === 'programme'
      ? programme
      : tab === 'voyageurs'
        ? voyageurs
        : apercu
  const chips = (metaChips || []).filter(Boolean)

  const heroCopy = (
    <View style={styles.heroCopy}>
      <View style={styles.phasePill}>
        <Text style={styles.phaseText}>{phaseLabel}</Text>
      </View>
      {titleEditing ? (
        <View style={styles.renameRow}>
          <TextInput
            value={titleDraft ?? ''}
            onChangeText={onTitleDraftChange}
            autoFocus
            maxLength={80}
            editable={!titleSaving}
            placeholder="Nom du voyage"
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={styles.renameInput}
            returnKeyType="done"
            onSubmitEditing={onTitleSave}
          />
          <Pressable
            onPress={onTitleSave}
            disabled={titleSaving}
            style={styles.renameOk}
          >
            <Text style={styles.renameOkText}>
              {titleSaving ? '…' : 'OK'}
            </Text>
          </Pressable>
          <Pressable
            onPress={onTitleCancel}
            disabled={titleSaving}
            style={styles.renameCancel}
          >
            <Text style={styles.renameCancelText}>Annuler</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={3}>
            {city}
          </Text>
          {onRename ? (
            <Pressable
              onPress={onRename}
              style={styles.renameBtn}
              accessibilityLabel="Renommer"
            >
              <PencilIcon />
            </Pressable>
          ) : null}
        </View>
      )}
      {chips.length > 0 ? (
        <View style={styles.chipRow}>
          {chips.map((c, i) => (
            <View key={`${c}-${i}`} style={styles.chipItem}>
              {i > 0 ? <Text style={styles.chipDot}> · </Text> : null}
              <Text style={styles.chipText}>{c}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )

  return (
    <View style={styles.root}>
      {/* Same fixed back as Parcours detail — no native stack header */}
      <View
        pointerEvents="box-none"
        style={[styles.fixedHeader, { paddingTop: insets.top + 12 }]}
      >
        <Pressable
          onPress={onBack}
          style={styles.actionBtn}
          hitSlop={8}
          accessibilityLabel={backAccessibilityLabel}
        >
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!scrollLocked}
      >
        <ImageBackground source={{ uri: heroUrl }} style={styles.hero}>
          <LinearGradient
            colors={['rgba(0,0,0,0.4)', 'transparent', 'rgba(0,0,0,0.72)']}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          {/* Spacer so title doesn’t sit under fixed back */}
          <View style={{ height: insets.top + 56 }} />
          {heroCopy}
        </ImageBackground>

        <View style={styles.sheet}>
          {(guideName || guideSubtitle) && (
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

          <View style={styles.tabs}>
            {TRIP_DETAIL_TABS.map((t) => {
              const selected = tab === t.id
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTab(t.id)}
                  style={styles.tab}
                >
                  <Text
                    style={[styles.tabLabel, selected && styles.tabLabelActive]}
                  >
                    {t.label}
                  </Text>
                  {selected ? <View style={styles.tabUnderline} /> : null}
                </Pressable>
              )
            })}
          </View>

          <View style={styles.panel}>{body}</View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFBF8' },
  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  backChevron: {
    fontFamily: fonts.bold,
    fontSize: 30,
    lineHeight: 32,
    color: colors.inkSoft,
    marginTop: -2,
    marginLeft: -1,
  },
  hero: { minHeight: 340, justifyContent: 'space-between' },
  heroCopy: { paddingHorizontal: 20, paddingBottom: 36, gap: 8 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    flexShrink: 1,
    color: '#fff',
    fontFamily: fonts.semibold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
  },
  renameBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    marginTop: 2,
  },
  renameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  renameInput: {
    flexGrow: 1,
    minWidth: 150,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontFamily: fonts.semibold,
    fontSize: 18,
  },
  renameOk: {
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 40,
    justifyContent: 'center',
  },
  renameOkText: {
    color: '#C2410C',
    fontFamily: fonts.semibold,
    fontSize: 13,
  },
  renameCancel: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 40,
    justifyContent: 'center',
  },
  renameCancelText: {
    color: '#fff',
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  chipItem: { flexDirection: 'row', alignItems: 'center' },
  chipDot: {
    color: 'rgba(255,255,255,0.35)',
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  chipText: {
    color: 'rgba(255,255,255,0.78)',
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  phasePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.82)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  phaseText: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sheet: {
    marginTop: -24,
    backgroundColor: '#FFFBF8',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 18,
    minHeight: 420,
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  guideLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0E8E0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 40, height: 40 },
  avatarLetter: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: '#8A6A58',
  },
  guideName: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  guideSub: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: '#8A6A58',
    marginTop: 1,
  },
  inviteBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  inviteText: { color: '#fff', fontFamily: fonts.semibold, fontSize: 12 },
  tabs: {
    flexDirection: 'row',
    gap: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EDE4DC',
    marginBottom: 16,
  },
  tab: { paddingBottom: 10 },
  tabLabel: { fontFamily: fonts.semibold, fontSize: 13, color: '#A89888' },
  tabLabelActive: { color: colors.ink },
  tabUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
  panel: { paddingBottom: 16 },
})
