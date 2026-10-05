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

/** Full price-tag icon for Deals. */
export function DealsTabIcon({ size = 22, color = colors.faint }: IconProps) {
  const w = size * 0.9
  const h = size * 0.62
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: w,
          height: h,
          backgroundColor: color,
          borderTopRightRadius: h * 0.35,
          borderBottomRightRadius: h * 0.35,
          borderTopLeftRadius: h * 0.18,
          borderBottomLeftRadius: h * 0.18,
          transform: [{ rotate: '-20deg' }],
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingLeft: w * 0.14,
        }}
      >
        <View
          style={{
            width: h * 0.28,
            height: h * 0.28,
            borderRadius: h,
            backgroundColor: colors.white,
          }}
        />
      </View>
    </View>
  )
}

/** Simple filled calendar for Planner. */
export function PlannerTabIcon({ size = 22, color = colors.faint }: IconProps) {
  const w = size * 0.86
  const h = size * 0.78
  const r = size * 0.12
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: w,
          height: h,
          borderRadius: r,
          backgroundColor: color,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: h * 0.22,
            backgroundColor: 'rgba(255,255,255,0.35)',
          }}
        />
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            flexWrap: 'wrap',
            padding: w * 0.12,
            gap: w * 0.08,
            alignContent: 'center',
            justifyContent: 'center',
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                width: w * 0.18,
                height: w * 0.18,
                borderRadius: 2,
                backgroundColor: colors.white,
                opacity: 0.9,
              }}
            />
          ))}
        </View>
      </View>
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
    case 'Deals':
      return <DealsTabIcon size={size} color={color} focused={focused} />
    case 'Planner':
      return <PlannerTabIcon size={size} color={color} focused={focused} />
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
