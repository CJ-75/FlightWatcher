import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { saveOnboardingPrefs } from '@flightwatcher/shared'

type Api = {
  /** Force full-screen onboarding (même flux que 1er lancement). */
  replayOnboarding: () => Promise<void>
  forceOnboarding: boolean
  clearForceOnboarding: () => void
}

const Ctx = createContext<Api | null>(null)

export function OnboardingGateProvider({ children }: { children: React.ReactNode }) {
  const [forceOnboarding, setForce] = useState(false)

  const replayOnboarding = useCallback(async () => {
    await saveOnboardingPrefs({ onboardingCompletedAt: null })
    setForce(true)
  }, [])

  const clearForceOnboarding = useCallback(() => setForce(false), [])

  const api = useMemo(
    () => ({ replayOnboarding, forceOnboarding, clearForceOnboarding }),
    [replayOnboarding, forceOnboarding, clearForceOnboarding],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useOnboardingGate(): Api {
  const ctx = useContext(Ctx)
  if (!ctx) {
    return {
      replayOnboarding: async () => {},
      forceOnboarding: false,
      clearForceOnboarding: () => {},
    }
  }
  return ctx
}
