import { useEffect, useState } from 'react'
import { attachInputListeners, InputTracker } from './input'

/** One shared tracker for the whole app. */
export const inputTracker = new InputTracker()

/** Returns the set of keyboard/mouse inputs held right now; re-renders on change. */
export function useHeldInputs(): ReadonlySet<string> {
  const [down, setDown] = useState<ReadonlySet<string>>(() => inputTracker.snapshot())

  useEffect(() => {
    const stopListening = attachInputListeners(inputTracker)
    const unsubscribe = inputTracker.subscribe(() => setDown(inputTracker.snapshot()))
    return () => {
      unsubscribe()
      stopListening()
    }
  }, [])

  return down
}