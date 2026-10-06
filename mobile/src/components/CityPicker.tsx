import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  FlatList,
  Image,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Airport } from '@flightwatcher/shared'
import {
  cityImageUrl,
  findCityGroupByKey,
  groupAirportsByCity,
  pickPopularCityGroups,
  type CityAirportGroup,
} from '@flightwatcher/shared'
import { colors, fonts, radius, shadow } from '../theme'

type Props = {
  airports: Airport[]
  /** Selected city group key, or '' for all destinations. */
  valueKey: string
  onChange: (group: CityAirportGroup | null) => void
  emptyLabel?: string
}

export function CityPicker({
  airports,
  valueKey,
  onChange,
  emptyLabel = 'Toutes destinations',
}: Props) {
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const groups = useMemo(() => groupAirportsByCity(airports), [airports])
  const selected = useMemo(
    () => findCityGroupByKey(groups, valueKey),
    [groups, valueKey],
  )

  // Dynamically filtered by served routes passed as `airports`
  const popular = useMemo(() => pickPopularCityGroups(groups, 10), [groups])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups.filter(
      (g) =>
        g.city.toLowerCase().includes(q) ||
        g.country.toLowerCase().includes(q) ||
        g.airports.some((a) => a.code.toLowerCase().includes(q)),
    )
  }, [groups, query])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const codesLabel = selected
    ? selected.airports.map((a) => a.code).join(' · ')
    : ''

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.92 }]}
      >
        {selected ? (
          <View style={styles.triggerInner}>
            <Image
              source={{ uri: cityImageUrl(selected.city) }}
              style={styles.triggerThumb}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.triggerCity} numberOfLines={1}>
                {selected.city}
              </Text>
              <Text style={styles.triggerMeta} numberOfLines={1}>
                {selected.country} · {codesLabel}
              </Text>
            </View>
            <Text style={styles.triggerChevron}>›</Text>
          </View>
        ) : (
          <View style={styles.triggerInner}>
            <View style={styles.triggerAny}>
              <Text style={styles.triggerAnyIcon}>✈</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.triggerCity}>{emptyLabel}</Text>
              <Text style={styles.triggerMeta}>Inspire · toutes les villes</Text>
            </View>
            <Text style={styles.triggerChevron}>›</Text>
          </View>
        )}
      </Pressable>

      {selected ? (
        <View style={[styles.hero, shadow.soft]}>
          <Image source={{ uri: cityImageUrl(selected.city) }} style={styles.heroImage} />
          <LinearGradient
            colors={['transparent', 'rgba(26,18,14,0.75)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroCaption}>
            <Text style={styles.heroCity}>{selected.city}</Text>
            <Text style={styles.heroMeta}>
              {selected.airports.length} aéroport
              {selected.airports.length > 1 ? 's' : ''} · {codesLabel}
            </Text>
          </View>
        </View>
      ) : null}

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={[styles.modal, { paddingTop: insets.top + 8 }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={styles.modalCancel}>Fermer</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Ville d’arrivée</Text>
            <View style={{ width: 56 }} />
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Chercher une ville…"
            placeholderTextColor={colors.faint}
            style={styles.search}
            autoCorrect={false}
          />

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.key}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}
            ListHeaderComponent={
              <View style={{ gap: 10, marginBottom: 12 }}>
                <Pressable
                  onPress={() => {
                    onChange(null)
                    setOpen(false)
                  }}
                  style={[styles.row, !valueKey && styles.rowOn]}
                >
                  <View style={styles.rowAny}>
                    <Text style={styles.rowAnyIcon}>✈</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{emptyLabel}</Text>
                    <Text style={styles.rowMeta}>Sans filtre de destination</Text>
                  </View>
                </Pressable>

                {!query.trim() && popular.length > 0 ? (
                  <>
                    <Text style={styles.section}>Populaires</Text>
                    {popular.map((g) => (
                      <CityRow
                        key={`pop-${g.key}`}
                        group={g}
                        selected={g.key === valueKey}
                        onPress={() => {
                          onChange(g)
                          setOpen(false)
                        }}
                      />
                    ))}
                    <Text style={[styles.section, { marginTop: 8 }]}>Toutes les villes</Text>
                  </>
                ) : null}
              </View>
            }
            renderItem={({ item }) =>
              !query.trim() && popular.some((p) => p.key === item.key) ? null : (
                <CityRow
                  group={item}
                  selected={item.key === valueKey}
                  onPress={() => {
                    onChange(item)
                    setOpen(false)
                  }}
                />
              )
            }
          />
        </View>
      </Modal>
    </>
  )
}

function CityRow({
  group,
  selected,
  onPress,
}: {
  group: CityAirportGroup
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, selected && styles.rowOn, pressed && { opacity: 0.9 }]}
    >
      <Image source={{ uri: cityImageUrl(group.city) }} style={styles.rowThumb} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {group.city}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {group.country} · {group.airports.map((a) => a.code).join(' · ')}
        </Text>
      </View>
      {selected ? <Text style={styles.check}>✓</Text> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  trigger: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  triggerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  triggerThumb: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.line,
  },
  triggerAny: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerAnyIcon: { fontSize: 18 },
  triggerCity: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  triggerMeta: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  triggerChevron: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.faint,
    marginRight: 4,
  },
  hero: {
    marginTop: 12,
    height: 148,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.line,
  },
  heroImage: { width: '100%', height: '100%' },
  heroCaption: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
  },
  heroCity: {
    fontFamily: fonts.extrabold,
    fontSize: 24,
    color: colors.white,
    letterSpacing: -0.5,
  },
  heroMeta: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 2,
  },
  modal: { flex: 1, backgroundColor: colors.canvas },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  modalCancel: { fontFamily: fonts.semibold, color: colors.primary, fontSize: 15, width: 56 },
  modalTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  search: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  section: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  rowOn: {
    borderColor: colors.primaryMuted,
    backgroundColor: colors.primarySoft,
  },
  rowThumb: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.line,
  },
  rowAny: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAnyIcon: { fontSize: 20 },
  rowTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  rowMeta: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, marginTop: 2 },
  check: { fontFamily: fonts.bold, fontSize: 16, color: colors.primary, marginRight: 6 },
})
