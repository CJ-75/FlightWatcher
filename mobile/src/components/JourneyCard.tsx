import React from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { cityDisplayNameFr, cityImageUrl, type TravelWorkspace } from '@flightwatcher/shared'
import { colors, fonts, shadow } from '../theme'

const PHASE_META: Record<
  TravelWorkspace['phase'],
  { label: string; action: string; tone: string }
> = {
  planning: { label: 'À organiser', action: 'Continuer le planning', tone: '#F97316' },
  flight_selected: { label: 'Vol choisi', action: 'Finaliser le séjour', tone: '#F97316' },
  composing: { label: 'À finaliser', action: 'Reprendre le séjour', tone: '#F97316' },
  booked: { label: 'Réservé', action: 'Voir le dossier', tone: '#0F8A5F' },
  past: { label: 'Terminé', action: 'Revoir le voyage', tone: '#64748B' },
}

function compactDate(value?: string | null) {
  if (!value) return null
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

export function JourneyCard({
  workspace,
  onPress,
}: {
  workspace: TravelWorkspace
  onPress: () => void
}) {
  const meta = PHASE_META[workspace.phase]
  const city =
    workspace.city ||
    (workspace.dest_iata ? cityDisplayNameFr(workspace.dest_iata.split(',')[0]!) : null) ||
    'Destination'
  const image = workspace.image_url || cityImageUrl(city, workspace.dest_iata?.split(',')[0])
  const out = compactDate(workspace.out_date)
  const ret = compactDate(workspace.ret_date)

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        shadow.soft,
        pressed && { opacity: 0.95, transform: [{ scale: 0.992 }] },
      ]}
    >
      <View style={styles.hero}>
        <Image source={{ uri: image }} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['rgba(20,12,8,0.08)', 'rgba(20,12,8,0.86)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.phase, { backgroundColor: meta.tone }]}>
          <Text style={styles.phaseText}>{meta.label}</Text>
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.city} numberOfLines={1}>{city}</Text>
          <Text style={styles.route} numberOfLines={1}>
            {workspace.origin_iata || '—'} → {workspace.dest_iata || '—'}
          </Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{workspace.title}</Text>
        <View style={styles.metaRow}>
          {out ? <Text style={styles.date}>{out}{ret ? ` → ${ret}` : ''}</Text> : null}
          <View style={styles.scope}>
            <Text style={styles.scopeText}>
              {workspace.scope === 'collaborative' ? 'Groupe' : 'Personnel'}
            </Text>
          </View>
        </View>
        <View style={styles.footer}>
          <View style={styles.steps}>
            <View style={[styles.stepDot, workspace.pipeline.flight !== 'none' && styles.stepDone]} />
            <View style={styles.stepLine} />
            <View style={[styles.stepDot, workspace.pipeline.hotel !== 'none' && styles.stepDone]} />
          </View>
          <Text style={styles.action}>{meta.action}  ›</Text>
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: colors.white,
    marginBottom: 16,
  },
  hero: { height: 154, justifyContent: 'flex-end' },
  phase: {
    position: 'absolute',
    left: 14,
    top: 14,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  phaseText: { fontFamily: fonts.bold, fontSize: 10, color: colors.white },
  heroCopy: { padding: 16 },
  city: { fontFamily: fonts.extrabold, fontSize: 23, color: colors.white },
  route: { marginTop: 3, fontFamily: fonts.semibold, fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  body: { padding: 16, gap: 11 },
  title: { fontFamily: fonts.extrabold, fontSize: 18, lineHeight: 24, color: colors.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  date: { flex: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  scope: { borderRadius: 999, backgroundColor: colors.primarySoft, paddingHorizontal: 9, paddingVertical: 5 },
  scopeText: { fontFamily: fonts.bold, fontSize: 10, color: colors.primaryInk },
  footer: {
    paddingTop: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  steps: { flexDirection: 'row', alignItems: 'center', width: 54 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lineStrong },
  stepDone: { backgroundColor: colors.primary },
  stepLine: { flex: 1, height: 2, backgroundColor: colors.line },
  action: { flexShrink: 1, textAlign: 'right', fontFamily: fonts.bold, fontSize: 12, color: colors.primaryDeep },
})
