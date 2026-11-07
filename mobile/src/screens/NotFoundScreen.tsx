import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { CommonActions, useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ScreenBackground } from '../components/ScreenBackground'
import { colors, fonts, radius, spacing } from '../theme'

export function NotFoundScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation()

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
          Ce lien ne mène nulle part. Peut‑être un séjour déjà parti, ou une URL un peu perdue.
        </Text>

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
