import { useEffect, useState } from 'react'

/**
 * True after first paint — use to defer API until shell (header + skeleton) is on screen.
 */
export function useShellReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return ready
}
