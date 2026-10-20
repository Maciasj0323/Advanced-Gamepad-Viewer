import { useEffect, useState } from 'react'
import AdvancedOptions from './AdvancedOptions'
import { CONTROLLER_LIST } from './controllers'
import Overlay from './Overlay'
import { useProfiles } from './store'
import type { ControllerType } from './types'
import { useGamepadList, useGamepadState } from './useGamepad'
import { useHeldInputs } from './useInput'
import { useOnScreen } from './useOnScreen'
import { useArtwork, useArtworkUrls } from './artworkStore'

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* storage unavailable: the choice just won't be remembered */
  }
}

export default function App() {
  const s = useProfiles()
  const [padChoice, setPadChoice] = useState<string>(() => {
    try {
      return localStorage.getItem('padChoice') ?? ''
    } catch {
      return ''
    }
  })
  const pads = useGamepadList()
    const activeForArt = s.profiles.find((p) => p.id === s.activeId) ?? null
  const pad = useGamepadState(padChoice || null, activeForArt?.settings.deadzone ?? 0.25)
  const down = useHeldInputs()
  const urls = useArtworkUrls(activeForArt)
  const artError = useArtwork((st) => st.error)

  // Floating preview: shown only while the main overlay is scrolled out of view.
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null)
  const overlayVisible = useOnScreen(overlayEl)
  const [floating, setFloating] = useState(() => readFlag('floatingPreview', true))

  useEffect(() => {
    void s.init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!s.ready) return <p style={{ padding: 16 }}>Loading profiles…</p>
  const active = s.profiles.find((p) => p.id === s.activeId)
  if (!active) return null

  const ask = (label: string, initial = '') => window.prompt(label, initial)

  return (
    <div style={{ padding: 16, maxWidth: 760, margin: '0 auto', textAlign: 'left', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22 }}>Gamepad overlay</h1>

      {s.error && (
        <p role="alert" style={{ background: '#5a1d1d', color: '#fff', padding: 10, borderRadius: 4 }}>
          {s.error}{' '}
          <button onClick={s.dismissError}>Dismiss</button>
        </p>
      )}

        {artError && (
        <p role="alert" style={{ background: '#5a1d1d', color: '#fff', padding: 10, borderRadius: 4 }}>
          {artError}{' '}
          <button onClick={() => useArtwork.getState().dismissError()}>Dismiss</button>
        </p>
      )}

      <div style={{ maxWidth: 520, margin: '0 auto 16px' }}>
        <div ref={setOverlayEl}>
          <Overlay profile={active} pad={pad} down={down} urls={urls} />
        </div>
        <label style={{ display: 'block', textAlign: 'center', fontSize: 13, marginTop: 6 }}>
          Input device:{' '}
          <select
            value={pads.some((p) => p.id === padChoice) ? padChoice : ''}
            onChange={(e) => {
              setPadChoice(e.target.value)
              try {
                localStorage.setItem('padChoice', e.target.value)
              } catch {
                /* storage unavailable: choice just won't be remembered */
              }
            }}
          >
            <option value="">Auto (recommended)</option>
            {pads.map((p) => (
              <option key={p.index} value={p.id}>
                {p.id}
              </option>
            ))}
          </select>
        </label>
        <p style={{ fontSize: 12, opacity: 0.7, textAlign: 'center', margin: '4px 0' }}>
          Reading: {pad.id || 'no controller'} ({pad.mapped ? 'known layout' : 'unknown layout'})
        </p>
        <label style={{ display: 'block', textAlign: 'center', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={floating}
            onChange={(e) => {
              setFloating(e.target.checked)
              writeFlag('floatingPreview', e.target.checked)
            }}
          />{' '}
          Show a floating preview when the overlay is scrolled out of view
        </label>
      </div>

      <section style={{ marginBottom: 16 }}>
        <strong>Active profile: {active.name}</strong>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <select value={active.id} onChange={(e) => s.selectProfile(e.target.value)}>
            {s.profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button onClick={() => {
            const name = ask('Name for the new profile?')
            if (name) s.createProfile(name, 'xbox-one')
          }}>New</button>
          <button onClick={() => {
            const name = ask('Rename profile to?', active.name)
            if (name) s.renameProfile(active.id, name)
          }}>Rename</button>
          <button onClick={() => s.duplicateProfile(active.id)}>Duplicate</button>
          <button onClick={() => {
            if (window.confirm(`Delete "${active.name}"? This cannot be undone.`))
              s.deleteProfile(active.id)
          }}>Delete</button>
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <label>
          Controller:{' '}
          <select
            value={active.controllerType}
            onChange={(e) => s.setControllerType(e.target.value as ControllerType)}
          >
            {CONTROLLER_LIST.map((c) => (
              <option key={c.type} value={c.type}>{c.label}</option>
            ))}
          </select>
        </label>
        <small style={{ display: 'block', marginTop: 4 }}>
          Changing the controller resets which extra buttons are visible to that controller's defaults.
        </small>
      </section>

      <AdvancedOptions profile={active} />

      {floating && !overlayVisible && (
        <div
          style={{
            position: 'fixed',
            right: 12,
            bottom: 12,
            width: 280,
            zIndex: 50,
            background: '#111418',
            border: '1px solid #6b7280',
            borderRadius: 8,
            padding: 6,
            boxShadow: '0 4px 16px #0008',
          }}
        >
          <Overlay profile={active} pad={pad} down={down} urls={urls} compact />
        </div>
      )}
    </div>
  )
}