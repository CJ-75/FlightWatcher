'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  clearPendingAction,
  configureOnboardingKv,
  createLocalStorageKV,
  getPendingAction,
  type AuthTrigger,
  type PendingAction,
} from '@waypop/shared'
import { auth } from '@/lib/auth'
import { setPopKept } from '@/lib/keptPops'
import { setSignedInCookie } from '@/lib/signedInCookie'
import { AuthLightbox } from './AuthLightbox'

type OpenOpts = {
  trigger: AuthTrigger
  inviteFirstName?: string | null
  pending?: PendingAction | null
  onAuthenticated?: () => void
}

type AuthSheetApi = {
  openAuthSheet: (opts: OpenOpts) => void
  closeAuthSheet: () => void
  /** True once client has checked session at least once. */
  ready: boolean
  signedIn: boolean
}

const Ctx = createContext<AuthSheetApi | null>(null)

let kvConfigured = false

function ensureKv() {
  if (kvConfigured || typeof window === 'undefined') return
  configureOnboardingKv(createLocalStorageKV())
  kvConfigured = true
}

export function useAuthSheet(): AuthSheetApi {
  const ctx = useContext(Ctx)
  if (ctx) return ctx
  return {
    openAuthSheet: () => {
      console.warn('[AuthHost] missing')
    },
    closeAuthSheet: () => {},
    ready: false,
    signedIn: false,
  }
}

async function resumePendingKeep(): Promise<boolean> {
  const pending = await getPendingAction()
  if (!pending || pending.type !== 'like_itinerary') return false
  const city = String(pending.payload?.city || '')
  const slug = String(pending.payload?.slug || '')
  const title = String(pending.payload?.title || '')
  if (!city || !slug) {
    await clearPendingAction()
    return false
  }
  const key = `${city}/${slug}`
  setPopKept(key, { city, slug, title }, true)
  await clearPendingAction()
  return true
}

export function AuthHost({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<OpenOpts>({ trigger: 'favorite' })
  const [ready, setReady] = useState(false)
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    ensureKv()
    let unsub = () => {}
    void (async () => {
      const user = await auth.getCurrentUser()
      setSignedIn(Boolean(user))
      setSignedInCookie(Boolean(user))
      setReady(true)
      if (user) {
        const did = await resumePendingKeep()
        if (did) {
          window.dispatchEvent(new CustomEvent('wp:kept-changed'))
        }
      }
    })()
    unsub = auth.onAuthStateChange((_event, session) => {
      const on = Boolean(session?.user)
      setSignedIn(on)
      setSignedInCookie(on)
      if (on) {
        void resumePendingKeep().then((did) => {
          if (did) window.dispatchEvent(new CustomEvent('wp:kept-changed'))
        })
      }
    })
    return () => unsub()
  }, [])

  const openAuthSheet = useCallback((next: OpenOpts) => {
    ensureKv()
    setOpts(next)
    setOpen(true)
  }, [])

  const closeAuthSheet = useCallback(() => setOpen(false), [])

  const api = useMemo(
    () => ({ openAuthSheet, closeAuthSheet, ready, signedIn }),
    [openAuthSheet, closeAuthSheet, ready, signedIn],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      <AuthLightbox
        open={open}
        trigger={opts.trigger}
        inviteFirstName={opts.inviteFirstName}
        pending={opts.pending}
        onClose={closeAuthSheet}
        onAuthenticated={() => {
          void resumePendingKeep().then((did) => {
            if (did) window.dispatchEvent(new CustomEvent('wp:kept-changed'))
            opts.onAuthenticated?.()
          })
        }}
      />
    </Ctx.Provider>
  )
}
