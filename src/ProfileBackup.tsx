import { useState } from 'react'
import { MAX_BACKUP_BYTES } from './backup'
import { useProfiles } from './store'
import type { Profile } from './types'

type Note = { kind: 'ok' | 'error'; text: string } | null

function saveFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const safeName = (name: string) =>
  name.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'profile'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function ProfileBackup({ active }: { active: Profile }) {
  const exportProfiles = useProfiles((s) => s.exportProfiles)
  const importBackup = useProfiles((s) => s.importBackup)
  const profiles = useProfiles((s) => s.profiles)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)

  const doExport = async (all: boolean) => {
    setBusy(true)
    setNote(null)
    try {
      const ids = all ? profiles.map((p) => p.id) : [active.id]
      const json = await exportProfiles(ids)
      saveFile(
        all ? 'gamepad-overlay-all-profiles.json' : `${safeName(active.name)}.gamepad-profile.json`,
        json,
      )
      setNote({
        kind: 'ok',
        text: all
          ? `Exported ${ids.length} profile${ids.length === 1 ? '' : 's'}.`
          : `Exported "${active.name}". Send the downloaded file to whoever should have it.`,
      })
    } catch (e) {
      setNote({ kind: 'error', text: `Export failed: ${errorText(e)}` })
    } finally {
      setBusy(false)
    }
  }

  const doImport = async (file: File) => {
    setBusy(true)
    setNote(null)
    try {
      if (file.size > MAX_BACKUP_BYTES) {
        setNote({
          kind: 'error',
          text: `That file is too large (limit ${MAX_BACKUP_BYTES / 1024 / 1024} MB).`,
        })
        return
      }
      const result = await importBackup(await file.text())
      if (!result.ok) {
        setNote({ kind: 'error', text: result.error })
        return
      }
      const names = result.names.map((n) => `"${n}"`).join(', ')
      const skipped =
        result.skippedImages > 0
          ? ` ${result.skippedImages} image${result.skippedImages === 1 ? '' : 's'} in the file could not be used and ${result.skippedImages === 1 ? 'was' : 'were'} skipped.`
          : ''
      setNote({ kind: 'ok', text: `Imported ${names}.${skipped}` })
    } catch (e) {
      setNote({ kind: 'error', text: `Import failed: ${errorText(e)}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{ border: '1px solid #6b728080', borderRadius: 6, padding: 12, marginBottom: 16 }}>
      <strong>Share or back up profiles</strong>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <button onClick={() => void doExport(false)} disabled={busy}>
          Export this profile
        </button>
        <button onClick={() => void doExport(true)} disabled={busy}>
          Export all profiles
        </button>
        <label>
          Import profile{' '}
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = '' // lets the same file be chosen again later
              if (file) void doImport(file)
            }}
          />
        </label>
      </div>
      <small style={{ display: 'block', marginTop: 6 }}>
        The file contains the profile's settings, bindings, colors and images. Importing always adds
        new profiles and never overwrites yours. It does not include which input device you chose.
      </small>
      {note && (
        <p
          role={note.kind === 'error' ? 'alert' : 'status'}
          style={{ margin: '8px 0 0', color: note.kind === 'error' ? '#ff8a8a' : undefined }}
        >
          {note.text}
        </p>
      )}
    </section>
  )
}