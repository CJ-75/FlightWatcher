import React, { useState, type ReactNode } from 'react'
import {
  View,
  Text,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Share,
  type LayoutChangeEvent,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { HeartIcon } from '../HeartIcon'
import { ShareIcon } from '../UiIcons'
import { colors, fonts } from '../../theme'

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
  /** Optional secondary action (e.g. Modifier) — replaces left label when set. */
  stickySecondary?: string
  onStickySecondary?: () => void
  stickySecondaryDisabled?: boolean
  stickyCtaDisabled?: boolean
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
  stickySecondary,
  onStickySecondary,
  stickySecondaryDisabled,
  stickyCtaDisabled,
}: Props) {
  const insets = useSafeAreaInsets()
  const chips = (metaChips || []).filter(Boolean)
  const [stickyH, setStickyH] = useState(72)

  const onStickyLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height
    if (h > 0) setStickyH(h)
  }

  return (
    <View style={styles.root}>
      {/* Fixed header actions — stay while content scrolls */}
      <View
        pointerEvents="box-none"
        style={[styles.fixedHeader, { paddingTop: insets.top + 12 }]}
      >
        <Pressable
          onPress={onBack}
          style={styles.actionBtn}
          hitSlop={8}
          accessibilityLabel="Retour"
        >
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {shareUrl ? (
          <Pressable
            onPress={() =>
              void Share.share({ message: shareUrl, url: shareUrl })
            }
            style={styles.actionBtn}
            hitSlop={8}
            accessibilityLabel="Partager"
          >
            <ShareIcon size={18} color={colors.inkSoft} />
          </Pressable>
        ) : null}
        {onLike ? (
          <Pressable
            onPress={onLike}
            style={[styles.actionBtn, { marginLeft: 8 }]}
            hitSlop={8}
            accessibilityLabel={liked ? 'Retirer des favoris' : 'Favori'}
          >
            <HeartIcon
              size={20}
              filled={!!liked}
              color={liked ? colors.primary : colors.inkSoft}
            />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
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
          {/* Spacer so title doesn’t sit under fixed buttons */}
          <View style={{ height: 56 }} />
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
          {stickySecondary && onStickySecondary ? (
            <Pressable
              onPress={onStickySecondary}
              disabled={stickySecondaryDisabled}
              style={({ pressed }) => [
                styles.stickySecondary,
                stickySecondaryDisabled && { opacity: 0.45 },
                pressed && !stickySecondaryDisabled && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.stickySecondaryText}>{stickySecondary}</Text>
            </Pressable>
          ) : (
            <View style={styles.stickyLeft}>
              <Text style={styles.stickyLeftText} numberOfLines={2}>
                {stickyLeft}
              </Text>
            </View>
          )}
          <Pressable
            style={[
              styles.stickyCta,
              stickySecondary ? styles.stickyCtaFlex : null,
              stickyCtaDisabled && { opacity: 0.55 },
            ]}
            onPress={onStickyCta}
            disabled={stickyCtaDisabled}
          >
            <Text style={styles.stickyCtaText}>{stickyCta}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F4EF' },
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
  hero: {
    minHeight: 460,
    justifyContent: 'flex-end',
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
  stickySecondary: {
    flex: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EDE8E1',
    backgroundColor: '#fff',
  },
  stickySecondaryText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: '#1A120E',
  },
  stickyCta: {
    backgroundColor: '#1A120E',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  stickyCtaFlex: {
    flex: 1,
    alignItems: 'center',
  },
  stickyCtaText: {
    color: '#fff',
    fontFamily: fonts.bold,
    fontSize: 14,
  },
})
