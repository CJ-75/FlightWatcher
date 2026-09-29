import React from 'react'
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts } from '../theme'
import { HeartIcon } from './HeartIcon'

const LABELS: Record<string, string> = {
  Search: 'Recherche',
  Favorites: 'Favoris',
  Profile: 'Profil',
}

const ICONS: Record<string, string> = {
  Search: '⌕',
  Profile: '◎',
}

export const FLOATING_TAB_HEIGHT = 64
export const FLOATING_TAB_MARGIN = 16

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
              style={({ pressed }) => [
                styles.item,
                focused && styles.itemActive,
                pressed && styles.itemPressed,
              ]}
            >
              {route.name === 'Favorites' ? (
                <View style={styles.heartSlot}>
                  <HeartIcon
                    size={18}
                    filled
                    color={focused ? colors.primary : colors.faint}
                  />
                </View>
              ) : (
                <Text style={[styles.icon, focused && styles.iconActive]}>
                  {ICONS[route.name] || '•'}
                </Text>
              )}
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
    borderRadius: 28,
    backgroundColor: colors.white,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
    ...Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOpacity: 0.16,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 10 },
      },
      android: {
        elevation: 12,
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
    borderRadius: 20,
    gap: 3,
  },
  itemActive: {
    backgroundColor: colors.primarySoft,
  },
  itemPressed: {
    opacity: 0.88,
  },
  heartSlot: {
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 18,
    lineHeight: 22,
    color: colors.faint,
    fontFamily: fonts.semibold,
    includeFontPadding: false,
  },
  iconActive: {
    color: colors.primary,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    color: colors.muted,
    includeFontPadding: false,
  },
  labelActive: {
    color: colors.primaryInk,
    fontFamily: fonts.bold,
  },
})
