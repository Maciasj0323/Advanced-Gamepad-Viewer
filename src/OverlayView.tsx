import { useEffect, useState } from 'react'
import { useArtworkUrls } from './artworkStore'
import { prepareImport } from './backup'
import { watchedInputs } from './helperClient'
import { chooseOverlayProfile, parseOverlayParams, readEmbeddedOverlay } from './overlayMode'
import Overlay from './Overlay'
import { normalizeProfile } from './profile'
import { decodeShareToken, readShareToken } from './shareLink'
import * as db from './storage'
import type { Profile } from './types'
import { useGamepadState } from './useGamepad'
import { inputTracker, useHeldInputs } from './useInput'
import { useHelper } from './useHelper'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      source: 'link' | 'storage'
      profile: Profile | null
      message: string | null
      linkUrls: Record<string, string>
    }

function readPadChoice(): string | null {
  try {
    return localStorage.getItem('padChoice') || null
  } catch {
    return null
  }
}

const noticeStyle = {
  position: 'fixed',
  left: 8,
  bottom: 8,
  maxWidth: '92vw',
  padding: '6px 12px',
  borderRadius: 6,
  background: '#000d',
  color: '#fff',
  font: '14px/1.4 system-ui, sans-serif',
} as const

/**
 * The OBS view: only the overlay, on a transparent (or ?bg=) background.
 * A link with #d=... carries the whole profile and its images, so nothing has
 * to be saved in OBS. A link with ?profile=NAME reads this browser's saved profiles.
 * Neither way ever writes to storage.
 */
export default function OverlayView() {
  const [params] = useState(() => parseOverlayParams(window.location.search))
  const [shareToken] = useState(
    () => readShareToken(window.location.hash) ?? readEmbeddedOverlay()?.token ?? null,
  )
  const [padChoice] = useState(readPadChoice)
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const profile = state.status === 'ready' ? state.profile : null
  const storeUrls = useArtworkUrls(state.status === 'ready' && state.source === 'storage' ? profile : null)
  const urls = state.status === 'ready' && state.source === 'link' ? state.linkUrls : storeUrls
  const pad = useGamepadState(padChoice, profile?.settings.deadzone ?? 0.25)
  const down = useHeldInputs()
  const [helper] = useState(() => params.helper ?? readEmbeddedOverlay()?.helper ?? null)
  useHelper(helper, profile ? watchedInputs(profile.buttons) : [], inputTracker)

  useEffect(() => {
    let cancelled = false
    const made: string[] = []
    void (async () => {
      try {
        if (shareToken) {
          const decoded = await decodeShareToken(shareToken)
          if ('error' in decoded) {
            if (!cancelled) setState({ status: 'error', message: decoded.error })
            return
          }
          const prepared = prepareImport(decoded.file, [])
          const linkUrls: Record<string, string> = {}
          for (const rec of prepared.artwork) {
            const url = URL.createObjectURL(new Blob([rec.data], { type: rec.mime }))
            made.push(url)
            linkUrls[rec.id] = url
          }
          if (!cancelled) {
            setState({
              status: 'ready',
              source: 'link',
              profile: prepared.profiles[0] ?? null,
              message:
                prepared.skippedImages > 0
                  ? `${prepared.skippedImages} image(s) in this link could not be used.`
                  : null,
              linkUrls,
            })
          }
          return
        }

        const profiles = (await db.listProfiles()).map(normalizeProfile)
        const activeId = (await db.getActiveProfileId()) ?? null
        const { profile: chosen, missing } = chooseOverlayProfile(profiles, params.profile, activeId)
        let message: string | null = null
        if (profiles.length === 0) {
          message =
            'No profiles are saved in this browser. Use the self-contained overlay link from the app, which needs nothing saved here.'
        } else if (missing) {
          message = `Profile "${params.profile ?? ''}" was not found in this browser. Saved here: ${profiles
            .map((p) => `"${p.name}"`)
            .join(', ')}. Use the self-contained overlay link from the app instead.`
        }
        if (!cancelled) setState({ status: 'ready', source: 'storage', profile: chosen, message, linkUrls: {} })
      } catch (e) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: `Could not load the overlay: ${e instanceof Error ? e.message : String(e)}`,
          })
        }
      }
    })()
    return () => {
      cancelled = true
      made.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [params, shareToken])

  const notice =
    state.status === 'error' ? state.message : state.status === 'ready' ? state.message : null

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {profile && <Overlay profile={profile} pad={pad} down={down} urls={urls} compact fill />}
      {notice && <div style={noticeStyle}>{notice}</div>}
    </div>
  )
}
