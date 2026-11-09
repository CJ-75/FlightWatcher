import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import type { AuthTrigger, PendingAction } from '@flightwatcher/shared'
import { AuthSheet } from './AuthSheet'

type OpenOpts = {
  trigger: AuthTrigger
  inviteFirstName?: string | null
  pending?: PendingAction | null
  onAuthenticated?: () => void
}

type AuthSheetApi = {
  openAuthSheet: (opts: OpenOpts) => void
  closeAuthSheet: () => void
}

const Ctx = createContext<AuthSheetApi | null>(null)

export function useAuthSheet(): AuthSheetApi {
  const ctx = useContext(Ctx)
  if (!ctx) {
    return {
      openAuthSheet: () => console.warn('[AuthSheet] host missing'),
      closeAuthSheet: () => {},
    }
  }
  return ctx
}

export function AuthSheetHost({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<OpenOpts>({ trigger: 'already_account' })

  const openAuthSheet = useCallback((next: OpenOpts) => {
    setOpts(next)
    setOpen(true)
  }, [])

  const closeAuthSheet = useCallback(() => setOpen(false), [])

  const api = useMemo(
    () => ({ openAuthSheet, closeAuthSheet }),
    [openAuthSheet, closeAuthSheet],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      <AuthSheet
        open={open}
        trigger={opts.trigger}
        inviteFirstName={opts.inviteFirstName}
        pending={opts.pending}
        onClose={closeAuthSheet}
        onAuthenticated={opts.onAuthenticated}
      />
    </Ctx.Provider>
  )
}
