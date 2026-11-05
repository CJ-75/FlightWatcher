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
  /** Planner hotel hero: carousel + previous overlay UI via `overlay`. */
  variant?: 'default' | 'hero'
  overlay?: React.ReactNode
  topRight?: React.ReactElement | null
  bottomLeft?: React.ReactElement | null
  onImageError?: () => void
  /** Lock parent vertical ScrollView while the user swipes photos. */
  onHorizontalGesture?: (active: boolean) => void
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
  variant = 'default',
  overlay,
  topRight,
  bottomLeft,
  onImageError,
  onHorizontalGesture,
}: HotelPhotoGalleryProps) {
  const insets = useSafeAreaInsets()
  const listRef = useRef<FlatList>(null)
  const lightboxRef = useRef<FlatList>(null)
  const loadedKeyRef = useRef<string | null>(null)
  /** True only while lightbox should stay open — blocks scroll-end reopen. */
  const lightboxOpenRef = useRef(false)
  const ignoreOpenUntilRef = useRef(0)
  const blockHeroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heroMovedRef = useRef(false)
  const gestureActiveRef = useRef(false)
  const [photos, setPhotos] = useState<HotelGalleryPhoto[]>(() =>
    toPhotos([...(seedPhotos || []), seedPhoto]),
  )
  const [index, setIndex] = useState(0)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [blockHero, setBlockHero] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pageWidth, setPageWidth] = useState(SCREEN_W)
  const isHero = variant === 'hero'
  const heroHeight = Math.max(height, 280)

  const setGestureActive = useCallback(
    (active: boolean) => {
      if (gestureActiveRef.current === active) return
      gestureActiveRef.current = active
      onHorizontalGesture?.(active)
    },
    [onHorizontalGesture],
  )

  const seedKey = [...(seedPhotos || []), seedPhoto || ''].join('|')

  useEffect(() => {
    const seeds = toPhotos([...(seedPhotos || []), seedPhoto])
    const hid = (hotelId || '').trim()
    const key = `${hid}|${seedKey}`

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
      if (blockHeroTimerRef.current) clearTimeout(blockHeroTimerRef.current)
    },
    [],
  )

  const onMomentum = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x
      const i = Math.round(x / Math.max(1, pageWidth))
      setIndex(Math.max(0, Math.min(i, photos.length - 1)))
      setGestureActive(false)
    },
    [pageWidth, photos.length, setGestureActive],
  )

  const closeLightbox = useCallback(() => {
    // Mark closed first so FlatList unmount scroll events cannot reopen.
    lightboxOpenRef.current = false
    ignoreOpenUntilRef.current = Date.now() + 1000
    setGestureActive(false)
    setBlockHero(true)
    if (blockHeroTimerRef.current) clearTimeout(blockHeroTimerRef.current)
    blockHeroTimerRef.current = setTimeout(() => setBlockHero(false), 1000)
    setLightbox(null)
  }, [setGestureActive])

  const openLightbox = useCallback(
    (i: number) => {
      if (lightboxOpenRef.current) return
      if (blockHero || Date.now() < ignoreOpenUntilRef.current) return
      if (heroMovedRef.current) return
      lightboxOpenRef.current = true
      setGestureActive(false)
      setLightbox(i)
      requestAnimationFrame(() => {
        if (!lightboxOpenRef.current) return
        lightboxRef.current?.scrollToIndex({ index: i, animated: false })
      })
    },
    [blockHero, setGestureActive],
  )

  if (!photos.length) return null

  const count = photos.length
  const visible = Math.min(count, 24)
  const dots = Math.min(visible, 8)
  const lightboxOpen = lightbox != null
  const slideW = pageWidth
  const slideH = isHero ? heroHeight : height

  return (
    <>
      <View
        style={[styles.hero, { height: slideH }, isHero && styles.heroRounded]}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width)
          if (w > 0 && w !== pageWidth) setPageWidth(w)
        }}
      >
        <FlatList
          ref={listRef}
          data={photos.slice(0, 24)}
          keyExtractor={(item, i) => `${item.url}-${i}`}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          directionalLockEnabled
          disableIntervalMomentum
          decelerationRate="fast"
          bounces={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, i) => ({
            length: slideW,
            offset: slideW * i,
            index: i,
          })}
          onScrollBeginDrag={() => {
            heroMovedRef.current = true
            setGestureActive(true)
          }}
          onScrollEndDrag={(e) => {
            const { velocity } = e.nativeEvent
            // Keep parent locked until momentum settles for a snappy page snap.
            if (!velocity?.x || Math.abs(velocity.x) < 0.05) setGestureActive(false)
          }}
          onMomentumScrollEnd={onMomentum}
          renderItem={({ item, index: i }) => (
            <Pressable
              disabled={blockHero}
              delayPressIn={120}
              onPressIn={() => {
                heroMovedRef.current = false
              }}
              onPress={() => openLightbox(i)}
              style={{ width: slideW, height: slideH }}
            >
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
          colors={
            isHero
              ? ['rgba(31,16,9,0.15)', 'rgba(31,16,9,0.55)', 'rgba(31,16,9,0.94)']
              : ['rgba(12,18,34,0.35)', 'transparent', 'rgba(12,18,34,0.78)']
          }
          locations={isHero ? [0, 0.4, 1] : [0, 0.35, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {topRight ? (
          <View style={styles.topRight} pointerEvents="box-none">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {topRight as any}
          </View>
        ) : null}
        {!isHero && bottomLeft ? (
          <View style={styles.bottomLeft} pointerEvents="box-none">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {bottomLeft as any}
          </View>
        ) : null}

        <View style={[styles.counter, isHero && styles.counterHero]}>
          <Text style={styles.counterText}>
            {loading ? '…' : `${index + 1}/${visible}`}
          </Text>
        </View>

        {!isHero ? (
          <Pressable
            disabled={blockHero}
            onPress={() => openLightbox(index)}
            style={styles.seeAll}
            hitSlop={8}
          >
            <Text style={styles.seeAllText}>Photos</Text>
          </Pressable>
        ) : null}

        {count > 1 ? (
          <View
            style={[styles.dots, isHero && styles.dotsHero]}
            pointerEvents="none"
          >
            {Array.from({ length: dots }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === Math.min(index, dots - 1) && styles.dotActive]}
              />
            ))}
          </View>
        ) : null}

        {isHero && overlay ? (
          <View style={styles.heroOverlay} pointerEvents="box-none">
            {overlay}
          </View>
        ) : null}

        {blockHero ? (
          <View style={[StyleSheet.absoluteFill, styles.heroBlock]} pointerEvents="auto" />
        ) : null}
      </View>

      <Modal
        visible={lightboxOpen}
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
              onPressIn={closeLightbox}
              style={styles.closeBtn}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Fermer la galerie"
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
            directionalLockEnabled
            disableIntervalMomentum
            decelerationRate="fast"
            bounces={false}
            overScrollMode="never"
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={lightbox ?? 0}
            getItemLayout={(_, i) => ({
              length: SCREEN_W,
              offset: SCREEN_W * i,
              index: i,
            })}
            onMomentumScrollEnd={(e) => {
              // Critical: ignore scroll events while / after closing — they were
              // reopening the gallery on Séjours → fiche.
              if (!lightboxOpenRef.current) return
              const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W)
              setLightbox(Math.max(0, Math.min(i, count - 1)))
            }}
            onScrollToIndexFailed={(info) => {
              if (!lightboxOpenRef.current) return
              setTimeout(() => {
                if (!lightboxOpenRef.current) return
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
                  if (!lightboxOpenRef.current) return
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
  heroRounded: {
    borderRadius: 24,
  },
  heroBlock: {
    zIndex: 20,
    backgroundColor: 'transparent',
  },
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
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
  counterHero: {
    top: 14,
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
  dotsHero: {
    top: 16,
    bottom: undefined,
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
