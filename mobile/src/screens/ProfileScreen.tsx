import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { translate } from '@flightwatcher/shared'
import { useAuth } from '../context/AuthContext'
import { apiBase } from '../lib/client'
import { colors, radius, spacing } from '../theme'

export function ProfileScreen() {
  const { user, signOut } = useAuth()

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{translate('fr', 'profile.title')}</Text>

      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.email?.[0] || '?').toUpperCase()}
          </Text>
        </View>
        <Text style={styles.email}>{user?.email || 'Invité'}</Text>
        <Text style={styles.meta}>API · {apiBase.replace(/^https?:\/\//, '')}</Text>
      </View>

      <Pressable style={styles.button} onPress={() => void signOut()}>
        <Text style={styles.buttonText}>{translate('fr', 'auth.signOut')}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgMuted, padding: spacing.xl },
  title: { fontSize: 24, fontWeight: '900', color: colors.slate900, marginBottom: spacing.xl },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: { color: colors.white, fontSize: 28, fontWeight: '900' },
  email: { fontSize: 16, fontWeight: '700', color: colors.slate900 },
  meta: { marginTop: 6, color: colors.slate400, fontSize: 12 },
  button: {
    marginTop: spacing.xxl,
    backgroundColor: colors.slate900,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  buttonText: { color: colors.white, fontWeight: '800', fontSize: 16 },
})
