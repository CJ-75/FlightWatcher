import React, { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts } from '../theme'
import { DealsTabIcon, TabBarIcon } from './TabIcons'

/** Ordre UI — Parcours au centre. */
const TAB_ORDER = ['Search', 'Activities', 'Deals', 'Planner', 'Favorites'] as const

const LABELS: Record<string, string> = {
  Search: 'Vols',
  Activities: 'Activités',
  Deals: 'Parcours',
  Planner: 'Planner',
  Favorites: 'Favoris',
}

/** Dock + orbe légèrement relevé (pattern travel / Airbnb Book). */
export const FLOATING_TAB_HEIGHT = 58
export const FLOATING_TAB_MARGIN = 16
const ORB = 46
const ORB_LIFT = 18

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const bottom = Math.max(insets.bottom, 8)

  const tabs = useMemo(() => {
    const byName = new Map(
      state.routes.map((route, index) => [route.name, { route, index }]),
    )
    return TAB_ORDER.map((name) => byName.get(name)).filter(
      (x): x is { route: (typeof state.routes)[number]; index: number } => {
        if (!x) return false
        const opts = descriptors[x.route.key]?.options as
          | { href?: string | null }
          | undefined
        return opts?.href !== null
      },
    )
  }, [state.routes, descriptors])

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: bottom }]}>
      <View style={styles.bar}>
        {tabs.map(({ route, index }) => {
          const focused = state.index === index
          const label = LABELS[route.name] || route.name
          const isCenter = route.name === 'Deals'

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })
            if (!event.defaultPrevented) {
              navigation.navigate(route.name, route.params)
            }
          }

          if (isCenter) {
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={label}
                style={({ pressed }) => [
                  styles.centerSlot,
                  pressed && styles.centerPressed,
                ]}
              >
                <View style={styles.orbWrap}>
                  <LinearGradient
                    colors={
                      focused
                        ? [colors.primary, colors.primaryDeep]
                        : [colors.primary, '#FF8A5C']
                    }
                    start={{ x: 0.15, y: 0 }}
                    end={{ x: 0.85, y: 1 }}
                    style={[styles.orb, focused && styles.orbFocused]}
                  >
                    <DealsTabIcon size={20} color="#fff" />
                  </LinearGradient>
                </View>
                <Text
                  style={[styles.label, styles.centerLabel, focused && styles.labelActive]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </Pressable>
            )
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <View style={styles.iconWrap}>
                <TabBarIcon name={route.name} focused={focused} size={22} />
              </View>
              <Text
                style={[styles.label, focused && styles.labelActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
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
    alignItems: 'flex-end',
    width: '100%',
    maxWidth: 420,
    height: FLOATING_TAB_HEIGHT,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 4,
    paddingBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 12 },
      default: {},
    }),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    paddingBottom: 0,
  },
  pressed: {
    opacity: 0.55,
  },
  iconWrap: {
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSlot: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  centerPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  orbWrap: {
    marginTop: -ORB_LIFT,
    marginBottom: 1,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOpacity: 0.35,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  orb: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  orbFocused: {
    borderColor: '#fff',
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: -0.08,
    color: colors.muted,
    textAlign: 'center',
    includeFontPadding: false,
  },
  centerLabel: {
    marginTop: 0,
  },
  labelActive: {
    color: colors.primary,
    fontFamily: fonts.semibold,
  },
})
