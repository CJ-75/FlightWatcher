import React from 'react'
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts } from '../theme'
import { TabBarIcon } from './TabIcons'

const LABELS: Record<string, string> = {
  Search: 'Chercher',
  Favorites: 'Favoris',
  Profile: 'Compte',
}

export const FLOATING_TAB_HEIGHT = 68
export const FLOATING_TAB_MARGIN = 18

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const bottom = Math.max(insets.bottom, 10)

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: bottom }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index
          const { options } = descriptors[route.key]
          const label = LABELS[route.name] || options.title || route.name

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params)
            }
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              style={({ pressed }) => [
                styles.item,
                focused && styles.itemActive,
                pressed && styles.itemPressed,
              ]}
            >
              <View style={styles.iconWrap}>
                <TabBarIcon name={route.name} focused={focused} size={22} />
              </View>
              <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: FLOATING_TAB_MARGIN,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 420,
    minHeight: FLOATING_TAB_HEIGHT,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 2,
    ...Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOpacity: 0.14,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 10 },
      },
      android: {
        elevation: 14,
      },
      default: {},
    }),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 24,
    gap: 4,
  },
  itemActive: {
    backgroundColor: colors.primarySoft,
  },
  itemPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  iconWrap: {
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.15,
    color: colors.muted,
    includeFontPadding: false,
  },
  labelActive: {
    color: colors.primaryInk,
    fontFamily: fonts.bold,
    letterSpacing: 0.1,
  },
})
