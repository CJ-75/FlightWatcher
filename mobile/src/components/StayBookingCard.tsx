import React, { type ReactNode } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { BedIcon } from './UiIcons'
import { colors, fonts, radius } from '../theme'

export type StayBookingBadge = {
  label: string
  tone: string
  soft: string
}

type Props = {
  photo?: string | null
  kicker?: string
  title: string
  subtitle?: string | null
  details?: string | null
  confirmationCode?: string | null
  priceLabel?: string | null
  badge: StayBookingBadge
  footer?: ReactNode
  onPress?: () => void
  style?: StyleProp<ViewStyle>
  emptyIcon?: ReactNode
}

/** Same row UI as Mes réservations — thumb + badge + body + actions. */
export function StayBookingCard({
  photo,
  kicker,
  title,
  subtitle,
  details,
  confirmationCode,
  priceLabel,
  badge,
  footer,
  onPress,
  style,
  emptyIcon,
}: Props) {
  const body = (
    <>
      <View style={styles.thumb}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.thumbImage} />
        ) : (
          <View style={styles.thumbEmpty}>
            {emptyIcon || <BedIcon size={22} color={colors.faint} />}
          </View>
        )}
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.city} numberOfLines={1}>
            {kicker || 'Séjour'}
          </Text>
          <View style={[styles.badge, { backgroundColor: badge.soft }]}>
            <Text style={[styles.badgeText, { color: badge.tone }]}>
              {badge.label}
            </Text>
          </View>
        </View>

        <Text style={styles.hotel} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.dates} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {details ? (
          <Text style={styles.details} numberOfLines={2}>
            {details}
          </Text>
        ) : null}

        {confirmationCode ? (
          <View style={styles.codeRow}>
            <Text style={styles.codeLabel}>Réf.</Text>
            <Text style={styles.codeValue} numberOfLines={1}>
              {confirmationCode}
            </Text>
          </View>
        ) : null}

        <View style={styles.rowFooter}>
          {priceLabel ? (
            <Text style={styles.price}>{priceLabel}</Text>
          ) : (
            <View />
          )}
          {footer ? <View style={styles.rowActions}>{footer}</View> : null}
        </View>
      </View>
    </>
  )

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed, style]}
      >
        {body}
      </Pressable>
    )
  }

  return <View style={[styles.row, style]}>{body}</View>
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 12,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    marginBottom: 14,
  },
  rowPressed: { opacity: 0.92 },
  thumb: {
    width: 92,
    height: 112,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.primarySoft,
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  rowBody: { flex: 1, minWidth: 0, justifyContent: 'space-between' },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  city: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.primaryDeep,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
  },
  hotel: {
    marginTop: 4,
    fontFamily: fonts.extrabold,
    fontSize: 16,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  dates: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.inkSoft,
  },
  details: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  codeRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.successSoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  codeLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.success,
  },
  codeValue: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.ink,
  },
  rowFooter: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  price: {
    fontFamily: fonts.extrabold,
    fontSize: 16,
    color: colors.ink,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
})

export const stayBookingLinkBtn = StyleSheet.create({
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
  },
  text: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primaryDeep,
  },
  invoice: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.successSoft,
  },
  invoiceText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: '#065F46',
  },
  cancel: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.dangerSoft,
  },
  cancelText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: '#9F1239',
  },
})
