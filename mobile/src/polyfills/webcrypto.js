/**
 * Expo Go / RN often lack WebCrypto.subtle — supabase-js then falls back to
 * "plain" PKCE which Auth rejects. Polyfill with expo-crypto before any
 * Supabase client is created.
 */
import * as ExpoCrypto from 'expo-crypto'

const g = globalThis

if (!g.crypto) {
  g.crypto = {}
}

if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = (typedArray) => ExpoCrypto.getRandomValues(typedArray)
}

if (typeof g.crypto.randomUUID !== 'function' && typeof ExpoCrypto.randomUUID === 'function') {
  g.crypto.randomUUID = () => ExpoCrypto.randomUUID()
}

if (!g.crypto.subtle || typeof g.crypto.subtle.digest !== 'function') {
  g.crypto.subtle = {
    ...(g.crypto.subtle || {}),
    digest: async (algorithm, data) => {
      const name = typeof algorithm === 'string' ? algorithm : algorithm?.name
      if (String(name).toUpperCase().replace('-', '') !== 'SHA256') {
        throw new Error(`Unsupported digest algorithm: ${name}`)
      }
      const bytes =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, bytes)
    },
  }
}
