import React from 'react'
import { View } from 'react-native'
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { resolveOccasionIconId, type OccasionIconId } from '@flightwatcher/shared'
import { colors } from '../theme'

type Props = {
  icon?: string | null
  slug?: string | null
  size?: number
  color?: string
}

export function OccasionIcon({
  icon,
  slug,
  size = 18,
  color = colors.primaryDeep,
}: Props) {
  const id = resolveOccasionIconId(icon, slug)
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <VectorIcon id={id} size={size} color={color} />
    </View>
  )
}

function VectorIcon({
  id,
  size,
  color,
}: {
  id: OccasionIconId
  size: number
  color: string
}) {
  switch (id) {
    case 'briefcase':
      return <Feather name="briefcase" size={size} color={color} />
    case 'calendar':
      return <Feather name="calendar" size={size} color={color} />
    case 'clock':
      return <Feather name="clock" size={size} color={color} />
    case 'heart':
      return <Feather name="heart" size={size} color={color} />
    case 'gift':
      return <Feather name="gift" size={size} color={color} />
    case 'euro':
      return <MaterialCommunityIcons name="currency-eur" size={size} color={color} />
    case 'compass':
      return <Feather name="compass" size={size} color={color} />
    case 'sun':
      return <Feather name="sun" size={size} color={color} />
    case 'thermometer':
      return <Feather name="thermometer" size={size} color={color} />
    case 'luggage':
      return <MaterialCommunityIcons name="bag-suitcase-outline" size={size} color={color} />
    case 'tree':
      return <MaterialCommunityIcons name="pine-tree" size={size} color={color} />
    case 'bridge':
      return <MaterialCommunityIcons name="bridge" size={size} color={color} />
    case 'champagne':
      return <MaterialCommunityIcons name="glass-flute" size={size} color={color} />
    case 'moon':
      return <Feather name="moon" size={size} color={color} />
    case 'sparkles':
    default:
      return <Ionicons name="sparkles-outline" size={size} color={color} />
  }
}
