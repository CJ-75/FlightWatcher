import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import {
  loadOnboardingPrefs,
  saveOnboardingPrefs,
} from '@flightwatcher/shared'
import { colors, fonts } from '../../theme'

type VoyagesEmptyProps = {
  onExplore: () => void
  onInviteTipDismiss?: () => void
  showInviteTip?: boolean
}

export function VoyagesEmpty({
  onExplore,
  onInviteTipDismiss,
  showInviteTip,
}: VoyagesEmptyProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Pas encore de voyage</Text>
      <Text style={styles.lead}>
        Pars d’un parcours, ou crée le tien — ensuite invite tes amis.
      </Text>
      <Pressable style={styles.cta} onPress={onExplore}>
        <Text style={styles.ctaText}>Explorer les parcours</Text>
      </Pressable>
      {showInviteTip ? (
        <View style={styles.tip}>
          <Text style={styles.tipText}>
            Astuce : une fois le voyage créé, invite tes amis en un lien.
          </Text>
          <Pressable
            onPress={() => {
              void saveOnboardingPrefs({ firstTripInviteTipSeen: true })
              onInviteTipDismiss?.()
            }}
          >
            <Text style={styles.tipDismiss}>OK</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

export function FavorisEmpty({ onExplore }: { onExplore: () => void }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Rien en favoris</Text>
      <Text style={styles.lead}>
        Garde un parcours ou un séjour pour le retrouver ici.
      </Text>
      <Pressable style={styles.cta} onPress={onExplore}>
        <Text style={styles.ctaText}>Voir des idées</Text>
      </Pressable>
    </View>
  )
}

export async function shouldShowInviteTip(): Promise<boolean> {
  const p = await loadOnboardingPrefs()
  return !p.firstTripInviteTipSeen
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 28, paddingVertical: 40, alignItems: 'center' },
  title: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.ink,
    textAlign: 'center',
  },
  lead: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: 'rgba(40,32,24,0.6)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    marginBottom: 20,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  ctaText: { fontFamily: fonts.semibold, color: '#fff', fontSize: 14 },
  tip: {
    marginTop: 22,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff5ef',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tipText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: 'rgba(40,32,24,0.7)',
    lineHeight: 18,
  },
  tipDismiss: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
  },
})
