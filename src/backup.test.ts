import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  BACKUP_FORMAT,
  buildExport,
  fromBase64,
  parseBackup,
  prepareImport,
  serializeBackup,
  toBase64,
  type BackupFile,
} from './backup'
import { createProfile, withButtonPatch, withPartPatch, withSettingsPatch } from './profile'
import * as db from './storage'
import type { ArtworkRecord } from './types'

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const pngBytes = (...extra: number[]) => new Uint8Array([...PNG, ...extra])

const rec = (
  profileId: string,
  kind: ArtworkRecord['kind'],
  slot: 'normal' | 'pressed',
  ...extra: number[]
): ArtworkRecord => ({
  id: crypto.randomUUID(),
  profileId,
  kind,
  slot,
  name: 'a.png',
  mime: 'image/png',
  data: pngBytes(...extra).buffer as ArrayBuffer,
  createdAt: 1,
})

const load = (text: string): BackupFile => {
  const r = parseBackup(text)
  if ('error' in r) throw new Error(r.error)
  return r.file
}

const fileWith = (entries: unknown[]) =>
  JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: '', profiles: entries })

beforeEach(async () => {
  await db.resetDatabaseForTests()
})

describe('base64', () => {
  it('round-trips every byte value and large files', () => {
    const bytes = new Uint8Array(70000).map((_, i) => i % 256)
    expect(fromBase64(toBase64(bytes))).toEqual(bytes)
  })
})

describe('export and import', () => {
  it('round-trips a profile with images, creating new ids and keeping every setting', () => {
    let p = createProfile('tynza', 'razer-wolverine')
    const up = rec(p.id, 'paddle1', 'normal', 1)
    const down = rec(p.id, 'paddle1', 'pressed', 2)
    const shell = rec(p.id, 'shell', 'normal', 3)
    const unused = rec(p.id, 'paddle2', 'normal', 9)
    p = withButtonPatch(p, 'paddle1', {
      artwork: { normal: up.id, pressed: down.id },
      binding: { kind: 'key', code: 'KeyR' },
      yaw: 0.3,
      fillColor: '#112233',
    })
    p = withPartPatch(p, 'shell', { artwork: { normal: shell.id, pressed: null }, scale: 1.2 })
    p = withSettingsPatch(p, { deadzone: 0, colorsApplyToAll: false })

    const file = load(serializeBackup(buildExport([p], [up, down, shell, unused])))
    expect(file.profiles[0].images).toHaveLength(3) // the unused image is not exported

    const out = prepareImport(file, [])
    const q = out.profiles[0]
    expect(out.skippedImages).toBe(0)
    expect(q.id).not.toBe(p.id)
    expect(q.name).toBe('tynza')
    expect(q.controllerType).toBe('razer-wolverine')
    expect(q.buttons.paddle1.binding).toEqual({ kind: 'key', code: 'KeyR' })
    expect(q.buttons.paddle1.yaw).toBe(0.3)
    expect(q.buttons.paddle1.fillColor).toBe('#112233')
    expect(q.buttons.paddle1.visible).toBe(true)
    expect(q.parts.shell.scale).toBe(1.2)
    expect(q.settings.deadzone).toBe(0)
    expect(q.settings.colorsApplyToAll).toBe(false)

    expect(out.artwork).toHaveLength(3)
    const refs = [q.buttons.paddle1.artwork.normal, q.buttons.paddle1.artwork.pressed, q.parts.shell.artwork.normal]
    for (const ref of refs) {
      expect(ref).toBeTruthy()
      expect([up.id, down.id, shell.id]).not.toContain(ref)
      expect(out.artwork.find((a) => a.id === ref)?.profileId).toBe(q.id)
    }
    const firstImage = out.artwork.find((a) => a.id === refs[0])
    expect(new Uint8Array(firstImage!.data)).toEqual(pngBytes(1))
    expect(firstImage?.kind).toBe('paddle1')
    expect(firstImage?.slot).toBe('normal')
  })

  it('gives each image slot its own record even when two slots share one image', () => {
    let p = createProfile('p', 'ps4')
    const shared = rec(p.id, 'south', 'normal', 7)
    p = withPartPatch(p, 'south', { artwork: { normal: shared.id, pressed: shared.id } })

    const file = load(serializeBackup(buildExport([p], [shared])))
    expect(file.profiles[0].images).toHaveLength(1)

    const out = prepareImport(file, [])
    const art = out.profiles[0].parts.south.artwork
    expect(art.normal).toBeTruthy()
    expect(art.pressed).toBeTruthy()
    expect(art.normal).not.toBe(art.pressed)
    expect(out.artwork).toHaveLength(2)
  })

  it('never reuses a name: adds "(imported)", then "(imported 2)", ignoring case', () => {
    const file = load(serializeBackup(buildExport([createProfile('tynza', 'ps4')], [])))
    expect(prepareImport(file, ['tynza']).profiles[0].name).toBe('tynza (imported)')
    expect(prepareImport(file, ['TYNZA', 'tynza (imported)']).profiles[0].name).toBe('tynza (imported 2)')
    expect(prepareImport(file, ['other']).profiles[0].name).toBe('tynza')
  })

  it('keeps several profiles in one file apart, even with the same name', () => {
    const file = load(
      serializeBackup(buildExport([createProfile('same', 'ps4'), createProfile('same', 'xbox-one')], [])),
    )
    const names = prepareImport(file, []).profiles.map((p) => p.name)
    expect(names).toEqual(['same', 'same (imported)'])
  })
})

describe('reading files', () => {
  it('rejects things that are not backup files, with a clear message', () => {
    const msg = (text: string) => {
      const r = parseBackup(text)
      return 'error' in r ? r.error : ''
    }
    expect(msg('nope')).toMatch(/not valid JSON/i)
    expect(msg('{}')).toMatch(/isn't a Gamepad Overlay/i)
    expect(msg(JSON.stringify({ format: BACKUP_FORMAT, version: 2, profiles: [] }))).toMatch(/newer version/i)
    expect(msg(JSON.stringify({ format: BACKUP_FORMAT, version: 0, profiles: [] }))).toMatch(/invalid version/i)
    expect(msg(fileWith([]))).toMatch(/no profiles/i)
    expect(msg(fileWith(['x']))).toMatch(/damaged/i)
    expect(msg(fileWith([{ profile: 5 }]))).toMatch(/damaged/i)
    expect(msg(fileWith(Array.from({ length: 51 }, () => ({ profile: {}, images: [] }))))).toMatch(/too many/i)
  })

  it('cleans up hostile or damaged values instead of crashing', () => {
    const file = load(
      fileWith([
        {
          profile: {
            name: 123,
            controllerType: 'toString',
            settings: 'abc',
            buttons: {
              paddle1: { visible: 'yes', binding: { kind: 'key', code: 12 }, yaw: 'x' },
              paddle2: { binding: { kind: 'mouse', button: 99 } },
              paddle3: { binding: { kind: 'key', code: 'KeyF' } },
            },
          },
          images: [],
        },
      ]),
    )
    const q = prepareImport(file, []).profiles[0]
    expect(q.name).toBe('Imported profile')
    expect(q.controllerType).toBe('xbox-one')
    expect(q.settings.deadzone).toBe(0.25)
    expect(q.buttons.paddle1.visible).toBe(false)
    expect(q.buttons.paddle1.binding).toBeNull()
    expect(Number.isFinite(q.buttons.paddle1.yaw)).toBe(true)
    expect(q.buttons.paddle2.binding).toBeNull()
    expect(q.buttons.paddle3.binding).toEqual({ kind: 'key', code: 'KeyF' })
  })

  it('skips damaged, non-image and oversized images and clears the slots that used them', () => {
    let p = createProfile('p', 'razer-wolverine')
    p = withButtonPatch(p, 'paddle1', { artwork: { normal: 'a', pressed: 'b' } })
    p = withPartPatch(p, 'shell', { artwork: { normal: 'c', pressed: null } })
    p = withPartPatch(p, 'lt', { artwork: { normal: 'd', pressed: null } })
    const file = load(
      fileWith([
        {
          profile: p,
          images: [
            { id: 'a', name: 'a.png', mime: 'image/png', data: toBase64(pngBytes(5)) },
            { id: 'b', name: 'b.png', mime: 'image/png', data: 'not base64!!' },
            { id: 'c', name: 'c.png', mime: 'image/png', data: toBase64(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])) },
            { id: 'd', name: 'd.png', mime: 'image/png', data: 'A'.repeat(7_000_000) },
          ],
        },
      ]),
    )
    const out = prepareImport(file, [])
    const q = out.profiles[0]
    expect(out.skippedImages).toBe(3)
    expect(q.buttons.paddle1.artwork.normal).toBeTruthy()
    expect(q.buttons.paddle1.artwork.pressed).toBeNull()
    expect(q.parts.shell.artwork.normal).toBeNull()
    expect(q.parts.lt.artwork.normal).toBeNull()
    expect(out.artwork).toHaveLength(1)
  })
})

describe('saving an import', () => {
  it('adds the profile and its images without touching existing profiles', async () => {
    const existing = createProfile('Existing', 'ps4')
    await db.saveProfile(existing)

    let p = createProfile('tynza', 'scuf-envision')
    const img = rec(p.id, 'paddle3', 'normal', 4)
    p = withButtonPatch(p, 'paddle3', { artwork: { normal: img.id, pressed: null } })
    const file = load(serializeBackup(buildExport([p], [img])))

    const prepared = prepareImport(file, [existing.name])
    await db.importProfiles(prepared.profiles, prepared.artwork)
    await db.closeDatabase() // like a page refresh

    const q = prepared.profiles[0]
    expect(await db.loadProfile(q.id)).toEqual(q)
    const saved = await db.getArtwork(q.buttons.paddle3.artwork.normal!)
    expect(new Uint8Array(saved!.data)).toEqual(pngBytes(4))
    expect(await db.loadProfile(existing.id)).toEqual(existing)
  })
})