/**
 * Shared logged-out / guest preview landing — conversion-oriented shell.
 */
import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { ScreenBackground } from './ScreenBackground'
import { GoogleGIcon } from './GoogleGIcon'
import { colors, fonts, shadow } from '../theme'

export type GuestAuthStep = { title: string; detail: string }

type Props = {
  insetsTop: number
  insetsBottom: number
  kicker: string
  title: string
  lead: string
  steps: GuestAuthStep[]
  ctaLabel: string
  hint: string
  loginLoading?: boolean
  onLogin: () => void
  accent?: 'primary' | 'accent'
  orbStyle?: 'warm' | 'rose'
  preview?: React.ReactNode
  footer?: React.ReactNode
  contentStyle?: StyleProp<ViewStyle>
}

export function GuestAuthLanding({
  insetsTop,
  insetsBottom,
  kicker,
  title,
  lead,
  steps,
  ctaLabel,
  hint,
  loginLoading = false,
  onLogin,
  accent = 'primary',
  orbStyle = 'warm',
  preview,
  footer,
  contentStyle,
}: Props) {
  const accentColor = accent === 'accent' ? colors.accent : colors.primary

  return (
    <View style={[styles.root, { paddingTop: insetsTop, paddingBottom: insetsBottom + 24 }]}>
      <ScreenBackground />
      <View
        style={[
          styles.orbA,
          orbStyle === 'rose'
            ? { backgroundColor: 'rgba(255,61,107,0.12)' }
            : { backgroundColor: 'rgba(255,107,53,0.14)' },
        ]}
      />
      <View
        style={[
          styles.orbB,
          orbStyle === 'rose'
            ? { backgroundColor: 'rgba(255,107,53,0.14)' }
            : { backgroundColor: 'rgba(255,176,136,0.22)' },
        ]}
      />
      <ScrollView
        contentContainerStyle={[styles.content, contentStyle]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.kicker, { color: accentColor }]}>{kicker}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.lead}>{lead}</Text>

        {preview ? <View style={styles.previewWrap}>{preview}</View> : null}

        <View style={styles.steps}>
          {steps.map((step, i) => (
            <View key={`${step.title}-${i}`} style={[styles.stepCard, shadow.soft]}>
              <View style={[styles.stepNum, { backgroundColor: accentColor }]}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDetail}>{step.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable
          onPress={onLogin}
          disabled={loginLoading}
          style={({ pressed }) => [
            styles.googleBtn,
            pressed && { opacity: 0.92, transform: [{ scale: 0.985 }] },
          ]}
        >
          {loginLoading ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <>
              <GoogleGIcon size={22} />
              <Text style={styles.googleLabel}>{ctaLabel}</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.hint}>{hint}</Text>
        {footer}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  orbA: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  orbB: {
    position: 'absolute',
    bottom: 80,
    left: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  kicker: {
    fontFamily: fonts.extrabold,
    fontSize: 11,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.7,
    color: colors.ink,
    textAlign: 'center',
    includeFontPadding: false,
  },
  lead: {
    marginTop: 10,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
    includeFontPadding: false,
    paddingHorizontal: 4,
  },
  previewWrap: {
    marginTop: 22,
    alignSelf: 'stretch',
  },
  steps: { alignSelf: 'stretch', marginTop: 18, gap: 8 },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontFamily: fonts.extrabold,
    fontSize: 13,
    color: colors.white,
  },
  stepTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
  stepDetail: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  googleBtn: {
    marginTop: 22,
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  googleLabel: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  hint: {
    marginTop: 12,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
})
