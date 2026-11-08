import React, { useState, type ReactNode } from 'react'
import {
  View,
  Text,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Share,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type LayoutChangeEvent,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fonts } from '../../theme'

type Props = {
  heroUrl: string
  title: string
  metaChips?: string[]
  phaseLabel?: string
  /** Dated parcours — e.g. « Mercredi 11 novembre » (replaces budget under title) */
  dateLabel?: string | null
  onBack: () => void
  shareUrl?: string
  onLike?: () => void
  liked?: boolean
  children: ReactNode
  stickyLeft?: string
  stickyCta?: string
  onStickyCta?: () => void
}

function GlassIconShare() {
  return (
    <View style={iconStyles.shareBox}>
      <View style={iconStyles.shareArrow} />
      <View style={iconStyles.shareBase} />
    </View>
  )
}

function GlassIconHeart({ filled }: { filled?: boolean }) {
  return (
    <View
      style={[
        iconStyles.heart,
        filled && { backgroundColor: '#FF3D6B', borderColor: '#FF3D6B' },
      ]}
    />
  )
}

export function ItineraryDetailChrome({
  heroUrl,
  title,
  metaChips,
  phaseLabel = 'Parcours',
  dateLabel,
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
  const [scrolled, setScrolled] = useState(false)
  const [stickyH, setStickyH] = useState(72)
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y
    setScrolled(y > 220)
  }

  const onStickyLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height
    if (h > 0) setStickyH(h)
  }

  return (
    <View style={styles.root}>
      {scrolled ? (
        <View
          style={[
            styles.scrollHeader,
            { paddingTop: insets.top + 6, height: insets.top + 52 },
          ]}
        >
          <Pressable onPress={onBack} style={styles.scrollBack} hitSlop={8}>
            <Text style={styles.scrollBackText}>‹</Text>
            <Text style={styles.scrollBackLabel}>Parcours</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingBottom: stickyCta ? stickyH + 16 : 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ImageBackground
          source={{ uri: heroUrl }}
          style={[styles.hero, { paddingTop: insets.top }]}
        >
          <LinearGradient
            colors={['rgba(0,0,0,0.28)', 'transparent', 'rgba(0,0,0,0.78)']}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          {!scrolled ? (
            <View
              style={[
                styles.topBar,
                { paddingTop: insets.top + 12, justifyContent: 'flex-end' },
              ]}
            >
              {shareUrl ? (
                <Pressable
                  onPress={() =>
                    void Share.share({ message: shareUrl, url: shareUrl })
                  }
                  style={styles.glassBtn}
                  hitSlop={8}
                  accessibilityLabel="Partager"
                >
                  <GlassIconShare />
                </Pressable>
              ) : null}
              {onLike ? (
                <Pressable
                  onPress={onLike}
                  style={[styles.glassBtn, { marginLeft: 8 }]}
                  hitSlop={8}
                  accessibilityLabel={liked ? 'Retirer des favoris' : 'Favori'}
                >
                  <GlassIconHeart filled={liked} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <View style={styles.heroCopy}>
            <View style={styles.phase}>
              <Text style={styles.phaseText}>{phaseLabel}</Text>
            </View>
            <Text style={styles.title}>{title}</Text>
            {chips.length ? (
              <Text style={styles.chips}>{chips.join(' · ')}</Text>
            ) : null}
            {dateLabel ? (
              <Text style={styles.dateLabel}>{dateLabel}</Text>
            ) : null}
          </View>
        </ImageBackground>

        <View style={styles.sheet}>{children}</View>
      </ScrollView>

      {stickyCta ? (
        <View
          onLayout={onStickyLayout}
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

const iconStyles = StyleSheet.create({
  shareBox: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  shareArrow: {
    width: 8,
    height: 8,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: '#fff',
    transform: [{ rotate: '-45deg' }],
    marginBottom: -2,
  },
  shareBase: {
    width: 14,
    height: 10,
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: '#fff',
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  heart: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'transparent',
    transform: [{ rotate: '-45deg' }],
  },
})

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F4EF' },
  scrollHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EDE8E1',
    paddingHorizontal: 12,
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  scrollBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  scrollBackText: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 30,
    color: '#1A120E',
  },
  scrollBackLabel: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: '#1A120E',
  },
  hero: {
    minHeight: 460,
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
  glassBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  heroCopy: { paddingHorizontal: 20, paddingBottom: 40, gap: 8 },
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
    color: 'rgba(255,255,255,0.95)',
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.extrabold,
    fontStyle: 'normal',
    fontSize: 40,
    lineHeight: 44,
    color: '#fff',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  chips: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  dateLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: 'rgba(255,255,255,0.95)',
  },
  sheet: {
    marginTop: -28,
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    minHeight: 320,
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
    backgroundColor: '#FFFFFF',
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
