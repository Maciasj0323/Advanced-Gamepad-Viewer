import { useEffect, useState } from 'react'
import { helperUrl, parseHelperMessage, type HelperConfig } from './helperClient'
import type { InputTracker } from './input'

export type HelperStatus = 'off' | 'connecting' | 'connected' | 'rejected'

/**
 * Connects to the input helper and feeds the inputs it reports into the tracker, so extra
 * buttons light up even when this window is not the one you are typing in.
 * Reconnects by itself, and lets go of every input if the connection drops.
 */
export function useHelper(
  config: HelperConfig | null,
  watch: readonly string[],
  tracker: InputTracker,
): HelperStatus {
  const [status, setStatus] = useState<Exclude<HelperStatus, 'off'>>('connecting')
  const address = config && watch.length > 0 ? helperUrl(config, watch) : ''
  const active = address !== '' && typeof EventSource !== 'undefined'

  useEffect(() => {
    if (!active) return
    const source = new EventSource(address)
    source.onopen = () => setStatus('connected')
    source.onmessage = (event: MessageEvent<string>) => {
      const m = parseHelperMessage(event.data)
      if (!m) return
      if (m.down) tracker.press(m.binding)
      else tracker.release(m.binding)
    }
    source.onerror = () => {
      tracker.clear()
      // CLOSED means the helper answered but refused (wrong code); otherwise it just isn't running yet.
      setStatus(source.readyState === EventSource.CLOSED ? 'rejected' : 'connecting')
    }
    return () => {
      source.close()
      tracker.clear()
    }
  }, [active, address, tracker])

  return active ? status : 'off'
}
