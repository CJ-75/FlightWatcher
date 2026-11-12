/**
 * Test mode désactivé (admin v2). Stub conservé pour imports legacy.
 */
import { createContext, useContext, type ReactNode } from 'react'

interface TestModeContextType {
  isTestMode: boolean
  toggleTestMode: () => void
}

const TestModeContext = createContext<TestModeContextType>({
  isTestMode: false,
  toggleTestMode: () => {
    console.warn('Admin test mode removed')
  },
})

export function TestModeProvider({ children }: { children: ReactNode }) {
  return (
    <TestModeContext.Provider value={{ isTestMode: false, toggleTestMode: () => undefined }}>
      {children}
    </TestModeContext.Provider>
  )
}

export function useTestMode() {
  return useContext(TestModeContext)
}
