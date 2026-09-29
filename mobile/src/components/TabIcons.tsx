import React from 'react'
import { View } from 'react-native'
import { colors } from '../theme'
import { HeartIcon } from './HeartIcon'

type IconProps = {
  size?: number
  color?: string
  focused?: boolean
}

/** Magnifying glass — stroke style via ring + handle. */
export function SearchTabIcon({ size = 22, color = colors.faint }: IconProps) {
  const stroke = Math.max(2, size * 0.11)
  const lens = size * 0.62
  return (
    <View style={{ width: size, height: size, justifyContent: 'center' }}>
      <View
        style={{
          width: lens,
          height: lens,
          borderRadius: lens / 2,
          borderWidth: stroke,
          borderColor: color,
          marginLeft: size * 0.05,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size * 0.32,
          height: stroke + 0.5,
          borderRadius: stroke,
          backgroundColor: color,
          right: size * 0.02,
          bottom: size * 0.14,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  )
}

export function FavoritesTabIcon({ size = 20, color = colors.faint }: IconProps) {
  return <HeartIcon size={size} filled color={color} />
}

/** User silhouette — head + shoulders. */
export function ProfileTabIcon({ size = 22, color = colors.faint }: IconProps) {
  const head = size * 0.38
  const bodyW = size * 0.72
  const bodyH = size * 0.38
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View
        style={{
          width: head,
          height: head,
          borderRadius: head / 2,
          backgroundColor: color,
          marginBottom: size * 0.08,
        }}
      />
      <View
        style={{
          width: bodyW,
          height: bodyH,
          borderTopLeftRadius: bodyW / 2,
          borderTopRightRadius: bodyW / 2,
          backgroundColor: color,
        }}
      />
    </View>
  )
}

export function TabBarIcon({
  name,
  focused,
  size = 22,
}: {
  name: string
  focused: boolean
  size?: number
}) {
  const color = focused ? colors.primary : colors.muted
  switch (name) {
    case 'Search':
      return <SearchTabIcon size={size} color={color} focused={focused} />
    case 'Favorites':
      return <FavoritesTabIcon size={size - 2} color={color} focused={focused} />
    case 'Profile':
      return <ProfileTabIcon size={size} color={color} focused={focused} />
    default:
      return (
        <View
          style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }}
        />
      )
  }
}
