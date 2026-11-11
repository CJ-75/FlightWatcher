import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Image,
  Modal,
  Pressable,
  FlatList,
  StyleSheet,
  useWindowDimensions,
  Platform,
  StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts } from '../../theme'

type Props = {
  photos: string[]
  index: number | null
  title?: string | null
  onClose: () => void
  onIndexChange?: (i: number) => void
}

export function ParcoursPhotoLightbox({
  photos,
  index,
  title,
  onClose,
  onIndexChange,
}: Props) {
  const insets = useSafeAreaInsets()
  const { width: SCREEN_W } = useWindowDimensions()
  const listRef = useRef<FlatList>(null)
  const openRef = useRef(false)
  const [current, setCurrent] = useState(0)
  const open = index != null && photos.length > 0

  useEffect(() => {
    if (index == null) {
      openRef.current = false
      return
    }
    const i = Math.max(0, Math.min(index, photos.length - 1))
    openRef.current = true
    setCurrent(i)
    requestAnimationFrame(() => {
      if (!openRef.current) return
      listRef.current?.scrollToIndex({ index: i, animated: false })
    })
  }, [index, photos.length])

  const close = useCallback(() => {
    openRef.current = false
    onClose()
  }, [onClose])

  const go = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(i, photos.length - 1))
      setCurrent(next)
      onIndexChange?.(next)
      listRef.current?.scrollToIndex({ index: next, animated: true })
    },
    [onIndexChange, photos.length],
  )

  return (
    <Modal
      visible={open}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View
        style={[
          styles.root,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        {Platform.OS === 'android' ? (
          <StatusBar barStyle="light-content" />
        ) : null}
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {title ? (
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
          </View>
          <Text style={styles.count}>
            {current + 1} / {photos.length}
          </Text>
          <Pressable
            onPress={close}
            style={styles.closeBtn}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={photos}
          keyExtractor={(uri, i) => `lb-${uri}-${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          initialScrollIndex={Math.max(0, index ?? 0)}
          getItemLayout={(_, i) => ({
            length: SCREEN_W,
            offset: SCREEN_W * i,
            index: i,
          })}
          onMomentumScrollEnd={(e) => {
            if (!openRef.current) return
            const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W)
            const next = Math.max(0, Math.min(i, photos.length - 1))
            setCurrent(next)
            onIndexChange?.(next)
          }}
          onScrollToIndexFailed={(info) => {
            if (!openRef.current) return
            setTimeout(() => {
              if (!openRef.current) return
              listRef.current?.scrollToIndex({
                index: info.index,
                animated: false,
              })
            }, 50)
          }}
          renderItem={({ item }) => (
            <Pressable style={[styles.slide, { width: SCREEN_W }]} onPress={close}>
              <Image
                source={{ uri: item }}
                style={styles.slideImg}
                resizeMode="contain"
              />
            </Pressable>
          )}
        />

        {photos.length > 1 ? (
          <FlatList
            data={photos}
            horizontal
            keyExtractor={(uri, i) => `th-${uri}-${i}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbs}
            renderItem={({ item, index: i }) => (
              <Pressable
                onPress={() => go(i)}
                style={[styles.thumb, i === current && styles.thumbOn]}
              >
                <Image source={{ uri: item }} style={styles.thumbImg} />
              </Pressable>
            )}
          />
        ) : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0E0A08',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: '#FFF8F3',
  },
  count: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: 'rgba(255,248,243,0.7)',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontFamily: fonts.regular,
    fontSize: 26,
    lineHeight: 28,
    color: '#FFF8F3',
    marginTop: -2,
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideImg: {
    width: '100%',
    height: '100%',
  },
  thumbs: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 8,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    opacity: 0.65,
  },
  thumbOn: {
    borderColor: colors.primary,
    opacity: 1,
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
})
