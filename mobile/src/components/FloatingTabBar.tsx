import React, { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native'
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

/**
 * Dock flottant style Apple / Airbnb :
 * - capsule translucide au-dessus du contenu
 * - 5 slots égaux, icône + label
 * - actif = puits teinté sous l’icône
 * - Parcours = puits toujours présent (home), rempli si focus
 */
export const FLOATING_TAB_HEIGHT = 64
export const FLOATING_TAB_MARGIN = 18

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const bottom = Math.max(insets.bottom, 10)

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

          const iconColor = isCenter
            ? focused
              ? '#fff'
              : colors.primary
            : focused
              ? colors.primary
              : colors.muted

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <View
                style={[
                  styles.well,
                  isCenter && styles.wellCenter,
                  focused && !isCenter && styles.wellActive,
                  focused && isCenter && styles.wellCenterActive,
                ]}
              >
                {isCenter ? (
                  <DealsTabIcon size={18} color={iconColor} />
                ) : (
                  <TabBarIcon name={route.name} focused={focused} size={20} />
                )}
              </View>
              <Text
                style={[
                  styles.label,
                  focused && styles.labelActive,
                  isCenter && styles.labelCenter,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
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
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    height: FLOATING_TAB_HEIGHT,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#1A120E',
        shadowOpacity: 0.12,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
      },
      android: { elevation: 14 },
      default: {},
    }),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(26, 18, 14, 0.06)',
  },
  item: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 2,
  },
  pressed: {
    opacity: 0.62,
  },
  /** Puits sous l’icône — sélection claire sans FAB. */
  well: {
    width: 44,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  wellActive: {
    backgroundColor: colors.primarySoft,
  },
  wellCenter: {
    backgroundColor: colors.primarySoft,
  },
  wellCenterActive: {
    backgroundColor: colors.primary,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: -0.1,
    color: colors.muted,
    textAlign: 'center',
    includeFontPadding: false,
  },
  labelActive: {
    color: colors.primary,
    fontFamily: fonts.semibold,
  },
  labelCenter: {
    fontFamily: fonts.semibold,
  },
})
