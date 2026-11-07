import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { CommonActions, useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { translate } from '@flightwatcher/shared'
import { useAuth } from '../context/AuthContext'
import { DEV_INVITE_TOKEN } from '../dev/guestPreview'
import { apiBase } from '../lib/client'
import { GuestAuthLanding } from '../components/GuestAuthLanding'
import { ScreenBackground } from '../components/ScreenBackground'
import { colors, fonts, radius, shadow, spacing, type } from '../theme'

type MenuRowProps = {
  title: string
  subtitle?: string
  tone?: 'default' | 'warm' | 'rose'
  onPress: () => void
  glyph: string
}

function MenuRow({ title, subtitle, tone = 'default', onPress, glyph }: MenuRowProps) {
  const iconBg =
    tone === 'warm'
      ? colors.primarySoft
      : tone === 'rose'
        ? '#FFE8EE'
        : colors.canvas
  const iconColor =
    tone === 'warm'
      ? colors.primary
      : tone === 'rose'
        ? colors.accent
        : colors.inkSoft

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] },
      ]}
    >
      <View style={[styles.menuIcon, { backgroundColor: iconBg }]}>
        <Text style={[styles.menuGlyph, { color: iconColor }]}>{glyph}</Text>
      </View>
      <View style={styles.menuCopy}>
        <Text style={styles.menuTitle}>{title}</Text>
        {subtitle ? <Text style={styles.menuSubtitle}>{subtitle}</Text> : null}
      </View>
      <Text style={styles.menuChevron}>›</Text>
    </Pressable>
  )
}

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
  const navigation = useNavigation()
  const [loginLoading, setLoginLoading] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [avatarFailed, setAvatarFailed] = useState(false)

  const onSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  const openSecurity = () => {
    navigation.dispatch(CommonActions.navigate({ name: 'Security' }))
  }

  const openBookings = () => {
    const root = navigation.getParent() ?? navigation
    root.dispatch(CommonActions.navigate({ name: 'Bookings' }))
  }

  const openFavorites = () => {
    navigation.navigate('Favorites' as never)
  }

  const openInviteOnboardingPreview = () => {
    // Ouverture manuelle uniquement — pas de pending invite au boot.
    const root = navigation.getParent() ?? navigation
    root.dispatch(
      CommonActions.navigate({
        name: 'PlannerInvite',
        params: { token: DEV_INVITE_TOKEN },
      }),
    )
  }

  if (!viewUser) {
    const t = (key: string) => translate('fr', key as never)
    return (
      <GuestAuthLanding
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        kicker="COMPTE"
        title={t('profile.guest.title')}
        lead={t('profile.guest.lead')}
        steps={[
          { title: t('profile.guest.step1'), detail: t('profile.guest.step1.detail') },
          { title: t('profile.guest.step2'), detail: t('profile.guest.step2.detail') },
          { title: t('profile.guest.step3'), detail: t('profile.guest.step3.detail') },
        ]}
        ctaLabel={t('profile.guest.cta')}
        hint={t('profile.guest.hint')}
        loginLoading={loginLoading}
        onLogin={() => {
          void (async () => {
            setLoginLoading(true)
            setAppearLoggedOut(false)
            const { error } = await signInWithGoogle()
            if (error && __DEV__) console.warn('[auth] signIn', error.message)
            setLoginLoading(false)
          })()
        }}
        footer={
          <View style={styles.guestFooter}>
            <Pressable
              onPress={openBookings}
              style={({ pressed }) => [styles.guestLink, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.guestLinkLabel}>{t('profile.guest.bookings')}</Text>
              <Text style={styles.guestLinkChevron}>›</Text>
            </Pressable>
            <Pressable
              onPress={openFavorites}
              style={({ pressed }) => [styles.guestLink, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.guestLinkLabel}>{t('profile.guest.favorites')}</Text>
              <Text style={styles.guestLinkChevron}>›</Text>
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
            ) : null}
          </View>
        }
      />
    )
  }

  const displayName =
    viewUser.user_metadata?.full_name || viewUser.email?.split('@')[0] || 'Compte'
  const initial = (displayName[0] || viewUser.email?.[0] || 'U').toUpperCase()
  const avatarUrl =
    typeof viewUser.user_metadata?.avatar_url === 'string'
      ? viewUser.user_metadata.avatar_url
      : null

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + 110,
          paddingHorizontal: spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.kicker}>COMPTE</Text>
        <Text style={styles.title}>{translate('fr', 'profile.title')}</Text>
        <Text style={styles.subtitle}>
          Réservations, favoris et réglages — tout ton voyage au même endroit.
        </Text>

        <View style={[styles.identity, shadow.soft]}>
          <View style={styles.identityRow}>
            {avatarUrl && !avatarFailed ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatarImg}
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <LinearGradient
                colors={['#FF6B35', '#E85A28']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>{initial}</Text>
              </LinearGradient>
            )}
            <View style={styles.identityCopy}>
              <Text style={styles.name} numberOfLines={1}>
                {displayName}
              </Text>
              {viewUser.email ? (
                <Text style={styles.email} numberOfLines={1}>
                  {viewUser.email}
                </Text>
              ) : null}
              {isGuest ? (
                <View style={styles.guestPill}>
                  <Text style={styles.guestPillText}>Aperçu Expo</Text>
                </View>
              ) : (
                <View style={styles.okPill}>
                  <Text style={styles.okPillText}>Connecté</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Mon voyage</Text>
        <View style={[styles.menuGroup, shadow.soft]}>
          <MenuRow
            glyph="♥"
            tone="rose"
            title="Favoris"
            subtitle="Séjours, vols et activités likés"
            onPress={openFavorites}
          />
          <View style={styles.menuDivider} />
          <MenuRow
            glyph="✈"
            tone="warm"
            title="Mes réservations"
            subtitle="Confirmations vol & hôtel"
            onPress={openBookings}
          />
        </View>

        {!isGuest ? (
          <>
            <Text style={styles.sectionLabel}>Compte</Text>
            <View style={[styles.menuGroup, shadow.soft]}>
              <MenuRow
                glyph="🔒"
                tone="warm"
                title={translate('fr', 'auth.security.title')}
                subtitle="Mot de passe et sécurité"
                onPress={openSecurity}
              />
            </View>
          </>
        ) : null}

        {__DEV__ ? (
          <>
            <Text style={styles.sectionLabel}>Développement</Text>
            <View style={[styles.menuGroup, shadow.soft]}>
              <View style={styles.devInfo}>
                <Text style={styles.infoLabel}>API</Text>
                <Text style={styles.infoValue} numberOfLines={1}>
                  {apiBase.replace(/^https?:\/\//, '')}
                </Text>
              </View>
              {isGuest ? (
                <>
                  <View style={styles.menuDivider} />
                  <View style={styles.devInfo}>
                    <Text style={styles.infoLabel}>Aperçu Expo</Text>
                    <Text style={styles.infoValue}>
                      Planner et Favoris en local, sans login Google
                    </Text>
                  </View>
                </>
              ) : null}
            </View>
            <Pressable
              onPress={() => setAppearLoggedOut(true)}
              style={({ pressed }) => [
                styles.devPreviewBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.devPreviewTitle}>Voir comme non connecté</Text>
              <Text style={styles.devPreviewSub}>
                Affiche les landings Compte / Favoris / Planner
              </Text>
            </Pressable>
            <Pressable
              onPress={openInviteOnboardingPreview}
              style={({ pressed }) => [
                styles.devPreviewBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.devPreviewTitle}>
                Tester onboarding invitation
              </Text>
              <Text style={styles.devPreviewSub}>
                Sans Google — mode test Expo, ouvre le voyage local
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const root = navigation.getParent() ?? navigation
                root.dispatch(
                  CommonActions.navigate({
                    name: 'NotFound',
                  }),
                )
              }}
              style={({ pressed }) => [
                styles.devPreviewBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.devPreviewTitle}>Voir la page 404</Text>
              <Text style={styles.devPreviewSub}>
                Aperçu de l’écran page introuvable
              </Text>
            </Pressable>
          </>
        ) : null}

        <Pressable
          onPress={() => void onSignOut()}
          disabled={signingOut}
          style={({ pressed }) => [
            styles.signOutBtn,
            pressed && { opacity: 0.9 },
            signingOut && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.signOutText}>
            {signingOut
              ? translate('fr', 'auth.signOutProgress')
              : translate('fr', 'auth.signOut')}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.primary,
    marginBottom: 2,
  },
  title: { ...type.title, marginBottom: 6 },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginBottom: spacing.xl,
  },
  identity: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
  },
  avatarText: {
    color: colors.white,
    fontSize: 26,
    fontFamily: fonts.extrabold,
  },
  identityCopy: { flex: 1, minWidth: 0, gap: 3 },
  name: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  email: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
  guestPill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: colors.ink,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  guestPillText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 0.4,
    color: colors.white,
    textTransform: 'uppercase',
  },
  okPill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: colors.successSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  okPillText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 0.4,
    color: colors.success,
    textTransform: 'uppercase',
  },
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.faint,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  menuGroup: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuGlyph: {
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  menuCopy: { flex: 1, minWidth: 0 },
  menuTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  menuSubtitle: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
  },
  menuChevron: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.faint,
    lineHeight: 24,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginLeft: 66,
  },
  guestFooter: {
    marginTop: 16,
    alignSelf: 'stretch',
    gap: 10,
  },
  guestLink: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  guestLinkLabel: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  guestLinkChevron: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.muted,
    lineHeight: 24,
  },
  devBtn: {
    marginTop: 6,
    paddingVertical: 10,
  },
  devBtnLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  devInfo: {
    paddingHorizontal: 14,
    paddingVertical: 14,
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
  devPreviewBtn: {
    marginBottom: spacing.xl,
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
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
  signOutBtn: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  signOutText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.inkSoft,
  },
})
