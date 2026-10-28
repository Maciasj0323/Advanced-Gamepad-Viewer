import { useEffect, useState } from 'react'
import AdvancedOptions from './AdvancedOptions'
import { useArtwork, useArtworkUrls } from './artworkStore'
import { CONTROLLER_LIST, CONTROLLERS } from './controllers'
import HelperCard from './HelperCard'
import ObsLink from './ObsLink'
import Overlay from './Overlay'
import ProfileBackup from './ProfileBackup'
import { useProfiles } from './store'
import type { ControllerType } from './types'
import { useGamepadList, useGamepadState } from './useGamepad'
import { useHeldInputs } from './useInput'
import { useOnScreen } from './useOnScreen'

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

export default function Studio() {
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
  const urls = useArtworkUrls(activeForArt)
  const artError = useArtwork((st) => st.error)
  const pad = useGamepadState(padChoice || null, activeForArt?.settings.deadzone ?? 0.25)
  const down = useHeldInputs()

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
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">GAMEPAD OVERLAY</span>
          <span className="brand-tag">STUDIO</span>
        </div>
        <nav className="tabs" aria-label="Profiles">
          {s.profiles.map((p) => (
            <button
              key={p.id}
              className={p.id === active.id ? 'tab active' : 'tab'}
              aria-current={p.id === active.id}
              onClick={() => s.selectProfile(p.id)}
            >
              {p.name}
            </button>
          ))}
          <button
            className="tab add"
            aria-label="New profile"
            onClick={() => {
              const name = ask('Name for the new profile?')
              if (name) s.createProfile(name, 'xbox-one')
            }}
          >
            +
          </button>
        </nav>
        <div className="actions">
          <button
            onClick={() => {
              const name = ask('Rename profile to?', active.name)
              if (name) s.renameProfile(active.id, name)
            }}
          >
            Rename
          </button>
          <button onClick={() => s.duplicateProfile(active.id)}>Duplicate</button>
          <button
            onClick={() => {
              if (window.confirm(`Delete "${active.name}"? This cannot be undone.`))
                s.deleteProfile(active.id)
            }}
          >
            Delete
          </button>
        </div>
      </header>

      {s.error && (
        <p role="alert" className="alert">
          {s.error} <button onClick={s.dismissError}>Dismiss</button>
        </p>
      )}
      {artError && (
        <p role="alert" className="alert">
          {artError} <button onClick={() => useArtwork.getState().dismissError()}>Dismiss</button>
        </p>
      )}

      <main className="grid">
        <section className="card">
          <h3>Controller</h3>
          <label className="field">
            Layout
            <select
              value={active.controllerType}
              onChange={(e) => s.setControllerType(e.target.value as ControllerType)}
            >
              {CONTROLLER_LIST.map((c) => (
                <option key={c.type} value={c.type}>{c.label}</option>
              ))}
            </select>
          </label>
          <small style={{ display: 'block', marginBottom: 12 }}>
            Changing the layout resets which extra buttons are visible to that layout's defaults.
          </small>
          <label className="field">
            Input device
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
                <option key={p.index} value={p.id}>{p.id}</option>
              ))}
            </select>
          </label>
          <small style={{ display: 'block', marginBottom: 12 }}>
            Reading: {pad.id || 'no controller'} ({pad.mapped ? 'known layout' : 'unknown layout'})
          </small>
          <label>
            <input
              type="checkbox"
              checked={floating}
              onChange={(e) => {
                setFloating(e.target.checked)
                writeFlag('floatingPreview', e.target.checked)
              }}
            />
            Floating preview when scrolled away
          </label>
        </section>

        <section className="card stage">
          <div ref={setOverlayEl} className="stage-art">
            <Overlay profile={active} pad={pad} down={down} urls={urls} />
          </div>
          <div className="caption">
            {CONTROLLERS[active.controllerType].label}
            <span className={pad.connected ? 'dot on' : 'dot'} title={pad.connected ? 'Controller connected' : 'No controller'} />
          </div>
        </section>

        <ObsLink profile={active} />
      </main>

      <ProfileBackup active={active} />
      <HelperCard profile={active} />
      <AdvancedOptions profile={active} />

      {floating && !overlayVisible && (
        <div className="floating">
          <Overlay profile={active} pad={pad} down={down} urls={urls} compact />
        </div>
      )}
    </div>
  )
}
