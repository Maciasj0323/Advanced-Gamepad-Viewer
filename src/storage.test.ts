import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createProfile, withButtonPatch, withPartPatch } from './profile'
import * as db from './storage'
import type { ArtworkRecord, Profile } from './types'

const art = (profileId: string, kind: ArtworkRecord['kind'], bytes: number[]): ArtworkRecord => ({
  id: crypto.randomUUID(),
  profileId,
  kind,
  name: 'test.png',
  mime: 'image/png',
  data: new Uint8Array(bytes).buffer,
  createdAt: Date.now(),
})

beforeEach(async () => {
  await db.resetDatabaseForTests()
})

describe('persistence', () => {
  it('saved profiles survive closing and reopening the database', async () => {
    let p = createProfile('Ranked PvP Setup', 'scuf-envision')
    p = withButtonPatch(p, 'paddle3', { binding: { kind: 'mouse', button: 3 }, yaw: 0.7 })
    await db.saveProfile(p)

    await db.closeDatabase() // simulates a page refresh

    const loaded = await db.loadProfile(p.id)
    expect(loaded).toEqual(p)
    expect(loaded?.buttons.paddle3.binding).toEqual({ kind: 'mouse', button: 3 })
  })

  it('remembers the active profile id', async () => {
    await db.setActiveProfileId('abc')
    await db.closeDatabase()
    expect(await db.getActiveProfileId()).toBe('abc')
  })

  it('lists profiles in creation order', async () => {
    const a = { ...createProfile('A', 'ps4'), createdAt: 1 }
    const b = { ...createProfile('B', 'ps4'), createdAt: 2 }
    await db.saveProfile(b)
    await db.saveProfile(a)
    expect((await db.listProfiles()).map((p) => p.name)).toEqual(['A', 'B'])
  })
})

describe('duplicate', () => {
  it('copies both image slots of parts and buttons, and the copy is independent', async () => {
    const original = createProfile('Original', 'razer-wolverine')
    const up = art(original.id, 'paddle1', [1, 2, 3])
    const down = art(original.id, 'paddle1', [4, 5])
    const shell = art(original.id, 'shell', [6])
    let p = withButtonPatch(original, 'paddle1', { artwork: { normal: up.id, pressed: down.id } })
    p = withPartPatch(p, 'shell', { artwork: { normal: shell.id, pressed: null } })
    for (const rec of [up, down, shell]) await db.putArtwork(rec)
    await db.saveProfile(p)

    const copy = await db.duplicateProfile(p.id)

    const copyUp = copy.buttons.paddle1.artwork.normal
    const copyDown = copy.buttons.paddle1.artwork.pressed
    const copyShell = copy.parts.shell.artwork.normal
    expect(copyUp && copyDown && copyShell).toBeTruthy()
    expect(new Set([copyUp, copyDown, copyShell, up.id, down.id, shell.id]).size).toBe(6)
    expect(copy.buttons.paddle2.artwork).toEqual({ normal: null, pressed: null })

    const copiedUp = await db.getArtwork(copyUp!)
    expect(new Uint8Array(copiedUp!.data)).toEqual(new Uint8Array([1, 2, 3]))
    expect(copiedUp!.profileId).toBe(copy.id)

    // editing the copy leaves the original alone
    await db.saveProfile(withButtonPatch(copy, 'paddle1', { yaw: 0.99 }))
    expect((await db.loadProfile(p.id))?.buttons.paddle1.yaw).not.toBe(0.99)

    // deleting the copy keeps the original's images
    await db.deleteProfile(copy.id)
    expect(await db.getArtwork(up.id)).toBeDefined()
    expect(await db.getArtwork(down.id)).toBeDefined()
    expect(await db.getArtwork(copyUp!)).toBeUndefined()
    expect(await db.getArtwork(copyDown!)).toBeUndefined()
  })

  it('also copies the single image id that older profiles stored', async () => {
    const base = createProfile('Legacy', 'xbox-one')
    const legacyArt = art(base.id, 'south', [7])
    const legacy = {
      ...base,
      parts: { ...base.parts, south: { ...base.parts.south, artwork: undefined, artworkId: legacyArt.id } },
    } as unknown as Profile
    await db.putArtwork(legacyArt)
    await db.saveProfile(legacy)

    const copy = await db.duplicateProfile(legacy.id)
    const copyId = (copy.parts.south as unknown as { artworkId: string }).artworkId
    expect(copyId).toBeTruthy()
    expect(copyId).not.toBe(legacyArt.id)
    expect((await db.getArtwork(copyId))?.profileId).toBe(copy.id)
  })
})

describe('delete', () => {
  it('removes only that profile and its images', async () => {
    const a = createProfile('A', 'xbox-one')
    const b = createProfile('B', 'ps4')
    const artA = art(a.id, 'base', [9])
    const artB = art(b.id, 'base', [8])
    await db.saveProfile(a)
    await db.saveProfile(b)
    await db.putArtwork(artA)
    await db.putArtwork(artB)

    await db.deleteProfile(a.id)

    expect(await db.loadProfile(a.id)).toBeUndefined()
    expect(await db.getArtwork(artA.id)).toBeUndefined()
    expect(await db.loadProfile(b.id)).toBeDefined()
    expect(await db.getArtwork(artB.id)).toBeDefined()
  })
})