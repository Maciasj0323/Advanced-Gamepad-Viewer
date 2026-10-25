import { useEffect, useState } from 'react'
import { useArtworkUrls } from './artworkStore'
import { chooseOverlayProfile, parseOverlayParams } from './overlayMode'
import Overlay from './Overlay'
import { normalizeProfile } from './profile'
import * as db from './storage'
import type { Profile } from './types'
import { useGamepadState } from './useGamepad'
import { useHeldInputs } from './useInput'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; profile: Profile | null; wanted: string | null; missing: boolean }

function readPadChoice(): string | null {
  try {
    return localStorage.getItem('padChoice') || null
  } catch {
    return null
  }
}

const noticeStyle = {
  position: 'fixed',
  left: 6,
  bottom: 6,
  maxWidth: '90vw',
  padding: '4px 10px',
  borderRadius: 6,
  background: '#000c',
  color: '#fff',
  font: '12px system-ui, sans-serif',
} as const

/**
 * The OBS view: only the overlay, no page around it, transparent background
 * (or the ?bg= color). Reads profiles from this browser's storage and never writes to it.
 */
export default function OverlayView() {
  const [params] = useState(() => parseOverlayParams(window.location.search))
  const [padChoice] = useState(readPadChoice)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const profile = state.status === 'ready' ? state.profile : null
  const urls = useArtworkUrls(profile)
  const pad = useGamepadState(padChoice, profile?.settings.deadzone ?? 0.25)
  const down = useHeldInputs()

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-overlay', '1')
    if (params.background) root.style.setProperty('--overlay-bg', params.background)
    return () => {
      root.removeAttribute('data-overlay')
      root.style.removeProperty('--overlay-bg')
    }
  }, [params])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const profiles = (await db.listProfiles()).map(normalizeProfile)
        const activeId = (await db.getActiveProfileId()) ?? null
        const { profile: chosen, missing } = chooseOverlayProfile(profiles, params.profile, activeId)
        if (!cancelled) {
          setState({ status: 'ready', profile: chosen, wanted: params.profile, missing })
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: `Could not read saved profiles: ${e instanceof Error ? e.message : String(e)}`,
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [params])

  let notice: string | null = null
  if (state.status === 'error') notice = state.message
  else if (state.status === 'ready' && !state.profile) {
    notice =
      'No profiles found in this browser. Open this app without "?overlay" in this same browser source, import your profile, then reload.'
  } else if (state.status === 'ready' && state.missing && state.profile) {
    notice = `Profile "${state.wanted ?? ''}" was not found here, showing "${state.profile.name}" instead.`
  }

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {profile && <Overlay profile={profile} pad={pad} down={down} urls={urls} compact fill />}
      {notice && <div style={noticeStyle}>{notice}</div>}
    </div>
  )
}
