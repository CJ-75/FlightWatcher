/** Next-only store URLs — mirror SPA defaults until env is set. */

export function iosStoreUrl(): string {
  return (
    process.env.NEXT_PUBLIC_IOS_APP_STORE_URL?.trim() ||
    'https://apps.apple.com/app/waypop'
  )
}

export function androidStoreUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ANDROID_PLAY_STORE_URL?.trim() ||
    'https://play.google.com/store/apps/details?id=com.waypop.app'
  )
}
