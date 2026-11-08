import React, { type ReactNode } from 'react'
import {
  View,
  Text,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Share,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fonts } from '../../theme'

type Props = {
  heroUrl: string
  title: string
  metaChips?: string[]
  phaseLabel?: string
  budgetLabel?: string | null
  onBack: () => void
  shareUrl?: string
  onLike?: () => void
  liked?: boolean
  children: ReactNode
  stickyLeft?: string
  stickyCta?: string
  onStickyCta?: () => void
}

export function ItineraryDetailChrome({
  heroUrl,
  title,
  metaChips,
  phaseLabel = 'Parcours',
  budgetLabel,
  onBack,
  shareUrl,
  onLike,
  liked,
  children,
  stickyLeft,
  stickyCta,
  onStickyCta,
}: Props) {
  const insets = useSafeAreaInsets()
  const chips = (metaChips || []).filter(Boolean)

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: stickyCta ? 120 + insets.bottom : 40 }}
        showsVerticalScrollIndicator={false}
      >
        <ImageBackground source={{ uri: heroUrl }} style={styles.hero}>
          <LinearGradient
            colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,0.75)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={onBack} style={styles.roundBtn} hitSlop={8}>
              <Text style={styles.roundBtnText}>←</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            {shareUrl ? (
              <Pressable
                onPress={() =>
                  void Share.share({ message: shareUrl, url: shareUrl })
                }
                style={styles.roundBtn}
                hitSlop={8}
              >
                <Text style={styles.roundBtnText}>↗</Text>
              </Pressable>
            ) : null}
            {onLike ? (
              <Pressable
                onPress={onLike}
                style={[styles.roundBtn, styles.likeBtn]}
                hitSlop={8}
              >
                <Text style={styles.likeBtnText}>{liked ? '♥' : '♡'}</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.heroCopy}>
            <View style={styles.phase}>
              <Text style={styles.phaseText}>{phaseLabel}</Text>
            </View>
            <Text style={styles.title}>{title}</Text>
            {chips.length ? (
              <Text style={styles.chips}>{chips.join(' · ')}</Text>
            ) : null}
            {budgetLabel ? (
              <Text style={styles.budget}>{budgetLabel}</Text>
            ) : null}
          </View>
        </ImageBackground>

        <View style={styles.sheet}>
          <View style={styles.handle} />
          {children}
        </View>
      </ScrollView>

      {stickyCta ? (
        <View
          style={[
            styles.sticky,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.stickyLeft}>
            <Text style={styles.stickyLeftText} numberOfLines={2}>
              {stickyLeft}
            </Text>
          </View>
          <Pressable style={styles.stickyCta} onPress={onStickyCta}>
            <Text style={styles.stickyCtaText}>{stickyCta}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F4EF' },
  hero: {
    minHeight: 420,
    justifyContent: 'flex-end',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
    zIndex: 2,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  roundBtnText: { color: '#fff', fontSize: 18, fontFamily: fonts.bold },
  likeBtn: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'transparent',
    marginLeft: 8,
  },
  likeBtnText: { fontSize: 16, color: '#1A120E' },
  heroCopy: { paddingHorizontal: 20, paddingBottom: 48, gap: 8 },
  phase: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  phaseText: {
    color: 'rgba(255,255,255,0.92)',
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.regular,
    fontStyle: 'italic',
    fontSize: 40,
    lineHeight: 44,
    color: '#fff',
    letterSpacing: -0.5,
  },
  chips: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.88)',
  },
  budget: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.92)',
  },
  sheet: {
    marginTop: -28,
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    minHeight: 320,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#EDE8E1',
    marginBottom: 16,
  },
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
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EDE8E1',
  },
  stickyLeft: { flex: 1 },
  stickyLeftText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: '#1A120E',
  },
  stickyCta: {
    backgroundColor: '#1A120E',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  stickyCtaText: {
    color: '#fff',
    fontFamily: fonts.bold,
    fontSize: 14,
  },
})
