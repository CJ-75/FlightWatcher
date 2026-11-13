import { createContext, useContext, type ReactNode } from 'react'
import { useImpersonation } from '../hooks/useImpersonation'

type ImpersonationApi = ReturnType<typeof useImpersonation>

const Ctx = createContext<ImpersonationApi | null>(null)

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const api = useImpersonation()
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useImpersonationContext(): ImpersonationApi {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error('useImpersonationContext must be used within ImpersonationProvider')
  }
  return ctx
}
