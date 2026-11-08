import React, { useState } from 'react'
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NavigationProp } from '@react-navigation/native'
import { useAuth } from '../context/AuthContext'
import { colors, fonts } from '../theme'
import type { MainTabParamList } from '../navigation/types'

/** Avatar compte — haut droite, anneau blanc + halo soft. */
export function AccountAvatarButton({ size = 36 }: { size?: number }) {
  const { viewUser } = useAuth()
  const navigation = useNavigation<NavigationProp<MainTabParamList>>()
  const [failed, setFailed] = useState(false)

  const avatarUrl =
    (typeof viewUser?.user_metadata?.avatar_url === 'string' &&
      viewUser.user_metadata.avatar_url) ||
    (typeof viewUser?.user_metadata?.picture === 'string' &&
      viewUser.user_metadata.picture) ||
    null

  const letter = (
    viewUser?.user_metadata?.full_name ||
    viewUser?.email ||
    'M'
  )
    .toString()
    .trim()
    .charAt(0)
    .toUpperCase()

  const inner = Math.max(size - 4, 12)

  return (
    <Pressable
      onPress={() => navigation.navigate('Profile')}
      accessibilityRole="button"
      accessibilityLabel="Mon compte"
      hitSlop={8}
      style={({ pressed }) => [
        styles.halo,
        {
          width: size + 6,
          height: size + 6,
          borderRadius: (size + 6) / 2,
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.95 : 1 }],
        },
      ]}
    >
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        {avatarUrl && !failed ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{
              width: inner,
              height: inner,
              borderRadius: inner / 2,
            }}
            onError={() => setFailed(true)}
          />
        ) : (
          <View
            style={[
              styles.fallback,
              {
                width: inner,
                height: inner,
                borderRadius: inner / 2,
              },
            ]}
          >
            <Text style={[styles.letter, { fontSize: size * 0.36 }]}>{letter}</Text>
          </View>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  halo: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 107, 53, 0.14)',
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#fff',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOpacity: 0.28,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  letter: {
    fontFamily: fonts.bold,
    color: '#fff',
    includeFontPadding: false,
  },
})
