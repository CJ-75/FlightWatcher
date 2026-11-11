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
import {
  getHotelGalleryCached,
  peekHotelGallery,
} from '../lib/hotelGalleryCache'
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
  const unlockParentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gestureActiveRef = useRef(false)
  /** True only after a real horizontal drag this touch (not a tap). */
  const dragActiveRef = useRef(false)
  const touchStartRef = useRef({ x: 0, y: 0 })
  const [photos, setPhotos] = useState<HotelGalleryPhoto[]>(() =>
    toPhotos([...(seedPhotos || []), seedPhoto]),
  )
  const [index, setIndex] = useState(0)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [blockHero, setBlockHero] = useState(false)
  const [pageWidth, setPageWidth] = useState(SCREEN_W)
  const isHero = variant === 'hero'
  /** Planner hotel hero: first frame ASAP, never more than 3 slides. */
  const heroPhotoCap = 3
  const heroHeight = Math.max(height, 280)

  const capPhotos = useCallback(
    (rows: HotelGalleryPhoto[]) =>
      isHero ? rows.filter((p) => p?.url).slice(0, heroPhotoCap) : rows,
    [isHero],
  )

  const setGestureActive = useCallback(
    (active: boolean) => {
      if (gestureActiveRef.current === active) return
      gestureActiveRef.current = active
      onHorizontalGesture?.(active)
    },
    [onHorizontalGesture],
  )

  const clearUnlockParentTimer = useCallback(() => {
    if (unlockParentTimerRef.current) {
      clearTimeout(unlockParentTimerRef.current)
      unlockParentTimerRef.current = null
    }
  }, [])

  /** Last-resort unlock if momentum/end events never fire (stuck parent). */
  const armUnlockParent = useCallback(
    (ms = 2500) => {
      clearUnlockParentTimer()
      unlockParentTimerRef.current = setTimeout(() => {
        unlockParentTimerRef.current = null
        setGestureActive(false)
      }, ms)
    },
    [clearUnlockParentTimer, setGestureActive],
  )

  const seedKey = [...(seedPhotos || []), seedPhoto || ''].join('|')

  useEffect(() => {
    const rawSeeds = toPhotos([...(seedPhotos || []), seedPhoto])
    const seeds = capPhotos(rawSeeds)
    const hid = (hotelId || '').trim()
    const key = `${hid}|${seedKey}|${isHero ? heroPhotoCap : 'all'}`

    if (loadedKeyRef.current === key) return

    // Instant 1/X from seeds (or memory cache) — never blank the counter on fetch.
    const cached = hid
      ? peekHotelGallery(hid, 'fr', isHero ? heroPhotoCap : undefined)
      : null
    const initial = capPhotos(
      cached?.photos?.length && cached.photos.length >= seeds.length
        ? cached.photos
        : seeds.length
          ? seeds
          : cached?.photos || [],
    )
    setPhotos(initial)
    setIndex(0)
    // Decode first frame immediately (hero paint).
    const firstUrl = initial[0]?.url || seeds[0]?.url
    if (firstUrl) {
      void Image.prefetch(firstUrl).catch(() => undefined)
    }

    if (!hid || hid === 'primary' || hid === 'seed') {
      loadedKeyRef.current = key
      return
    }

    // Hero: seed #1 now. TripDetail owns the single gallery HTTP after trip-items;
    // we only merge from memory when that prefetch lands (no duplicate fetch).
    if (isHero && seeds.length >= 1) {
      loadedKeyRef.current = key
      if (seeds.length >= heroPhotoCap) return
      let cancelled = false
      const mergeFromPeek = () => {
        if (cancelled) return true
        const hit = peekHotelGallery(hid, 'fr', heroPhotoCap)
        const next = capPhotos((hit?.photos || []).filter((p) => p?.url))
        if (!next.length) return false
        const seen = new Set(seeds.map((p) => p.url))
        const merged = [...seeds]
        for (const p of next) {
          if (seen.has(p.url)) continue
          seen.add(p.url)
          merged.push(p)
          if (merged.length >= heroPhotoCap) break
        }
        if (merged.length > seeds.length) setPhotos(merged)
        return merged.length >= heroPhotoCap || hit?.partial === false
      }
      mergeFromPeek()
      const t1 = setTimeout(() => {
        if (!mergeFromPeek()) mergeFromPeek()
      }, 700)
      const t2 = setTimeout(() => {
        mergeFromPeek()
      }, 1600)
      return () => {
        cancelled = true
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }

    if (cached?.photos?.length && cached.photos.length > seeds.length) {
      loadedKeyRef.current = key
      return
    }

    let cancelled = false
    let softTimer: ReturnType<typeof setTimeout> | null = null

    const applyGallery = (res: {
      photos?: HotelGalleryPhoto[]
      partial?: boolean
    }) => {
      if (cancelled) return
      const next = capPhotos((res.photos || []).filter((p) => p?.url))
      if (next.length) setPhotos(next)
      else if (seeds.length) setPhotos(seeds)
      loadedKeyRef.current = key
      // Non-hero: pool-first response may grow via LiteAPI soft refetch.
      if (!isHero && res.partial && next.length) {
        softTimer = setTimeout(() => {
          if (cancelled) return
          void getHotelGalleryCached(hid, {
            language: 'fr',
            fallback: seedPhoto || seeds[0]?.url,
            force: true,
          })
            .then((again) => {
              if (cancelled) return
              const more = (again.photos || []).filter((p) => p?.url)
              if (more.length > next.length) setPhotos(more)
            })
            .catch(() => undefined)
        }, 2200)
      }
    }

    void getHotelGalleryCached(hid, {
      language: 'fr',
      fallback: seedPhoto || seeds[0]?.url,
      limit: isHero ? heroPhotoCap : undefined,
    })
      .then(applyGallery)
      .catch(() => {
        if (!cancelled && seeds.length) setPhotos(seeds)
        if (!cancelled) loadedKeyRef.current = key
      })

    return () => {
      cancelled = true
      if (softTimer) clearTimeout(softTimer)
    }
  }, [hotelId, seedPhoto, seedKey, isHero, capPhotos])

  useEffect(
    () => () => {
      if (blockHeroTimerRef.current) clearTimeout(blockHeroTimerRef.current)
      if (unlockParentTimerRef.current) clearTimeout(unlockParentTimerRef.current)
    },
    [],
  )

  const onMomentum = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x
      const i = Math.round(x / Math.max(1, pageWidth))
      setIndex(Math.max(0, Math.min(i, photos.length - 1)))
      clearUnlockParentTimer()
      setGestureActive(false)
    },
    [pageWidth, photos.length, setGestureActive, clearUnlockParentTimer],
  )

  const closeLightbox = useCallback(() => {
    // Mark closed first so FlatList unmount scroll events cannot reopen.
    lightboxOpenRef.current = false
    ignoreOpenUntilRef.current = Date.now() + 1000
    clearUnlockParentTimer()
    setGestureActive(false)
    setBlockHero(true)
    if (blockHeroTimerRef.current) clearTimeout(blockHeroTimerRef.current)
    blockHeroTimerRef.current = setTimeout(() => setBlockHero(false), 1000)
    setLightbox(null)
  }, [setGestureActive, clearUnlockParentTimer])

  const openLightbox = useCallback(
    (i: number) => {
      if (lightboxOpenRef.current) return
      if (blockHero || Date.now() < ignoreOpenUntilRef.current) return
      if (dragActiveRef.current) return
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
          onTouchStart={(e) => {
            // Full-bleed swipe surface: no Pressable on slides, claim parent early.
            dragActiveRef.current = false
            const t = e.nativeEvent.touches[0] || e.nativeEvent
            touchStartRef.current = { x: t.pageX, y: t.pageY }
            setGestureActive(true)
            armUnlockParent(2500)
          }}
          onTouchEnd={(e) => {
            if (dragActiveRef.current) return
            clearUnlockParentTimer()
            setGestureActive(false)
            const t = e.nativeEvent.changedTouches[0] || e.nativeEvent
            const dx = Math.abs(t.pageX - touchStartRef.current.x)
            const dy = Math.abs(t.pageY - touchStartRef.current.y)
            // Tap only — keep the whole image free for horizontal paging.
            if (dx < 10 && dy < 10) openLightbox(index)
          }}
          onTouchCancel={() => {
            if (!dragActiveRef.current) {
              clearUnlockParentTimer()
              setGestureActive(false)
            }
          }}
          onScrollBeginDrag={() => {
            dragActiveRef.current = true
            setGestureActive(true)
            armUnlockParent(2500)
          }}
          onScrollEndDrag={(e) => {
            const { velocity } = e.nativeEvent
            // Keep parent locked until momentum settles for a snappy page snap.
            if (!velocity?.x || Math.abs(velocity.x) < 0.05) {
              clearUnlockParentTimer()
              setGestureActive(false)
            } else {
              armUnlockParent(900)
            }
          }}
          onMomentumScrollEnd={onMomentum}
          renderItem={({ item, index: i }) => (
            <View
              style={{ width: slideW, height: slideH }}
              accessible
              accessibilityRole="image"
              accessibilityLabel={`${alt} ${i + 1}`}
            >
              <Image
                source={{ uri: item.url }}
                style={styles.image}
                resizeMode="cover"
                onError={onImageError}
                pointerEvents="none"
              />
            </View>
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

        {/* Compteur haut gauche — toujours 1/X dès les seeds (pas de « … » réseau). */}
        <View style={styles.topLeft} pointerEvents="none">
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {`${index + 1}/${visible}`}
            </Text>
          </View>
        </View>

        {topRight ? (
          <View style={styles.topRight} pointerEvents="box-none">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {topRight as any}
          </View>
        ) : null}
        {!isHero && bottomLeft ? (
          <View style={styles.bottomLeft} pointerEvents="none">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {bottomLeft as any}
          </View>
        ) : null}

        {!isHero ? (
          <View style={styles.photoChrome} pointerEvents="box-none">
            <Pressable
              disabled={blockHero}
              onPress={() => openLightbox(index)}
              style={styles.seeAll}
              hitSlop={8}
            >
              <Text style={styles.seeAllText}>Photos</Text>
            </Pressable>
          </View>
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
  topLeft: {
    position: 'absolute',
    left: 14,
    top: 12,
    zIndex: 3,
    justifyContent: 'center',
    minHeight: 44,
  },
  topRight: {
    position: 'absolute',
    right: 14,
    top: 12,
    zIndex: 3,
  },
  bottomLeft: {
    position: 'absolute',
    left: 20,
    right: 100,
    bottom: 36,
    zIndex: 2,
  },
  photoChrome: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    zIndex: 3,
  },
  counter: {
    backgroundColor: 'rgba(12,18,34,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  counterText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  seeAll: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
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
