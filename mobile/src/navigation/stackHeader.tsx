import React from 'react'
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack'
import { StackBackButton } from '../components/StackBackButton'
import { colors, fonts } from '../theme'

/** Shared native-stack chrome — canvas bleed, no “Retour” label, branded back. */
export function stackHeaderOptions(
  title: string,
  extras?: Partial<NativeStackNavigationOptions>,
): NativeStackNavigationOptions {
  return {
    headerShown: true,
    title,
    headerStyle: {
      backgroundColor: colors.canvas,
    },
    headerShadowVisible: false,
    headerTintColor: colors.primaryDeep,
    headerTitleAlign: 'center',
    headerTitleStyle: {
      fontFamily: fonts.semibold,
      color: colors.ink,
      fontSize: 16,
      letterSpacing: -0.2,
    },
    headerBackVisible: false,
    headerLeftContainerStyle: { paddingLeft: 6 },
    headerRightContainerStyle: { paddingRight: 6 },
    headerLeft: () => <StackBackButton />,
    ...extras,
  }
}
