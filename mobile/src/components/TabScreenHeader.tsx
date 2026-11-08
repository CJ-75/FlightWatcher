import React from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { AccountAvatarButton } from './AccountAvatarButton'
import { colors, fonts } from '../theme'

type Props = {
  kicker: string
  title: string
  subtitle?: string
  /** Defaults to account avatar. Pass null to hide. */
  right?: React.ReactNode | null
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
}

/**
 * Shell header partagé — même forme orange/noir sur Parcours, Planner, Activités, Favoris.
 * Kicker 11 · titre 34 · sous-titre 15.
 */
export function TabScreenHeader({
  kicker,
  title,
  subtitle,
  right,
  children,
  style,
}: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.topRow}>
        <View style={styles.topCopy}>
          <Text style={styles.kicker}>{kicker}</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
        {right === null ? null : right !== undefined ? right : <AccountAvatarButton />}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  )
}

export const tabScreenHeaderStyles = StyleSheet.create({
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.primary,
    marginBottom: 2,
    textTransform: 'uppercase',
    includeFontPadding: false,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 34,
    color: colors.ink,
    letterSpacing: -1,
    lineHeight: 40,
    includeFontPadding: false,
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
    marginTop: 2,
  },
})

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  kicker: tabScreenHeaderStyles.kicker,
  title: tabScreenHeaderStyles.title,
  subtitle: tabScreenHeaderStyles.subtitle,
})
