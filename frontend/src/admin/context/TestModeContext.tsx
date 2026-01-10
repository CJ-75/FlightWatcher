/**
 * Contexte pour gérer le mode test (injection de fausses données)
 */
import { createContext, useContext, useState, ReactNode } from 'react'

interface TestModeContextType {
  isTestMode: boolean
  toggleTestMode: () => void
}

const TestModeContext = createContext<TestModeContextType | undefined>(undefined)

export function TestModeProvider({ children }: { children: ReactNode }) {
  const [isTestMode, setIsTestMode] = useState(() => {
    // Récupérer depuis localStorage au démarrage
    const saved = localStorage.getItem('admin_test_mode')
    return saved === 'true'
  })

  const toggleTestMode = () => {
    const newValue = !isTestMode
    setIsTestMode(newValue)
    localStorage.setItem('admin_test_mode', String(newValue))
    // Déclencher un événement personnalisé pour notifier les autres composants
    window.dispatchEvent(new Event('testModeChanged'))
  }

  return (
    <TestModeContext.Provider value={{ isTestMode, toggleTestMode }}>
      {children}
    </TestModeContext.Provider>
  )
}

export function useTestMode() {
  const context = useContext(TestModeContext)
  if (context === undefined) {
    throw new Error('useTestMode must be used within TestModeProvider')
  }
  return context
}

