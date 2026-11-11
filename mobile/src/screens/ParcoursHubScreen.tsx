import React, { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { canCreateParcours } from '@flightwatcher/shared'
import { DealsScreen } from './DealsScreen'
import { ParcoursCatalogScreen } from './ParcoursCatalogScreen'
import { AccountAvatarButton } from '../components/AccountAvatarButton'
import { TabScreenHeader } from '../components/TabScreenHeader'
import { ScreenBackground } from '../components/ScreenBackground'
import { useAuth } from '../context/AuthContext'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, spacing } from '../theme'

type Segment = 'parcours' | 'sejours'

/** Titre fixe + tabs TikTok sous le titre — même header que Planner / Activités. */
export function ParcoursHubScreen() {
  const [segment, setSegment] = useState<Segment>('parcours')
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const canCreate = canCreateParcours({ email: user?.email })
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>()

  const header = (
    <View style={{ paddingTop: insets.top + 12 }}>
      <TabScreenHeader
        kicker="PARCOURS"
        title="Où aller, quoi faire"
        subtitle="Des balades et des week-ends choisis pour toi."
        right={
          <View style={styles.headerRight}>
            {canCreate && segment === 'parcours' ? (
              <Pressable
                onPress={() => navigation.navigate('CreateParcours')}
                style={styles.createBtn}
              >
                <Text style={styles.createBtnText}>Créer</Text>
              </Pressable>
            ) : null}
            <AccountAvatarButton />
          </View>
        }
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
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  hidden: { display: 'none' },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  createBtn: {
    backgroundColor: colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  createBtnText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: '#fff',
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
