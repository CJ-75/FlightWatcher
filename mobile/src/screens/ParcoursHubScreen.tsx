import React, { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DealsScreen } from './DealsScreen'
import { ParcoursCatalogScreen } from './ParcoursCatalogScreen'
import { colors, fonts } from '../theme'

type Segment = 'parcours' | 'sejours'

/** Onglet Parcours — segments §5. */
export function ParcoursHubScreen() {
  const [segment, setSegment] = useState<Segment>('parcours')
  const insets = useSafeAreaInsets()

  const bar = (
    <View style={[styles.barWrap, segment === 'parcours' ? null : { paddingTop: insets.top + 8 }]}>
      <View style={styles.bar}>
        {(
          [
            { id: 'parcours' as const, label: 'Parcours' },
            { id: 'sejours' as const, label: 'Séjours pas chers' },
          ] as const
        ).map((s) => (
          <Pressable
            key={s.id}
            onPress={() => setSegment(s.id)}
            style={[styles.seg, segment === s.id && styles.segOn]}
          >
            <Text style={[styles.segText, segment === s.id && styles.segTextOn]}>
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )

  if (segment === 'sejours') {
    return (
      <View style={styles.root}>
        {bar}
        <View style={styles.flex}>
          <DealsScreen />
        </View>
      </View>
    )
  }

  return <ParcoursCatalogScreen headerExtra={bar} />
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  barWrap: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.line,
  },
  seg: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  segOn: {
    backgroundColor: colors.ink,
  },
  segText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
  segTextOn: {
    color: '#F5EFEA',
  },
})
