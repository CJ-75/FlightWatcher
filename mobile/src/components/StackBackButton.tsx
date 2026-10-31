import React from 'react'
import { Pressable, Text, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { colors, fonts } from '../theme'

/** Soft circular back control — matches warm canvas headers. */
export function StackBackButton({ onPress }: { onPress?: () => void }) {
  const navigation = useNavigation()
  return (
    <Pressable
      onPress={() => {
        if (onPress) {
          onPress()
          return
        }
        if (navigation.canGoBack()) {
          navigation.goBack()
          return
        }
        // Deep link landing without history
        ;(navigation as { navigate: (name: string) => void }).navigate('Main')
      }}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Retour"
    >
      <Text style={styles.chevron}>‹</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
  },
  pressed: {
    backgroundColor: colors.primaryMuted,
    opacity: 0.92,
  },
  chevron: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 30,
    color: colors.primaryDeep,
    marginTop: -1,
    marginLeft: -1,
  },
})
