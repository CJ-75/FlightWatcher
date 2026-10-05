import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { translate } from '@flightwatcher/shared'
import { useAuth } from '../context/AuthContext'
import { apiBase } from '../lib/client'
import { Button } from '../components/ui/Button'
import { colors, fonts, shadow, spacing, type } from '../theme'

export function ProfileScreen() {
  const {
    viewUser,
    signOut,
    signInWithGoogle,
    isGuest,
    appearLoggedOut,
    setAppearLoggedOut,
  } = useAuth()
  const insets = useSafeAreaInsets()
  const [loginLoading, setLoginLoading] = useState(false)

  // Logged-out landing (real guest landings) for preview / no user
  if (!viewUser) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
        <LinearGradient
          colors={['#FFE8DC', '#FFF9F5']}
          locations={[0, 0.45]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.guestWrap}>
          <View style={styles.guestIcon}>
            <View style={styles.guestHead} />
            <View style={styles.guestShoulders} />
          </View>
          <Text style={styles.guestKicker}>COMPTE</Text>
          <Text style={styles.guestTitle}>Connecte-toi</Text>
          <Text style={styles.guestBody}>
            Pour synchroniser favoris, voyages et recherches sur tous tes appareils.
          </Text>

          <Pressable
            onPress={async () => {
              setLoginLoading(true)
              setAppearLoggedOut(false)
              const { error } = await signInWithGoogle()
              if (error && __DEV__) console.warn('[auth] signIn', error.message)
              setLoginLoading(false)
            }}
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
                <View style={styles.gMark}>
                  <Text style={styles.gLetter}>G</Text>
                </View>
                <Text style={styles.googleLabel}>Continuer avec Google</Text>
              </>
            )}
          </Pressable>

          {__DEV__ && appearLoggedOut ? (
            <Pressable
              onPress={() => setAppearLoggedOut(false)}
              style={({ pressed }) => [styles.devBtn, pressed && { opacity: 0.75 }]}
              hitSlop={8}
            >
              <Text style={styles.devBtnLabel}>Quitter l’aperçu non connecté</Text>
            </Pressable>
          ) : __DEV__ && isGuest ? (
            <Pressable
              onPress={() => void signOut()}
              style={({ pressed }) => [styles.devBtn, pressed && { opacity: 0.75 }]}
              hitSlop={8}
            >
              <Text style={styles.devBtnLabel}>Quitter le mode invité</Text>
            </Pressable>
          ) : (
            <Text style={styles.guestHint}>Gratuit · connexion sécurisée</Text>
          )}
        </View>
      </View>
    )
  }

  const displayName =
    viewUser!.user_metadata?.full_name || viewUser!.email?.split('@')[0] || 'Compte'
  const initial = (displayName[0] || viewUser!.email?.[0] || 'U').toUpperCase()

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#FFE8DC', '#FFF9F5']}
        locations={[0, 0.4]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{translate('fr', 'profile.title')}</Text>

        <View style={[styles.card, shadow.soft]}>
          <LinearGradient
            colors={['#FF6B35', '#E85A28']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{initial}</Text>
          </LinearGradient>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.email}>{viewUser!.email}</Text>
        </View>

        <View style={[styles.infoCard, shadow.soft]}>
          <Text style={styles.infoLabel}>API</Text>
          <Text style={styles.infoValue} numberOfLines={1}>
            {apiBase.replace(/^https?:\/\//, '')}
          </Text>
        </View>

        {__DEV__ && isGuest ? (
          <View style={[styles.infoCard, shadow.soft, { marginTop: spacing.md }]}>
            <Text style={styles.infoLabel}>Aperçu Expo</Text>
            <Text style={styles.infoValue}>Planner et Favoris en local, sans login Google</Text>
          </View>
        ) : null}

        {__DEV__ ? (
          <Pressable
            onPress={() => setAppearLoggedOut(true)}
            style={({ pressed }) => [
              styles.devPreviewBtn,
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.devPreviewTitle}>Voir comme non connecté</Text>
            <Text style={styles.devPreviewSub}>
              Affiche les landings Compte / Favoris / Planner (dev)
            </Text>
          </Pressable>
        ) : null}

        <Button
          variant="secondary"
          label={translate('fr', 'auth.signOut')}
          onPress={() => void signOut()}
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  title: { ...type.title, marginBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.xxl,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  avatarText: {
    color: colors.white,
    fontSize: 32,
    fontFamily: fonts.extrabold,
  },
  name: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.ink,
    textAlign: 'center',
  },
  email: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  infoCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  infoLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.faint,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  infoValue: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.inkSoft,
  },
  guestWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  guestIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
    marginBottom: 20,
    overflow: 'hidden',
  },
  guestHead: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.white,
    marginBottom: 4,
  },
  guestShoulders: {
    width: 32,
    height: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.white,
  },
  guestKicker: {
    fontFamily: fonts.extrabold,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.primary,
    marginBottom: 8,
  },
  guestTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.7,
    color: colors.ink,
    textAlign: 'center',
    includeFontPadding: false,
  },
  guestBody: {
    marginTop: 10,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
    includeFontPadding: false,
  },
  googleBtn: {
    marginTop: 28,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    paddingHorizontal: 18,
  },
  gMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gLetter: {
    fontFamily: fonts.extrabold,
    color: '#4285F4',
    fontSize: 14,
    lineHeight: 18,
    includeFontPadding: false,
  },
  googleLabel: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
    includeFontPadding: false,
  },
  guestHint: {
    marginTop: 14,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.faint,
    textAlign: 'center',
  },
  devBtn: {
    marginTop: 16,
    paddingVertical: 10,
  },
  devBtnLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  devPreviewBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.ink,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  devPreviewTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.white,
    textAlign: 'center',
  },
  devPreviewSub: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
  },
})
