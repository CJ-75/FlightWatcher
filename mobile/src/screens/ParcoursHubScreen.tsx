import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DealsScreen } from './DealsScreen'
import { ParcoursCatalogScreen } from './ParcoursCatalogScreen'
import { TabScreenHeader } from '../components/TabScreenHeader'
import { ScreenBackground } from '../components/ScreenBackground'
import { FLOATING_TAB_MARGIN } from '../components/FloatingTabBar'
import { useAuth } from '../context/AuthContext'
import { canCreateParcoursOnDevice } from '../lib/parcoursAccess'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, spacing } from '../theme'

const FAB_SIZE = 44
/** Scene already has tabClearance paddingBottom — only a small inset inside that area. */
const FAB_BOTTOM_INSET = 8
/** 5 tabs — Favoris is the last slot. */
const TAB_COUNT = 5

type Segment = 'parcours' | 'sejours'

/** Titre fixe + tabs TikTok sous le titre — même header que Planner / Activités. */
export function ParcoursHubScreen() {
  const [segment, setSegment] = useState<Segment>('parcours')
  const insets = useSafeAreaInsets()
  const { width: windowWidth } = useWindowDimensions()
  const { user } = useAuth()
  const canCreate = canCreateParcoursOnDevice(user?.email)
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>()

  const fabPos = useMemo(() => {
    // Tab scene already pads above the dock (tabClearance) — do NOT add dock height again.
    // Horizontally align with Favoris (last of 5 equal slots in the centered bar).
    const barW = Math.min(windowWidth - FLOATING_TAB_MARGIN * 2, 400)
    const barLeft = (windowWidth - barW) / 2
    const slotW = barW / TAB_COUNT
    const favoritesCenterX = barLeft + barW - slotW / 2
    return {
      bottom: FAB_BOTTOM_INSET,
      right: Math.max(12, windowWidth - favoritesCenterX - FAB_SIZE / 2),
    }
  }, [windowWidth])

  const header = (
    <View style={{ paddingTop: insets.top + 12 }}>
      <TabScreenHeader
        kicker="PARCOURS"
        title="Où aller, quoi faire"
        subtitle="Des balades et des week-ends choisis pour toi."
      >
        <View style={styles.tabs}>
          {(
            [
              { id: 'parcours' as const, label: 'Parcours' },
              { id: 'sejours' as const, label: 'Séjours pas chers' },
            ] as const
          ).map((s) => {
            const on = segment === s.id
            return (
              <Pressable
                key={s.id}
                onPress={() => setSegment(s.id)}
                style={styles.tab}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{s.label}</Text>
                {on ? <View style={styles.tabUnderline} /> : null}
              </Pressable>
            )
          })}
        </View>
      </TabScreenHeader>
    </View>
  )

  return (
    <View style={styles.root}>
      <ScreenBackground />
      {/* Keep both mounted — instant tab switch, no remount loading. */}
      <View
        style={[
          styles.flex,
          { paddingHorizontal: spacing.xl },
          segment !== 'sejours' && styles.hidden,
        ]}
        pointerEvents={segment === 'sejours' ? 'auto' : 'none'}
      >
        {header}
        <View style={styles.flex}>
          <DealsScreen embedded />
        </View>
      </View>
      <View
        style={[styles.flex, segment !== 'parcours' && styles.hidden]}
        pointerEvents={segment === 'parcours' ? 'auto' : 'none'}
      >
        <ParcoursCatalogScreen headerExtra={header} embedded />
      </View>
      {canCreate && segment === 'parcours' ? (
        <Pressable
          onPress={() => navigation.navigate('CreateParcours')}
          accessibilityRole="button"
          accessibilityLabel="Créer un parcours"
          style={({ pressed }) => [
            styles.fab,
            fabPos,
            pressed && styles.fabPressed,
          ]}
        >
          <View style={styles.fabGlyph} pointerEvents="none">
            <View style={styles.fabPlusH} />
            <View style={styles.fabPlusV} />
          </View>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  hidden: { display: 'none' },
  fab: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    ...Platform.select({
      ios: {
        shadowColor: colors.primaryDeep,
        shadowOpacity: 0.35,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  fabPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
  fabGlyph: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPlusH: {
    position: 'absolute',
    width: 16,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: '#fff',
  },
  fabPlusV: {
    position: 'absolute',
    width: 2.5,
    height: 16,
    borderRadius: 1.5,
    backgroundColor: '#fff',
  },
  tabs: {
    flexDirection: 'row',
    gap: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    marginTop: 14,
    marginBottom: 4,
  },
  tab: {
    paddingBottom: 12,
    position: 'relative',
  },
  tabText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.muted,
  },
  tabTextOn: {
    color: colors.ink,
  },
  tabUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: colors.ink,
  },
})
