import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ScreenBackground } from '../components/ScreenBackground'
import { colors, fonts, radius, shadow, spacing } from '../theme'
import type { RootStackParamList } from '../navigation/types'

export function NotFoundScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation()
  const route = useRoute<RouteProp<RootStackParamList, 'NotFound'>>()
  const hint = route.params?.path

  const goHome = () => {
    const root = navigation.getParent() ?? navigation
    root.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [
          {
            name: 'Main',
            state: {
              index: 0,
              routes: [{ name: 'Search' }],
            },
          },
        ],
      }),
    )
  }

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack()
    else goHome()
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <ScreenBackground />
      <View style={styles.inner}>
        <Text style={styles.kicker}>FlightWatcher</Text>
        <Text style={styles.code}>404</Text>
        <Text style={styles.title}>Page introuvable</Text>
        <Text style={styles.body}>
          Ce lien ne mène nulle part — peut‑être un séjour déjà parti, ou une URL un peu perdue.
        </Text>
        {hint ? (
          <View style={[styles.pathChip, shadow.soft]}>
            <Text style={styles.pathLabel}>Chemin</Text>
            <Text style={styles.pathValue} numberOfLines={2}>
              {hint}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={goHome}
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.92 }]}
          accessibilityRole="button"
          accessibilityLabel="Retour aux vols"
        >
          <Text style={styles.primaryBtnText}>Retour aux vols</Text>
        </Pressable>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Page précédente"
        >
          <Text style={styles.secondaryBtnText}>Page précédente</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
    paddingHorizontal: 24,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.primary,
    marginBottom: 10,
  },
  code: {
    fontFamily: fonts.extrabold,
    fontSize: 72,
    letterSpacing: -3,
    lineHeight: 78,
    color: colors.primary,
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    letterSpacing: -0.6,
    color: colors.ink,
    marginBottom: 10,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
    marginBottom: spacing.xl,
  },
  pathChip: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: spacing.xl,
  },
  pathLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.faint,
    marginBottom: 4,
  },
  pathValue: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
  },
  secondaryBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.primaryDeep,
  },
})
