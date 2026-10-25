import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Image,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  StatusBar,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { HotelGalleryPhoto } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { colors, fonts, radius } from '../theme'

const SCREEN_W = Dimensions.get('window').width
const SCREEN_H = Dimensions.get('window').height

export type HotelPhotoGalleryProps = {
  hotelId?: string | null
  seedPhoto?: string | null
  seedPhotos?: string[]
  alt: string
  hotelName?: string
  cityLabel?: string
  height?: number
  topRight?: React.ReactElement | null
  bottomLeft?: React.ReactElement | null
  onImageError?: () => void
}

function toPhotos(urls: (string | undefined | null)[]): HotelGalleryPhoto[] {
  const out: HotelGalleryPhoto[] = []
  const seen = new Set<string>()
  for (const u of urls) {
    const url = (u || '').trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push({ url, thumb: url, order: out.length })
  }
  return out
}

export function HotelPhotoGallery({
  hotelId,
  seedPhoto,
  seedPhotos,
  alt,
  hotelName,
  cityLabel,
  height = Math.min(300, Math.round(SCREEN_W * 0.68)),
  topRight,
  bottomLeft,
  onImageError,
}: HotelPhotoGalleryProps) {
  const insets = useSafeAreaInsets()
  const listRef = useRef<FlatList>(null)
  const lightboxRef = useRef<FlatList>(null)
  const loadedKeyRef = useRef<string | null>(null)
  const guardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [photos, setPhotos] = useState<HotelGalleryPhoto[]>(() =>
    toPhotos([...(seedPhotos || []), seedPhoto]),
  )
  const [index, setIndex] = useState(0)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [closeGuard, setCloseGuard] = useState(false)
  const [loading, setLoading] = useState(false)

  const seedKey = [...(seedPhotos || []), seedPhoto || ''].join('|')

  useEffect(() => {
    const seeds = toPhotos([...(seedPhotos || []), seedPhoto])
    const hid = (hotelId || '').trim()
    const key = `${hid}|${seedKey}`

    // Skip reset/refetch when parent re-renders with same hotel (e.g. Modal close)
    if (loadedKeyRef.current === key) return

    setPhotos(seeds)
    setIndex(0)

    if (!hid || hid === 'primary') {
      loadedKeyRef.current = key
      return
    }

    let cancelled = false
    setLoading(true)
    void getApi()
      .getHotelGallery(hid, {
        language: 'fr',
        fallback: seedPhoto || seeds[0]?.url,
      })
      .then((res) => {
        if (cancelled) return
        const next = (res.photos || []).filter((p) => p?.url)
        if (next.length) setPhotos(next)
        else if (seeds.length) setPhotos(seeds)
        loadedKeyRef.current = key
      })
      .catch(() => {
        if (!cancelled && seeds.length) setPhotos(seeds)
        if (!cancelled) loadedKeyRef.current = key
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [hotelId, seedPhoto, seedKey])

  useEffect(
    () => () => {
      if (guardTimerRef.current) clearTimeout(guardTimerRef.current)
    },
    [],
  )

  const onMomentum = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x
    const i = Math.round(x / SCREEN_W)
    setIndex(Math.max(0, Math.min(i, photos.length - 1)))
  }, [photos.length])

  const closeLightbox = useCallback(() => {
    setLightbox(null)
    setCloseGuard(true)
    if (guardTimerRef.current) clearTimeout(guardTimerRef.current)
    guardTimerRef.current = setTimeout(() => setCloseGuard(false), 420)
  }, [])

  const openLightbox = (i: number) => {
    setLightbox(i)
    requestAnimationFrame(() => {
      lightboxRef.current?.scrollToIndex({ index: i, animated: false })
    })
  }

  if (!photos.length) return null

  const count = photos.length
  const dots = Math.min(count, 8)

  return (
    <>
      <View style={[styles.hero, { height }]}>
        <FlatList
          ref={listRef}
          data={photos.slice(0, 24)}
          keyExtractor={(item, i) => `${item.url}-${i}`}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentum}
          renderItem={({ item, index: i }) => (
            <Pressable onPress={() => openLightbox(i)} style={{ width: SCREEN_W, height }}>
              <Image
                source={{ uri: item.url }}
                style={styles.image}
                resizeMode="cover"
                onError={onImageError}
                accessibilityLabel={`${alt} ${i + 1}`}
              />
            </Pressable>
          )}
        />

        <LinearGradient
          colors={['rgba(12,18,34,0.35)', 'transparent', 'rgba(12,18,34,0.78)']}
          locations={[0, 0.35, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {topRight ? (
          <View style={styles.topRight} pointerEvents="box-none">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {topRight as any}
          </View>
        ) : null}
        {bottomLeft ? (
          <View style={styles.bottomLeft} pointerEvents="box-none">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {bottomLeft as any}
          </View>
        ) : null}

        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {loading ? '…' : `${index + 1}/${Math.min(count, 24)}`}
          </Text>
        </View>

        <Pressable
          onPress={() => openLightbox(index)}
          style={styles.seeAll}
          hitSlop={8}
        >
          <Text style={styles.seeAllText}>
            {count} photo{count > 1 ? 's' : ''}
          </Text>
        </Pressable>

        {count > 1 ? (
          <View style={styles.dots}>
            {Array.from({ length: dots }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === Math.min(index, dots - 1) && styles.dotActive]}
              />
            ))}
          </View>
        ) : null}
      </View>

      {closeGuard ? (
        <Modal visible transparent animationType="none" onRequestClose={() => setCloseGuard(false)}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCloseGuard(false)} />
        </Modal>
      ) : null}

      <Modal
        visible={lightbox != null}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={closeLightbox}
        statusBarTranslucent
      >
        <View style={[styles.lightbox, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          {Platform.OS === 'android' ? <StatusBar barStyle="light-content" /> : null}
          <View style={styles.lightboxHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.lightboxTitle} numberOfLines={1}>
                {hotelName || alt}
              </Text>
              {cityLabel ? (
                <Text style={styles.lightboxSub} numberOfLines={1}>
                  {cityLabel}
                </Text>
              ) : null}
            </View>
            <Text style={styles.lightboxCount}>
              {(lightbox ?? 0) + 1} / {count}
            </Text>
            <Pressable
              onPress={closeLightbox}
              style={styles.closeBtn}
              hitSlop={12}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <FlatList
            ref={lightboxRef}
            data={photos}
            keyExtractor={(item, i) => `lb-${item.url}-${i}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={lightbox ?? 0}
            getItemLayout={(_, i) => ({
              length: SCREEN_W,
              offset: SCREEN_W * i,
              index: i,
            })}
            onMomentumScrollEnd={(e) => {
              const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W)
              setLightbox(Math.max(0, Math.min(i, count - 1)))
            }}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                lightboxRef.current?.scrollToIndex({
                  index: info.index,
                  animated: false,
                })
              }, 50)
            }}
            renderItem={({ item }) => (
              <View style={styles.lightboxSlide}>
                <Image
                  source={{ uri: item.url }}
                  style={styles.lightboxImage}
                  resizeMode="contain"
                />
              </View>
            )}
          />

          <FlatList
            data={photos}
            horizontal
            keyExtractor={(item, i) => `th-${item.url}-${i}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbs}
            renderItem={({ item, index: i }) => (
              <Pressable
                onPress={() => {
                  setLightbox(i)
                  lightboxRef.current?.scrollToIndex({ index: i, animated: true })
                }}
                style={[styles.thumb, i === lightbox && styles.thumbActive]}
              >
                <Image
                  source={{ uri: item.thumb || item.url }}
                  style={styles.thumbImg}
                  resizeMode="cover"
                />
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  hero: {
    width: '100%',
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  topRight: {
    position: 'absolute',
    right: 16,
    top: 0,
    zIndex: 3,
  },
  bottomLeft: {
    position: 'absolute',
    left: 20,
    right: 100,
    bottom: 36,
    zIndex: 2,
  },
  counter: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(12,18,34,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    zIndex: 3,
  },
  counterText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  seeAll: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    zIndex: 3,
  },
  seeAllText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.ink,
  },
  dots: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    zIndex: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    width: 16,
    backgroundColor: colors.white,
  },
  lightbox: {
    flex: 1,
    backgroundColor: '#0C1222',
  },
  lightboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  lightboxTitle: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  lightboxSub: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.medium,
    fontSize: 12,
    marginTop: 1,
  },
  lightboxCount: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: fonts.semibold,
    fontSize: 13,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: colors.white,
    fontSize: 26,
    fontFamily: fonts.bold,
    marginTop: -2,
  },
  lightboxSlide: {
    width: SCREEN_W,
    height: SCREEN_H * 0.62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: {
    width: SCREEN_W,
    height: '100%',
  },
  thumbs: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  thumb: {
    width: 72,
    height: 54,
    borderRadius: 10,
    overflow: 'hidden',
    opacity: 0.5,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbActive: {
    opacity: 1,
    borderColor: colors.white,
    transform: [{ scale: 1.04 }],
  },
  thumbImg: { width: '100%', height: '100%' },
})
