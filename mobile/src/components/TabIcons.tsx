import React from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
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

/** Explorer / Parcours — boussole losange (L7 double anneau). */
export function DealsTabIcon({ size = 22, color = colors.faint }: IconProps) {
  const stroke = Math.max(1.6, size * 0.09)
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle
          cx="12"
          cy="12"
          r="9"
          stroke={color}
          strokeWidth={stroke}
        />
        <Circle
          cx="12"
          cy="12"
          r="6.2"
          stroke={color}
          strokeWidth={stroke * 0.75}
        />
        <Path
          d="M15.6 8.4 13.7 13.7 8.4 15.6 10.3 10.3Z"
          stroke={color}
          strokeWidth={stroke}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  )
}

/** Ticket / billet — Activités (distinct du calendrier Planner). */
export function ActivitiesTabIcon({ size = 22, color = colors.faint }: IconProps) {
  const w = size * 0.92
  const h = size * 0.58
  const hole = h * 0.28
  const bodyW = w * 0.62
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: w,
          height: h,
          borderRadius: h * 0.22,
          backgroundColor: color,
          flexDirection: 'row',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: w * 0.3,
            height: h,
            alignItems: 'center',
            justifyContent: 'center',
            borderRightWidth: StyleSheet.hairlineWidth,
            borderRightColor: 'rgba(255,255,255,0.35)',
          }}
        >
          <View
            style={{
              width: hole,
              height: hole,
              borderRadius: hole,
              backgroundColor: colors.white,
            }}
          />
        </View>
        <View
          style={{
            flex: 1,
            paddingHorizontal: w * 0.08,
            gap: h * 0.1,
            justifyContent: 'center',
          }}
        >
          {[0.78, 0.55, 0.68].map((frac, i) => (
            <View
              key={i}
              style={{
                width: bodyW * frac,
                height: Math.max(2, h * 0.1),
                borderRadius: 2,
                backgroundColor: colors.white,
                opacity: 0.92,
              }}
            />
          ))}
        </View>
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
    case 'Activities':
      return <ActivitiesTabIcon size={size} color={color} focused={focused} />
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
