import { useEffect, useRef, useState } from 'react'
import { emptyPadState, pickPad, readPadState, type PadState } from './gamepad'

export interface PadInfo {
  index: number
  id: string
}

function connectedPads(): Gamepad[] {
  try {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []
    return Array.from(pads).filter((p): p is Gamepad => !!p && p.connected)
  } catch {
    return [] // gamepad access blocked by the browser
  }
}

/** Lists connected controllers. Updates when one is plugged in or removed. */
export function useGamepadList(): PadInfo[] {
  const [list, setList] = useState<PadInfo[]>([])
  const last = useRef('')

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const next = connectedPads().map((p) => ({ index: p.index, id: p.id }))
      const signature = JSON.stringify(next)
      if (signature !== last.current) {
        last.current = signature
        setList(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return list
}

/**
 * Reads one controller every animation frame.
 * selectedId = the controller's id string, or null for Auto (prefers a known layout).
 * If the selected controller is not connected, it falls back to Auto.
 */
export function useGamepadState(selectedId: string | null, deadzone = 0.25): PadState {
  const [state, setState] = useState<PadState>(emptyPadState)
  const last = useRef('')

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const pads = connectedPads()
      const chosen = selectedId ? pads.find((p) => p.id === selectedId) : undefined
      const next = readPadState(chosen ?? pickPad(pads), deadzone)
      const signature = JSON.stringify(next)
      if (signature !== last.current) {
        last.current = signature
        setState(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [selectedId, deadzone])

  return state
}