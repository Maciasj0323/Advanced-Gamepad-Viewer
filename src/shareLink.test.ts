import { describe, expect, it } from 'vitest'
import { buildExport, prepareImport } from './backup'
import { createProfile, withButtonPatch } from './profile'
import { buildShareUrl, decodeShareToken, encodeShareToken, readShareToken } from './shareLink'
import type { ArtworkRecord } from './types'

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

describe('self-contained overlay links', () => {
  it('carry a whole profile and its images, so nothing has to be saved in OBS', async () => {
    let p = createProfile('tynza', 'gamesir-tarantula-8k')
    const img: ArtworkRecord = {
      id: crypto.randomUUID(),
      profileId: p.id,
      kind: 'paddle1',
      slot: 'normal',
      name: 'a.png',
      mime: 'image/png',
      data: new Uint8Array([...PNG, 1, 2, 3]).buffer as ArrayBuffer,
      createdAt: 1,
    }
    p = withButtonPatch(p, 'paddle1', {
      artwork: { normal: img.id, pressed: null },
      binding: { kind: 'key', code: 'KeyR' },
      yaw: 0.31,
    })

    const token = await encodeShareToken(buildExport([p], [img]))
    expect(token).toMatch(/^[gj]\.[A-Za-z0-9_-]+$/)

    const decoded = await decodeShareToken(token)
    if ('error' in decoded) throw new Error(decoded.error)
    const out = prepareImport(decoded.file, [])
    const q = out.profiles[0]
    expect(q.name).toBe('tynza')
    expect(q.controllerType).toBe('gamesir-tarantula-8k')
    expect(q.buttons.paddle1.binding).toEqual({ kind: 'key', code: 'KeyR' })
    expect(q.buttons.paddle1.yaw).toBe(0.31)
    expect(q.buttons.mid1.visible).toBe(true)

    const artId = q.buttons.paddle1.artwork.normal
    const rec = out.artwork.find((a) => a.id === artId)
    expect(rec).toBeDefined()
    expect(new Uint8Array(rec!.data)).toEqual(new Uint8Array([...PNG, 1, 2, 3]))
  })

  it('give a clear error when damaged, cut off or not a link', async () => {
    for (const bad of ['', 'x.abc', 'g.AAAA', 'g.', 'j.%%%']) {
      const r = await decodeShareToken(bad)
      expect('error' in r).toBe(true)
    }
    const good = await encodeShareToken(buildExport([createProfile('p', 'ps4')], []))
    const cut = await decodeShareToken(good.slice(0, Math.floor(good.length / 2)))
    expect('error' in cut).toBe(true)
  })

  it('read the token from the address hash and nothing else', () => {
    expect(readShareToken('#d=g.abc_-.9')).toBe('g.abc_-.9')
    expect(readShareToken('')).toBeNull()
    expect(readShareToken('#d=')).toBeNull()
    expect(readShareToken('#x=1')).toBeNull()
    expect(readShareToken('#d=a b')).toBeNull()
    expect(readShareToken('#d=a&b=1')).toBeNull()
  })

  it('build an address with the overlay flag, background and the data after #', () => {
    const url = buildShareUrl('https://x.test/app/', 'g.abc', '#00FF00')
    expect(url).toBe('https://x.test/app/?overlay&bg=00ff00#d=g.abc')
    expect(buildShareUrl('https://x.test/', 'g.abc', null)).toBe('https://x.test/?overlay#d=g.abc')
    expect(buildShareUrl('https://x.test/', 'g.abc', 'red')).toBe('https://x.test/?overlay#d=g.abc')
    expect(buildShareUrl('https://x.test/', 'g.abc', null, { code: 'a1b2c3d4e5f60718293a4b5c', port: 8765 })).toBe(
      'https://x.test/?overlay&helper=a1b2c3d4e5f60718293a4b5c#d=g.abc',
    )
  })
})
