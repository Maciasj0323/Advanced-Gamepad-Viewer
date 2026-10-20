import { describe, expect, it } from 'vitest'
import { artworkIds, hasArt, resolveArt, sniffImageType } from './artwork'
import { DEFAULT_POSITIONS } from './controllers'
import { EXTRA_BASE_SIZE, extraKind } from './extras'
import { anchorFor, CANVAS_H, CANVAS_W, LABEL_OFFSET, LAYOUTS } from './layouts'
import { createProfile, normalizeProfile, withArtworkRef } from './profile'
import { EXTRA_BUTTON_IDS, type ExtraButtonId, type Profile } from './types'

const bytes = (...n: number[]) => new Uint8Array(n)

describe('image type detection', () => {
  it('recognizes PNG, JPEG, GIF and WebP by their first bytes', () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png')
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(sniffImageType(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe('image/gif')
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe('image/webp')
  })

  it('rejects anything else, including PDFs, text and empty files', () => {
    expect(sniffImageType(bytes())).toBeNull()
    expect(sniffImageType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBeNull()
    expect(sniffImageType(new TextEncoder().encode('hello world'))).toBeNull()
  })
})

describe('choosing what to draw', () => {
  it('draws the built-in shape when a part has no images', () => {
    const refs = { normal: null, pressed: null }
    expect(hasArt(refs)).toBe(false)
    expect(resolveArt(refs, false)).toEqual({ kind: 'shape' })
    expect(resolveArt(refs, true)).toEqual({ kind: 'shape' })
  })

  it('with only a not-pressed image: shows it, tinted when pressed', () => {
    const refs = { normal: 'a', pressed: null }
    expect(hasArt(refs)).toBe(true)
    expect(resolveArt(refs, false)).toEqual({ kind: 'image', id: 'a', tint: false })
    expect(resolveArt(refs, true)).toEqual({ kind: 'image', id: 'a', tint: true })
  })

  it('with only a pressed image: nothing until pressed, and never the shape', () => {
    const refs = { normal: null, pressed: 'b' }
    expect(resolveArt(refs, false)).toEqual({ kind: 'none' })
    expect(resolveArt(refs, true)).toEqual({ kind: 'image', id: 'b', tint: false })
  })

  it('with both images: each one in its own state, no tint', () => {
    const refs = { normal: 'a', pressed: 'b' }
    expect(resolveArt(refs, false)).toEqual({ kind: 'image', id: 'a', tint: false })
    expect(resolveArt(refs, true)).toEqual({ kind: 'image', id: 'b', tint: false })
  })
})

describe('image slots are independent', () => {
  it("a part's two slots are separate and leave every other part alone", () => {
    const before = createProfile('p', 'xbox-one')
    let p = withArtworkRef(before, { kind: 'part', id: 'lt' }, 'normal', 'n1')
    p = withArtworkRef(p, { kind: 'part', id: 'lt' }, 'pressed', 'p1')
    expect(p.parts.lt.artwork).toEqual({ normal: 'n1', pressed: 'p1' })
    expect(p.parts.rt.artwork).toEqual({ normal: null, pressed: null })
    expect(p.parts.shell).toEqual(before.parts.shell)
    expect(p.buttons).toEqual(before.buttons)
    expect(before.parts.lt.artwork).toEqual({ normal: null, pressed: null })
  })

  it('additional buttons each keep their own slots', () => {
    let p = createProfile('p', 'razer-wolverine')
    p = withArtworkRef(p, { kind: 'extra', id: 'paddle1' }, 'normal', 'a')
    p = withArtworkRef(p, { kind: 'extra', id: 'paddle2' }, 'normal', 'b')
    expect(p.buttons.paddle1.artwork.normal).toBe('a')
    expect(p.buttons.paddle2.artwork.normal).toBe('b')
    expect(p.buttons.paddle3.artwork).toEqual({ normal: null, pressed: null })
  })

  it('removing one image clears only that slot', () => {
    let p = createProfile('p', 'ps4')
    p = withArtworkRef(p, { kind: 'part', id: 'south' }, 'normal', 'a')
    p = withArtworkRef(p, { kind: 'part', id: 'south' }, 'pressed', 'b')
    p = withArtworkRef(p, { kind: 'part', id: 'south' }, 'pressed', null)
    expect(p.parts.south.artwork).toEqual({ normal: 'a', pressed: null })
  })

  it('lists every image a profile uses', () => {
    let p = createProfile('p', 'razer-wolverine')
    p = withArtworkRef(p, { kind: 'part', id: 'shell' }, 'normal', 's')
    p = withArtworkRef(p, { kind: 'extra', id: 'clawLeft' }, 'normal', 'c1')
    p = withArtworkRef(p, { kind: 'extra', id: 'clawLeft' }, 'pressed', 'c2')
    expect(artworkIds(p).sort()).toEqual(['c1', 'c2', 's'])
    expect(artworkIds(null)).toEqual([])
  })
})

describe('older profiles', () => {
  it('keeps the single image id older profiles stored, as the not-pressed image', () => {
    const fresh = createProfile('m', 'xbox-one')
    const old = {
      ...fresh,
      parts: { ...fresh.parts, shell: { ...fresh.parts.shell, artwork: undefined, artworkId: 'abc' } },
    } as unknown as Profile
    expect(normalizeProfile(old).parts.shell.artwork).toEqual({ normal: 'abc', pressed: null })
  })

  it('moves untouched old default spots to the new defaults and keeps custom spots', () => {
    const fresh = createProfile('v3', 'ps4')
    const old = {
      ...fresh,
      schemaVersion: 3,
      buttons: {
        ...fresh.buttons,
        paddle1: { ...fresh.buttons.paddle1, yaw: 0.32, pitch: 0.9 }, // old default
        paddle2: { ...fresh.buttons.paddle2, yaw: 0.55, pitch: 0.5 }, // moved by the user
        clawLeft: { ...fresh.buttons.clawLeft, yaw: 0.12, pitch: 0.2 }, // old default
      },
      parts: {
        ...fresh.parts,
        back: { ...fresh.parts.back, yaw: 215 / CANVAS_W, pitch: 150 / CANVAS_H },
        start: { ...fresh.parts.start, yaw: 385 / CANVAS_W, pitch: 150 / CANVAS_H },
      },
    } as Profile

    const fixed = normalizeProfile(old)
    expect(fixed.buttons.paddle1.yaw).toBe(DEFAULT_POSITIONS.paddle1.yaw)
    expect(fixed.buttons.paddle1.pitch).toBe(DEFAULT_POSITIONS.paddle1.pitch)
    expect(fixed.buttons.clawLeft.pitch).toBe(DEFAULT_POSITIONS.clawLeft.pitch)
    expect(fixed.buttons.paddle2.yaw).toBe(0.55)
    expect(fixed.buttons.paddle2.pitch).toBe(0.5)
    expect(fixed.parts.back.pitch * CANVAS_H).toBeCloseTo(anchorFor('playstation', 'back').y, 5)
    expect(fixed.parts.start.pitch * CANVAS_H).toBeCloseTo(anchorFor('playstation', 'start').y, 5)
  })

  it('leaves current-version profiles alone, even at old default spots', () => {
    const fresh = createProfile('v4', 'ps4')
    const kept = normalizeProfile({
      ...fresh,
      buttons: { ...fresh.buttons, paddle1: { ...fresh.buttons.paddle1, yaw: 0.32, pitch: 0.9 } },
    })
    expect(kept.buttons.paddle1.yaw).toBe(0.32)
    expect(kept.buttons.paddle1.pitch).toBe(0.9)
  })
})

describe('default layout', () => {
  it('PlayStation View/Share and Menu/Options labels clear the face button and D-pad', () => {
    const L = LAYOUTS.playstation
    const rightDpadTop = L.dpad.y - 10
    const squareTop = L.face.west.y - 15
    expect(L.back.y + LABEL_OFFSET).toBeLessThan(rightDpadTop - 5)
    expect(L.start.y + LABEL_OFFSET).toBeLessThan(squareTop - 5)
  })

  const box = (id: ExtraButtonId) => {
    const s = EXTRA_BASE_SIZE[extraKind(id)]
    const p = DEFAULT_POSITIONS[id]
    const cx = p.yaw * CANVAS_W
    const cy = p.pitch * CANVAS_H
    return { l: cx - s.w / 2, r: cx + s.w / 2, t: cy - s.h / 2, b: cy + s.h / 2 }
  }
  const overlap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
    a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t

  it('paddles sit on the handles: P1 above P2 on the left, P3 above P4 on the right', () => {
    const d = DEFAULT_POSITIONS
    expect(d.paddle1.yaw).toBeLessThan(0.5)
    expect(d.paddle2.yaw).toBeLessThan(0.5)
    expect(d.paddle3.yaw).toBeGreaterThan(0.5)
    expect(d.paddle4.yaw).toBeGreaterThan(0.5)
    expect(d.paddle1.pitch).toBeLessThan(d.paddle2.pitch)
    expect(d.paddle3.pitch).toBeLessThan(d.paddle4.pitch)
    expect(d.paddle2.pitch).toBeGreaterThan(0.7)
    expect(d.paddle4.pitch).toBeGreaterThan(0.7)
  })

  it('no extra button overlaps another at the default positions', () => {
    for (const a of EXTRA_BUTTON_IDS) {
      for (const b of EXTRA_BUTTON_IDS) {
        if (a < b) expect(overlap(box(a), box(b))).toBe(false)
      }
    }
  })

  it('claw bumpers keep their horizontal spots and sit at trigger height', () => {
    expect(DEFAULT_POSITIONS.clawLeft.yaw).toBe(0.12)
    expect(DEFAULT_POSITIONS.clawRight.yaw).toBe(0.88)
    for (const family of ['xbox', 'playstation'] as const) {
      for (const [claw, trig] of [['clawLeft', 'lt'], ['clawRight', 'rt']] as const) {
        const clawY = DEFAULT_POSITIONS[claw].pitch * CANVAS_H
        expect(Math.abs(clawY - LAYOUTS[family][trig].cy)).toBeLessThan(15)
      }
    }
  })
})