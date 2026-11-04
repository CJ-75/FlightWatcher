import React from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  cityDisplayNameFr,
  resolveTripImageUrl,
  partyModeFromCount,
  partyModeKickerFr,
  type TravelWorkspace,
} from '@flightwatcher/shared'
import { colors, fonts, shadow } from '../theme'

export type JourneyDensity = 'solo' | 'duo' | 'groupe'

const PHASE_META: Record<
  TravelWorkspace['phase'],
  { label: string; action: string; tone: string }
> = {
  planning: { label: 'En cours', action: 'Continuer', tone: '#F97316' },
  flight_selected: { label: 'Vol choisi', action: 'Finaliser', tone: '#F97316' },
  composing: { label: 'À finaliser', action: 'Reprendre', tone: '#F97316' },
  booked: { label: 'Réservé', action: 'Ouvrir', tone: '#0F8A5F' },
  past: { label: 'Terminé', action: 'Revoir', tone: '#64748B' },
}

function compactDate(
  value?: string | null,
  opts?: { withYear?: boolean },
) {
  if (!value) return null
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  const withYear =
    opts?.withYear ?? date.getFullYear() < new Date().getFullYear()
  return date.toLocaleDateString(
    'fr-FR',
    withYear
      ? { day: 'numeric', month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'short' },
  )
}

function compactTripRange(
  out?: string | null,
  ret?: string | null,
): string | null {
  if (!out) return null
  if (!ret) return compactDate(out)
  const a = new Date(`${out.slice(0, 10)}T12:00:00`)
  const b = new Date(`${ret.slice(0, 10)}T12:00:00`)
  const nowYear = new Date().getFullYear()
  const spansYears = a.getFullYear() !== b.getFullYear()
  const showOut = spansYears || a.getFullYear() < nowYear
  const showRet = spansYears || b.getFullYear() < nowYear
  return `${compactDate(out, { withYear: showOut })} → ${compactDate(ret, { withYear: showRet })}`
}

function partyLabel(workspace: TravelWorkspace): string {
  const trip = workspace.planned_trip
  const pax = Math.max(
    trip?.passengers || 0,
    trip?.member_names?.length || 0,
    trip?.members_count || 0,
    1,
  )
  return partyModeKickerFr(partyModeFromCount(pax))
}

/** Uniquement si ce n’est pas mon voyage — « par Moi » est omis (évident). */
function byOrganizerLabel(workspace: TravelWorkspace): string | null {
  if (workspace.is_organizer) return null
  const trip = workspace.planned_trip
  const raw =
    trip?.organizer?.full_name?.trim() ||
    trip?.member_names?.[0]?.trim() ||
    ''
  const name =
    raw && raw !== 'Organisateur' && raw !== 'Organizer' ? raw : ''
  return name ? `par ${name}` : 'par l’organisateur'
}

export function JourneyCard({
  workspace,
  density = 'groupe',
  onPress,
}: {
  workspace: TravelWorkspace
  density?: JourneyDensity
  onPress: () => void
}) {
  const meta = PHASE_META[workspace.phase] || PHASE_META.planning
  const destCode = (workspace.dest_iata || '').split(/[,;]/)[0]?.trim() || ''
  const cityRaw = String(workspace.city || '')
    .split(',')[0]
    ?.split('(')[0]
    ?.trim()
  const city =
    (cityRaw && !/^[A-Z]{3}$/.test(cityRaw) ? cityRaw : null) ||
    (destCode ? cityDisplayNameFr(destCode) : null) ||
    cityRaw ||
    'Destination'
  const image = resolveTripImageUrl({
    city,
    iata: destCode || null,
    imageUrl: workspace.image_url,
  })
  const dateRange = compactTripRange(workspace.out_date, workspace.ret_date)
  const party = partyLabel(workspace)
  const byLabel = byOrganizerLabel(workspace)

  if (density === 'solo') {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          styles.soloCard,
          shadow.soft,
          pressed && { opacity: 0.95, transform: [{ scale: 0.992 }] },
        ]}
      >
        <View style={styles.soloHero}>
          <Image source={{ uri: image }} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(20,12,8,0.05)', 'rgba(20,12,8,0.88)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.phase, { backgroundColor: meta.tone }]}>
            <Text style={styles.phaseText}>{meta.label}</Text>
          </View>
          <View style={styles.soloParty}>
            <Text style={styles.soloPartyText}>{party}</Text>
          </View>
          <View style={styles.soloHeroCopy}>
            <Text style={styles.soloCity} numberOfLines={1}>
              {city}
            </Text>
            <Text style={styles.soloRoute} numberOfLines={1}>
              {workspace.origin_iata || '—'} → {workspace.dest_iata || '—'}
            </Text>
          </View>
        </View>
        <View style={styles.soloBody}>
          <Text style={styles.soloTitle} numberOfLines={2}>
            {workspace.title}
          </Text>
          {byLabel ? (
            <Text style={styles.byLine} numberOfLines={1}>
              {byLabel}
            </Text>
          ) : null}
          {dateRange ? <Text style={styles.date}>{dateRange}</Text> : null}
          <View style={styles.footer}>
            <View style={styles.steps}>
              <View
                style={[
                  styles.stepDot,
                  workspace.pipeline.flight === 'booked' && styles.stepBooked,
                  workspace.pipeline.flight === 'selected' && styles.stepDone,
                ]}
              />
              <View style={styles.stepLine} />
              <View
                style={[
                  styles.stepDot,
                  workspace.pipeline.hotel === 'booked' && styles.stepBooked,
                  workspace.pipeline.hotel === 'selected' && styles.stepDone,
                ]}
              />
            </View>
            <Text style={styles.action}>{meta.action}  ›</Text>
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        density === 'duo' && styles.duoCard,
        shadow.soft,
        pressed && { opacity: 0.95, transform: [{ scale: 0.992 }] },
      ]}
    >
      <View style={[styles.hero, density === 'duo' && styles.duoHero]}>
        <Image source={{ uri: image }} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['rgba(20,12,8,0.08)', 'rgba(20,12,8,0.86)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.phase, { backgroundColor: meta.tone }]}>
          <Text style={styles.phaseText}>{meta.label}</Text>
        </View>
        <View style={styles.heroCopy}>
          <Text
            style={[styles.city, density === 'duo' && styles.duoCity]}
            numberOfLines={1}
          >
            {city}
          </Text>
          <Text style={styles.route} numberOfLines={1}>
            {workspace.origin_iata || '—'} → {workspace.dest_iata || '—'}
          </Text>
        </View>
      </View>
      <View style={[styles.body, density === 'duo' && styles.duoBody]}>
        <Text
          style={[styles.title, density === 'duo' && styles.duoTitle]}
          numberOfLines={2}
        >
          {workspace.title}
        </Text>
        {byLabel ? (
          <Text style={styles.byLine} numberOfLines={1}>
            {byLabel}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          {dateRange ? (
            <Text style={styles.date} numberOfLines={1}>
              {dateRange}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <View style={styles.scope}>
            <Text style={styles.scopeText}>{party}</Text>
          </View>
        </View>
        <View style={styles.footer}>
          <View style={styles.steps}>
            <View
              style={[
                styles.stepDot,
                workspace.pipeline.flight === 'booked' && styles.stepBooked,
                workspace.pipeline.flight === 'selected' && styles.stepDone,
              ]}
            />
            <View style={styles.stepLine} />
            <View
              style={[
                styles.stepDot,
                workspace.pipeline.hotel === 'booked' && styles.stepBooked,
                workspace.pipeline.hotel === 'selected' && styles.stepDone,
              ]}
            />
          </View>
          <Text style={styles.action} numberOfLines={1}>
            {meta.action}  ›
          </Text>
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
  soloCard: {
    marginBottom: 20,
  },
  duoCard: {
    flex: 1,
    marginBottom: 12,
  },
  hero: { height: 154, justifyContent: 'flex-end' },
  duoHero: { height: 118 },
  soloHero: {
    height: 280,
    justifyContent: 'flex-end',
  },
  phase: {
    position: 'absolute',
    left: 14,
    top: 14,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  phaseText: { fontFamily: fonts.bold, fontSize: 10, color: colors.white },
  soloParty: {
    position: 'absolute',
    right: 14,
    top: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  soloPartyText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.primaryInk,
  },
  heroCopy: { padding: 16 },
  soloHeroCopy: { padding: 20 },
  city: { fontFamily: fonts.extrabold, fontSize: 23, color: colors.white },
  duoCity: { fontSize: 18 },
  soloCity: { fontFamily: fonts.extrabold, fontSize: 34, color: colors.white },
  route: {
    marginTop: 3,
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
  },
  soloRoute: {
    marginTop: 4,
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  body: { padding: 16, gap: 11 },
  duoBody: { padding: 12, gap: 8 },
  soloBody: { padding: 18, gap: 12 },
  title: { fontFamily: fonts.extrabold, fontSize: 18, lineHeight: 24, color: colors.ink },
  duoTitle: { fontSize: 15, lineHeight: 20 },
  soloTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.ink,
  },
  byLine: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    marginTop: -2,
    color: colors.muted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  date: { flex: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  scope: {
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
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
  stepBooked: { backgroundColor: colors.success },
  stepLine: { flex: 1, height: 2, backgroundColor: colors.line },
  action: {
    flexShrink: 1,
    textAlign: 'right',
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primaryDeep,
  },
})
