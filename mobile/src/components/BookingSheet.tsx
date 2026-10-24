import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Linking,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { EnrichedTripResponse, HotelUpsellOption } from '@flightwatcher/shared'
import {
  buildBookingUrl,
  cityDisplayNameFr,
  dateFromFlightIso,
} from '@flightwatcher/shared'
import { getApi, getWebOrigin } from '../lib/client'
import { colors, fonts, shadow } from '../theme'
import * as WebBrowser from 'expo-web-browser'

type Props = {
  trip: EnrichedTripResponse | null
  passengers?: number
  searchEventId?: string | null
  onClose: () => void
  onSaveFavorite?: () => void
}

type Step = 1 | 2 | 3

export function BookingSheet({
  trip,
  passengers = 1,
  onClose,
  onSaveFavorite,
}: Props) {
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState<Step>(1)
  const [options, setOptions] = useState<HotelUpsellOption[]>([])
  const [selected, setSelected] = useState<HotelUpsellOption | null>(null)
  const [loadingHotels, setLoadingHotels] = useState(false)
  const [hotelError, setHotelError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draftToken, setDraftToken] = useState<string | null>(null)

  useEffect(() => {
    if (!trip) {
      setStep(1)
      setOptions([])
      setSelected(null)
      setDraftToken(null)
      setHotelError(null)
    }
  }, [trip])

  if (!trip) return null

  const city = cityDisplayNameFr(
    trip.destination_code,
    trip.aller?.destinationFull?.split(',')[0]?.trim(),
  )
  const flightPp = Number(trip.prix_total) || 0
  const pax = Math.min(6, Math.max(1, passengers || 1))
  const checkin = dateFromFlightIso(trip.aller?.departureTime)
  const checkout = dateFromFlightIso(trip.retour?.departureTime)
  const flightUrl = buildBookingUrl(trip, pax)
  const totalPp = Math.round(flightPp + (selected?.hotel_pp || 0))

  const loadHotels = async () => {
    if (!trip.destination_code || !checkin || !checkout) {
      setHotelError('Dates ou destination manquantes')
      return
    }
    setLoadingHotels(true)
    setHotelError(null)
    try {
      const item = {
        iata: trip.destination_code,
        checkin,
        checkout,
        participants: pax,
        flight_pp: flightPp,
      }
      let result = (await getApi().lookupHotelUpsell([item])).results?.[0]
      if (result?.status === 'miss' || result?.status === 'pending') {
        result = await getApi().fetchHotelUpsell(item)
      }
      if (result?.status === 'pending' && result.job_id) {
        for (let i = 0; i < 14; i++) {
          await new Promise((r) => setTimeout(r, 1200))
          const job = await getApi().getHotelUpsellJob(result.job_id!)
          if (job.done && job.status === 'ready') {
            setOptions(job.options || [])
            if (job.options?.[0]) setSelected(job.options[0])
            if (!job.options?.length) setHotelError('Aucun hôtel cohérent avec ce vol')
            return
          }
          if (job.done) {
            setHotelError('Aucun hôtel disponible')
            return
          }
        }
        setHotelError('Recherche trop longue — réessaie')
        return
      }
      const opts = result?.options || (result?.hotel ? [result.hotel] : [])
      setOptions(opts)
      if (opts[0]) setSelected(opts[0])
      if (!opts.length) setHotelError('Aucun hôtel dans le budget de ce vol')
    } catch {
      setHotelError('Impossible de charger les hôtels')
    } finally {
      setLoadingHotels(false)
    }
  }

  const goHotels = () => {
    setStep(2)
    void loadHotels()
  }

  const finalize = async (hotel: HotelUpsellOption | null) => {
    setCreating(true)
    try {
      const draft = await getApi().createMyTrip({
        origin_iata: trip.aller?.origin,
        departure_airport: trip.aller?.origin,
        destination: trip.destination_code,
        city,
        dates: { outbound: checkin, inbound: checkout },
        adults: pax,
        flight: {
          price_pp: flightPp,
          provider: trip.provider,
          airline: trip.airline,
          booking_url: flightUrl,
          direct: (trip.transfers ?? 0) === 0,
        },
        hotel: hotel
          ? {
              id: hotel.id || hotel.hotel_id,
              name: hotel.name,
              stars: hotel.stars,
              rating: hotel.rating,
              photo: hotel.photo || hotel.thumbnail,
              hotel_pp: hotel.hotel_pp,
              public_hotel_price: hotel.public_hotel_price,
            }
          : undefined,
        price_per_person: Math.round(flightPp + (hotel?.hotel_pp || 0)),
        booking_url: flightUrl,
      })
      setDraftToken(draft.draft_token)
      setStep(3)
    } catch {
      setHotelError('Impossible de créer le voyage')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal visible={!!trip} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, shadow.lift, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <Text style={styles.stepLabel}>Étape {step} / 3</Text>

        {step === 1 && (
          <>
            <Text style={styles.title}>{city}</Text>
            <Text style={styles.sub}>
              {Math.round(flightPp)} € / pers. vol A/R
              {pax > 1 ? ` · ${pax} voyageurs` : ''}
            </Text>
            <Text style={styles.hint}>
              Ajoute un hôtel (max ~{Math.round(flightPp * 2.5)} €/pers.) ou continue avec le vol.
            </Text>
            <Pressable onPress={goHotels} style={styles.cta}>
              <Text style={styles.ctaText}>Ajouter un hôtel</Text>
            </Pressable>
            <Pressable
              onPress={() => void finalize(null)}
              style={styles.secondary}
              disabled={creating}
            >
              <Text style={styles.secondaryText}>Continuer sans hôtel</Text>
            </Pressable>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>Choisis ton hôtel</Text>
            <Text style={styles.sub}>Meilleures notes · budget cohérent avec le vol</Text>
            {loadingHotels ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.hint}>Recherche LiteAPI…</Text>
              </View>
            ) : hotelError ? (
              <View style={styles.loadingBox}>
                <Text style={styles.hint}>{hotelError}</Text>
                <Pressable onPress={() => void loadHotels()}>
                  <Text style={styles.link}>Réessayer</Text>
                </Pressable>
                <Pressable onPress={() => void finalize(null)}>
                  <Text style={styles.link}>Sans hôtel</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {options.map((h, idx) => {
                  const id = String(h.id || h.hotel_id || idx)
                  const active =
                    (selected?.id || selected?.hotel_id) === (h.id || h.hotel_id)
                  return (
                    <Pressable
                      key={id}
                      onPress={() => setSelected(h)}
                      style={[styles.hotelRow, active && styles.hotelActive]}
                    >
                      {h.photo || h.thumbnail ? (
                        <Image
                          source={{ uri: h.photo || h.thumbnail }}
                          style={styles.hotelImg}
                        />
                      ) : (
                        <View style={[styles.hotelImg, { backgroundColor: colors.line }]} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.hotelName} numberOfLines={1}>
                          {h.name}
                        </Text>
                        <Text style={styles.hint}>
                          {h.rating != null ? `★ ${Number(h.rating).toFixed(1)}` : ''}
                        </Text>
                        <Text style={styles.hotelPrice}>
                          {Math.round(h.hotel_pp || 0)} € / pers.
                        </Text>
                      </View>
                    </Pressable>
                  )
                })}
              </ScrollView>
            )}
            {!loadingHotels && options.length > 0 && (
              <Pressable
                onPress={() => void finalize(selected)}
                style={[styles.cta, { marginTop: 12 }]}
                disabled={!selected || creating}
              >
                <Text style={styles.ctaText}>
                  {creating ? 'Création…' : 'Continuer avec cet hôtel'}
                </Text>
              </Pressable>
            )}
            <Pressable onPress={() => setStep(1)}>
              <Text style={styles.cancel}>Retour</Text>
            </Pressable>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.title}>Voyage enregistré</Text>
            <Text style={styles.sub}>
              {city} · {totalPp} € / pers.
              {selected ? ' (vol + hôtel)' : ' (vol)'}
            </Text>
            <Pressable
              onPress={() => void Linking.openURL(flightUrl)}
              style={styles.cta}
            >
              <Text style={styles.ctaText}>Réserver le vol</Text>
            </Pressable>
            {selected && draftToken ? (
              <Pressable
                onPress={async () => {
                  const url = `${getWebOrigin()}/trip/${draftToken}?book_hotel=1`
                  await WebBrowser.openBrowserAsync(url)
                }}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>Réserver l’hôtel</Text>
              </Pressable>
            ) : null}
            {draftToken ? (
              <Pressable
                onPress={async () => {
                  const url = `${getWebOrigin()}/trip/${draftToken}`
                  await WebBrowser.openBrowserAsync(url)
                  onClose()
                }}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>Ouvrir Mon voyage</Text>
              </Pressable>
            ) : null}
            {onSaveFavorite ? (
              <Pressable onPress={onSaveFavorite}>
                <Text style={styles.cancel}>Ajouter aux favoris</Text>
              </Pressable>
            ) : null}
          </>
        )}

        <Pressable onPress={onClose}>
          <Text style={styles.cancel}>Fermer</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(12,18,34,0.5)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 10,
  },
  stepLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    color: colors.ink,
    letterSpacing: -0.5,
  },
  sub: {
    marginTop: 6,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    marginBottom: 10,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginBottom: 14,
    lineHeight: 18,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  ctaText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  secondary: {
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.canvas,
    marginBottom: 8,
  },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  cancel: {
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    paddingVertical: 10,
  },
  loadingBox: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  link: { fontFamily: fonts.bold, color: colors.primary, fontSize: 14 },
  hotelRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 10,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.line,
    marginBottom: 8,
  },
  hotelActive: { borderColor: colors.primary, backgroundColor: colors.canvas },
  hotelImg: { width: 72, height: 72, borderRadius: 12 },
  hotelName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  hotelPrice: {
    fontFamily: fonts.extrabold,
    fontSize: 14,
    color: colors.primary,
    marginTop: 4,
  },
})
