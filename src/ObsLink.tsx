import { useRef, useState } from 'react'
import { parseBackup } from './backup'
import { readStoredHelper } from './helperClient'
import { buildObsUrl } from './overlayMode'
import { buildShareUrl, encodeShareToken, MAX_URL_CHARS } from './shareLink'
import { shrinkBackup } from './shrinkImage'
import { buildStandaloneHtml } from './standalone'
import { useProfiles } from './store'
import type { Profile } from './types'

const BACKGROUNDS = [
  { label: 'Transparent (recommended)', value: '' },
  { label: 'Green (for chroma key)', value: '#00ff00' },
  { label: 'Blue (for chroma key)', value: '#0000ff' },
  { label: 'Magenta (for chroma key)', value: '#ff00ff' },
  { label: 'Black', value: '#000000' },
]

type FileState =
  | { status: 'idle' }
  | { status: 'building' }
  | { status: 'done'; name: string; kb: number; madeFor: number }
  | { status: 'error'; message: string }

type LinkState =
  | { status: 'idle' }
  | { status: 'building' }
  | { status: 'ready'; url: string; madeFor: number }
  | { status: 'toobig'; chars: number }
  | { status: 'error'; message: string }

const safeName = (name: string) =>
  name.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'profile'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function ObsLink({ profile }: { profile: Profile }) {
  const exportProfiles = useProfiles((s) => s.exportProfiles)
  const [bg, setBg] = useState('')
  const [file, setFile] = useState<FileState>({ status: 'idle' })
  const [link, setLink] = useState<LinkState>({ status: 'idle' })
  const [note, setNote] = useState<string | null>(null)
  const linkRef = useRef<HTMLInputElement>(null)
  const shortRef = useRef<HTMLInputElement>(null)
  const pageUrl = `${window.location.origin}${window.location.pathname}`
  const helper = readStoredHelper()
  const shortUrl = buildObsUrl(pageUrl, profile.name, bg || null, helper)
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)

  const makeFile = async () => {
    setFile({ status: 'building' })
    try {
      const parsed = parseBackup(await exportProfiles([profile.id]))
      if ('error' in parsed) throw new Error(parsed.error)
      const token = await encodeShareToken(parsed.file)
      const res = await fetch(pageUrl, { cache: 'no-store' })
      if (!res.ok) throw new Error('Could not read this page to copy it.')
      const html = await buildStandaloneHtml({
        html: await res.text(),
        baseUrl: pageUrl,
        fetchText: async (u) => {
          const r = await fetch(u, { cache: 'no-store' })
          if (!r.ok) throw new Error(`Could not load ${u}`)
          return r.text()
        },
        token,
        background: bg || null,
        helper: readStoredHelper(),
      })
      const name = `${safeName(profile.name)}-overlay.html`
      downloadText(name, html, 'text/html')
      setFile({ status: 'done', name, kb: Math.round(html.length / 1024), madeFor: profile.updatedAt })
    } catch (e) {
      setFile({ status: 'error', message: errorText(e) })
    }
  }

  const makeLink = async () => {
    setLink({ status: 'building' })
    try {
      const parsed = parseBackup(await exportProfiles([profile.id]))
      if ('error' in parsed) throw new Error(parsed.error)
      const token = await encodeShareToken(await shrinkBackup(parsed.file))
      const url = buildShareUrl(pageUrl, token, bg || null, readStoredHelper())
      setLink(
        url.length > MAX_URL_CHARS
          ? { status: 'toobig', chars: url.length }
          : { status: 'ready', url, madeFor: profile.updatedAt },
      )
    } catch (e) {
      setLink({ status: 'error', message: errorText(e) })
    }
  }

  const copy = async (text: string, el: HTMLInputElement | null) => {
    try {
      await navigator.clipboard.writeText(text)
      setNote('Copied.')
    } catch {
      el?.select()
      setNote('Press Ctrl+C to copy the selected link.')
    }
  }

  const fileStale = file.status === 'done' && file.madeFor !== profile.updatedAt
  const linkStale = link.status === 'ready' && link.madeFor !== profile.updatedAt

  return (
    <section className="card">
      <h3>Use in OBS</h3>
      <label className="field">
        Background
        <select
          value={bg}
          onChange={(e) => {
            setBg(e.target.value)
            setFile({ status: 'idle' })
            setLink({ status: 'idle' })
          }}
        >
          {BACKGROUNDS.map((b) => (
            <option key={b.label} value={b.value}>{b.label}</option>
          ))}
        </select>
      </label>

      {!helper && (
        <small style={{ display: 'block', color: '#ffb36b', marginTop: 8 }}>
          Paddles, claws and other extra buttons only light in OBS when the Global input helper is set
          up and its code is entered below. Do that first, then download the overlay file.
        </small>
      )}

      <h3 style={{ fontSize: 14, marginTop: 14 }}>Overlay file (works with images)</h3>
      <button onClick={() => void makeFile()} disabled={file.status === 'building'}>
        {file.status === 'building' ? 'Creating…' : `Download overlay file for "${profile.name}"`}
      </button>
      {file.status === 'done' && (
        <small style={{ display: 'block', marginTop: 6 }}>
          Saved {file.name} ({file.kb.toLocaleString()} KB).
        </small>
      )}
      {file.status === 'error' && (
        <p role="alert" style={{ color: '#ff8a8a' }}>Could not make the file: {file.message}</p>
      )}
      {fileStale && (
        <p role="alert" style={{ color: '#ffb36b' }}>
          This profile has changed since the file was made. Download it again to include the changes.
        </p>
      )}
      <ol className="steps">
        <li>In OBS add a <b>Browser</b> source.</li>
        <li>Tick <b>Local file</b> and <b>Browse</b> to the downloaded file.</li>
        <li>Set the size to 1200 × 880, or any size with the same shape.</li>
        <li>
          Transparent needs no chroma key. For a colored background, add a <b>Chroma Key</b> filter
          in OBS for that color.
        </li>
        <li>Changed the profile? Download the file again, overwriting the old one, then refresh the source.</li>
      </ol>

      <details>
        <summary>Link instead of a file (small profiles only)</summary>
        <small style={{ display: 'block', margin: '8px 0' }}>
          OBS only accepts web addresses up to about 32,000 characters and silently cuts off longer ones,
          so this only works for profiles with few or no images.
        </small>
        <button onClick={() => void makeLink()} disabled={link.status === 'building'}>
          {link.status === 'building' ? 'Creating…' : 'Create overlay link'}
        </button>
        {link.status === 'toobig' && (
          <p role="alert" style={{ color: '#ffb36b' }}>
            This profile is too big for a link ({link.chars.toLocaleString()} characters). Use the overlay
            file above.
          </p>
        )}
        {link.status === 'error' && (
          <p role="alert" style={{ color: '#ff8a8a' }}>Could not create the link: {link.message}</p>
        )}
        {link.status === 'ready' && (
          <>
            <label className="field" style={{ marginTop: 8 }}>
              Overlay link ({link.url.length.toLocaleString()} characters)
              <input ref={linkRef} readOnly value={link.url} onFocus={(e) => e.target.select()} />
            </label>
            <button onClick={() => void copy(link.url, linkRef.current)}>Copy link</button>
            {linkStale && (
              <small style={{ display: 'block', color: '#ffb36b' }}>
                The profile has changed since this link was made. Create it again.
              </small>
            )}
          </>
        )}
      </details>

      <details>
        <summary>Short link (needs the profile saved inside OBS)</summary>
        <label className="field" style={{ marginTop: 8 }}>
          Link for "{profile.name}"
          <input ref={shortRef} readOnly value={shortUrl} onFocus={(e) => e.target.select()} />
        </label>
        <button onClick={() => void copy(shortUrl, shortRef.current)}>Copy short link</button>
        <small style={{ display: 'block', marginTop: 8 }}>
          OBS keeps its own saved profiles. Open this app's normal address in an OBS Browser source,
          choose <b>Interact</b>, and import your profile file there first. If the profile is not found,
          the overlay shows a message and no controller instead of guessing.
        </small>
      </details>
      {note && <small style={{ display: 'block', marginTop: 8 }}>{note}</small>}

      {isLocal && (
        <small style={{ display: 'block', marginTop: 8 }}>
          This is a localhost address. The overlay file is made from the built app, so run{' '}
          <code>npm run build</code> then <code>npm run preview</code> and use that address to download it.
        </small>
      )}
    </section>
  )
}
