import React from 'react'
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
  TextStyle,
} from 'react-native'
import { colors, fonts, radius, shadow, spacing, type } from '../../theme'

type Variant = 'primary' | 'secondary' | 'ghost' | 'google'

type Props = {
  label: string
  onPress?: () => void
  loading?: boolean
  disabled?: boolean
  variant?: Variant
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
  left?: React.ReactNode
}

export function Button({
  label,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  style,
  textStyle,
  left,
}: Props) {
  const isDisabled = disabled || loading
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        variant === 'google' && styles.google,
        variant === 'primary' && shadow.glow,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.white : colors.ink} />
      ) : (
        <>
          {left}
          <Text
            style={[
              type.button,
              { lineHeight: 22 },
              variant === 'primary' && styles.primaryText,
              variant === 'secondary' && styles.secondaryText,
              variant === 'ghost' && styles.ghostText,
              variant === 'google' && styles.googleText,
              textStyle,
            ]}
            numberOfLines={2}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.primarySoft,
    borderWidth: 0,
  },
  ghost: { backgroundColor: 'transparent' },
  google: {
    backgroundColor: colors.primarySoft,
    borderWidth: 0,
  },
  primaryText: { color: colors.white },
  secondaryText: { color: colors.ink },
  ghostText: { color: colors.muted, fontFamily: fonts.semibold },
  googleText: { color: colors.ink },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  disabled: { opacity: 0.5 },
})
