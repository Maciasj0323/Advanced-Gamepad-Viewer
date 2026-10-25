import { useRef, useState } from 'react'
import { buildObsUrl } from './overlayMode'

const BACKGROUNDS = [
  { label: 'Transparent (recommended)', value: '' },
  { label: 'Green (for chroma key)', value: '#00ff00' },
  { label: 'Blue (for chroma key)', value: '#0000ff' },
  { label: 'Magenta (for chroma key)', value: '#ff00ff' },
  { label: 'Black', value: '#000000' },
]

export default function ObsLink({ profileName }: { profileName: string }) {
  const [bg, setBg] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const url = buildObsUrl(`${window.location.origin}${window.location.pathname}`, profileName, bg || null)
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setNote('Copied.')
    } catch {
      inputRef.current?.select()
      setNote('Press Ctrl+C to copy the selected link.')
    }
  }

  return (
    <section className="card">
      <h3>Use in OBS</h3>
      <label className="field">
        Background
        <select value={bg} onChange={(e) => setBg(e.target.value)}>
          {BACKGROUNDS.map((b) => (
            <option key={b.label} value={b.value}>{b.label}</option>
          ))}
        </select>
      </label>
      <label className="field">
        Link for "{profileName}"
        <input ref={inputRef} readOnly value={url} onFocus={(e) => e.target.select()} />
      </label>
      <button onClick={() => void copy()}>Copy link</button>
      {note && <small style={{ marginLeft: 8 }}>{note}</small>}
      <ol className="steps">
        <li>
          OBS has its own separate storage, so it starts with no profiles. Add a Browser source with this
          app's normal address (no <code>?overlay</code>), right-click it, choose <b>Interact</b>, and
          import your exported profile file there once.
        </li>
        <li>
          Add a Browser source with the link above. Size it to 1200 × 880 or any size with the same
          shape, and the controller scales to fit.
        </li>
        <li>
          Transparent needs no chroma key. If you pick a green/blue/magenta background, add a Chroma
          Key filter in OBS set to that color.
        </li>
        <li>After changing a profile inside OBS, refresh that source to see it.</li>
      </ol>
      {isLocal && (
        <small style={{ display: 'block' }}>
          This is a localhost address, so it only works on this PC while the dev server is running.
        </small>
      )}
    </section>
  )
}
