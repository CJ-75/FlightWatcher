import React from 'react'
import { Text, type TextStyle, type StyleProp } from 'react-native'
import { tabScreenHeaderStyles } from './TabScreenHeader'

type Props = {
  children: string
  style?: StyleProp<TextStyle>
}

/** Surtitre accent — même forme que TabScreenHeader (onglets). */
export function FwKicker({ children, style }: Props) {
  return <Text style={[tabScreenHeaderStyles.kicker, style]}>{children}</Text>
}
