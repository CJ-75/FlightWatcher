import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { translate } from '@flightwatcher/shared'
import { useAuth } from '../context/AuthContext'
import { apiBase } from '../lib/client'
import { Button } from '../components/ui/Button'
import { colors, fonts, radius, shadow, spacing, type } from '../theme'

export function ProfileScreen() {
  const { user, signOut } = useAuth()
  const insets = useSafeAreaInsets()
  const initial = (user?.email?.[0] || 'G').toUpperCase()

  return (
    <View
      style={[
        styles.screen,
        { paddingBottom: insets.bottom + 100, paddingHorizontal: spacing.xl },
      ]}
    >
      <Text style={styles.title}>{translate('fr', 'profile.title')}</Text>

      <View style={[styles.card, shadow.soft]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.email}>{user?.email || 'Mode invité'}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {apiBase.replace(/^https?:\/\//, '')}
        </Text>
      </View>

      <Button
        variant="secondary"
        label={translate('fr', 'auth.signOut')}
        onPress={() => void signOut()}
        style={{ marginTop: spacing.xxl }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas, paddingTop: spacing.sm },
  title: { ...type.title, marginBottom: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  avatarText: {
    color: colors.white,
    fontSize: 32,
    fontFamily: fonts.extrabold,
  },
  email: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.ink,
    textAlign: 'center',
  },
  meta: {
    marginTop: 8,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.faint,
  },
})
