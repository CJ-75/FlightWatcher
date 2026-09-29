import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  SectionList,
  TextInput,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Destination } from '@flightwatcher/shared'
import { colors, fonts } from '../theme'

type Props = {
  visible: boolean
  destinations: Destination[]
  excluded: string[]
  loading?: boolean
  onChange: (codes: string[]) => void
  onClose: () => void
  onLoad?: () => void
}

export function ExcludeDestinationsModal({
  visible,
  destinations,
  excluded,
  loading,
  onChange,
  onClose,
  onLoad,
}: Props) {
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')

  const sections = useMemo(() => {
    const list = Array.isArray(destinations) ? destinations : []
    const q = query.trim().toLowerCase()
    const filtered = q
      ? list.filter(
          (d) =>
            d.code.toLowerCase().includes(q) ||
            d.nom.toLowerCase().includes(q) ||
            d.pays.toLowerCase().includes(q),
        )
      : list
    const byCountry = new Map<string, Destination[]>()
    for (const d of filtered) {
      const listForCountry = byCountry.get(d.pays) || []
      listForCountry.push(d)
      byCountry.set(d.pays, listForCountry)
    }
    return Array.from(byCountry.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, data]) => ({ title, data }))
  }, [destinations, query])

  const toggle = (code: string) => {
    if (excluded.includes(code)) onChange(excluded.filter((c) => c !== code))
    else onChange([...excluded, code])
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>Exclure des destinations</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.done}>OK</Text>
          </Pressable>
        </View>

        {excluded.length > 0 ? (
          <View style={styles.excludedBar}>
            <Text style={styles.excludedCount}>{excluded.length} exclue(s)</Text>
            <Pressable onPress={() => onChange([])}>
              <Text style={styles.clear}>Tout effacer</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.searchBox}>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Filtrer ville ou pays…"
            placeholderTextColor={colors.faint}
            autoCorrect={false}
          />
        </View>

        {destinations.length === 0 ? (
          <View style={styles.empty}>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Pressable onPress={onLoad} style={styles.loadBtn}>
                <Text style={styles.loadText}>Charger les destinations</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.code}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <Text style={styles.section}>{section.title}</Text>
            )}
            renderItem={({ item }) => {
              const active = excluded.includes(item.code)
              return (
                <Pressable
                  onPress={() => toggle(item.code)}
                  style={[styles.row, active && styles.rowActive]}
                >
                  <Text style={[styles.rowName, active && styles.rowNameActive]}>{item.nom}</Text>
                  <Text style={styles.rowCode}>{item.code}</Text>
                </Pressable>
              )
            }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          />
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas, paddingTop: 10 },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
    includeFontPadding: false,
  },
  done: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.primary,
    includeFontPadding: false,
  },
  excludedBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  excludedCount: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.danger,
    includeFontPadding: false,
  },
  clear: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.muted,
    includeFontPadding: false,
  },
  searchBox: { paddingHorizontal: 16, marginBottom: 8 },
  search: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
  },
  loadText: { fontFamily: fonts.bold, color: colors.white, fontSize: 15 },
  section: {
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    marginTop: 14,
    marginBottom: 6,
    includeFontPadding: false,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  rowActive: { backgroundColor: '#FEE2E2', borderColor: colors.danger },
  rowName: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
    includeFontPadding: false,
  },
  rowNameActive: { color: colors.danger },
  rowCode: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.faint,
    includeFontPadding: false,
  },
})
