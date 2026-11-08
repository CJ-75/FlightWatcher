import React, { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DealsScreen } from './DealsScreen'
import { ParcoursCatalogScreen } from './ParcoursCatalogScreen'
import { FwKicker } from '../components/FwKicker'
import { ScreenBackground } from '../components/ScreenBackground'
import { colors, fonts, spacing } from '../theme'

type Segment = 'parcours' | 'sejours'

/** Titre fixe + tabs TikTok sous le titre. */
export function ParcoursHubScreen() {
  const [segment, setSegment] = useState<Segment>('parcours')
  const insets = useSafeAreaInsets()

  const header = (
    <View style={{ paddingTop: insets.top + 12 }}>
      <FwKicker>PARCOURS</FwKicker>
      <Text style={styles.title}>Où aller, quoi faire</Text>
      <Text style={styles.subtitle}>
        Des balades et des week-ends choisis pour toi.
      </Text>
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
    </View>
  )

  if (segment === 'sejours') {
    return (
      <View style={styles.root}>
        <ScreenBackground />
        <View style={{ flex: 1, paddingHorizontal: spacing.xl }}>
          {header}
          <View style={styles.flex}>
            <DealsScreen embedded />
          </View>
        </View>
      </View>
    )
  }

  return <ParcoursCatalogScreen headerExtra={header} embedded />
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  title: {
    marginTop: 6,
    fontFamily: fonts.extrabold,
    fontSize: 28,
    letterSpacing: -0.8,
    color: colors.ink,
  },
  subtitle: {
    marginTop: 6,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    marginBottom: 4,
  },
  tabs: {
    flexDirection: 'row',
    gap: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    marginTop: 12,
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
