import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { extraSize } from './extras'
import { anchorFor, CANVAS_H, CANVAS_W, groupAnchorFor, LAYOUTS } from './layouts'
import { createGroups, createParts, effectiveColors, transformString } from './parts'
import {
  createProfile,
  normalizeProfile,
  withButtonPatch,
  withControllerType,
  withGroupPatch,
  withPartPatch,
  withSettingsPatch,
} from './profile'
import * as db from './storage'
import {
  BASE_PART_IDS,
  DEFAULT_BORDER_COLOR,
  EXTRA_BUTTON_IDS,
  GROUP_IDS,
  GROUP_MEMBERS,
  groupOfPart,
  MAX_SCALE,
  MIN_SCALE,
  type ArtworkRecord,
  type Profile,
} from './types'

beforeEach(async () => {
  await db.resetDatabaseForTests()
})

describe('every part can be moved, scaled, stretched and rotated', () => {
  it('has 19 built-in parts, 3 groups and 8 additional buttons', () => {
    const p = createProfile('p', 'xbox-one')
    expect(BASE_PART_IDS).toHaveLength(19)
    expect(Object.keys(p.parts)).toHaveLength(19)
    expect(Object.keys(p.groups)).toHaveLength(3)
    expect(Object.keys(p.buttons)).toHaveLength(8)
  })

  it('starts every part and group at its layout position, normal size, no rotation', () => {
    for (const family of ['xbox', 'playstation'] as const) {
      const parts = createParts(family)
      for (const id of BASE_PART_IDS) {
        const a = anchorFor(family, id)
        expect(parts[id].yaw * CANVAS_W).toBeCloseTo(a.x, 5)
        expect(parts[id].pitch * CANVAS_H).toBeCloseTo(a.y, 5)
        expect(parts[id]).toMatchObject({ scale: 1, rotation: 0, width: 1, height: 1 })
      }
      const groups = createGroups(family)
      for (const id of GROUP_IDS) {
        const a = groupAnchorFor(family, id)
        expect(groups[id].yaw * CANVAS_W).toBeCloseTo(a.x, 5)
        expect(groups[id].pitch * CANVAS_H).toBeCloseTo(a.y, 5)
      }
    }
  })

  it('changing one built-in part leaves every other part alone', () => {
    const before = createProfile('p', 'xbox-one')
    const after = withPartPatch(before, 'lt', { scale: 1.5, yaw: 0.2, rotation: 30 })
    expect(after.parts.lt).toMatchObject({ scale: 1.5, yaw: 0.2, rotation: 30 })
    for (const id of BASE_PART_IDS.filter((i) => i !== 'lt')) {
      expect(after.parts[id]).toEqual(before.parts[id])
    }
    expect(after.buttons).toEqual(before.buttons)
    expect(after.groups).toEqual(before.groups)
  })

  it('clamps scale, width, height, rotation and position', () => {
    const p = withPartPatch(createProfile('p', 'xbox-one'), 'south', {
      scale: 100,
      width: 0,
      height: 100,
      rotation: 500,
      yaw: 5,
      pitch: -3,
    })
    expect(p.parts.south.scale).toBe(MAX_SCALE)
    expect(p.parts.south.width).toBe(MIN_SCALE)
    expect(p.parts.south.height).toBe(MAX_SCALE)
    expect(p.parts.south.rotation).toBe(180)
    expect(p.parts.south.yaw).toBe(1)
    expect(p.parts.south.pitch).toBe(0)
  })

  it('additional buttons stretch and rotate independently', () => {
    const before = createProfile('p', 'razer-wolverine')
    const after = withButtonPatch(before, 'paddle3', { scale: 2, rotation: 45, width: 0.5 })
    expect(after.buttons.paddle3).toMatchObject({ scale: 2, rotation: 45, width: 0.5, height: 1 })
    for (const id of EXTRA_BUTTON_IDS.filter((i) => i !== 'paddle3')) {
      expect(after.buttons[id]).toEqual(before.buttons[id])
    }
    expect(after.parts).toEqual(before.parts)
    expect(after.groups).toEqual(before.groups)
  })
})

describe('groups', () => {
  it('face buttons, D-pad and all controls are grouped by default', () => {
    const p = createProfile('p', 'ps4')
    for (const id of GROUP_IDS) expect(p.groups[id].grouped).toBe(true)
  })

  it('changing a group leaves every individual part alone', () => {
    const before = createProfile('p', 'ps4')
    const after = withGroupPatch(before, 'face', { scale: 1.4, yaw: 0.6, rotation: 15 })
    expect(after.groups.face).toMatchObject({ scale: 1.4, yaw: 0.6, rotation: 15 })
    expect(after.groups.dpad).toEqual(before.groups.dpad)
    expect(after.groups.controls).toEqual(before.groups.controls)
    expect(after.parts).toEqual(before.parts)
    expect(after.buttons).toEqual(before.buttons)
  })

  it('a default group transform leaves its members where they are', () => {
    const p = createProfile('p', 'xbox-one')
    const a = groupAnchorFor('xbox', 'face')
    expect(transformString(p.groups.face, a)).toBe(
      `translate(${a.x} ${a.y}) rotate(0) scale(1 1) translate(${-a.x} ${-a.y})`,
    )
  })

  it('the face and D-pad groups cover eight different parts', () => {
    const all = [...GROUP_MEMBERS.face, ...GROUP_MEMBERS.dpad]
    expect(all).toHaveLength(8)
    expect(new Set(all).size).toBe(8)
    for (const id of all) expect(BASE_PART_IDS).toContain(id)
    expect(groupOfPart('south')).toBe('face')
    expect(groupOfPart('dpadLeft')).toBe('dpad')
    expect(groupOfPart('lt')).toBeNull()
  })
})

describe('bumpers hug the shell', () => {
  it('each bumper touches the shell outline at its corner', () => {
    for (const family of ['xbox', 'playstation'] as const) {
      const L = LAYOUTS[family]
      const start = L.topEdge[0]
      const end = L.topEdge[3]
      expect(L.lb.inner[0].x).toBeCloseTo(start.x, 6)
      expect(L.lb.inner[0].y).toBeCloseTo(start.y, 6)
      const last = L.rb.inner[L.rb.inner.length - 1]
      expect(last.x).toBeCloseTo(end.x, 6)
      expect(last.y).toBeCloseTo(end.y, 6)
    }
  })

  it('each bumper has the same thickness all the way along', () => {
    for (const family of ['xbox', 'playstation'] as const) {
      for (const id of ['lb', 'rb'] as const) {
        const s = LAYOUTS[family][id]
        s.inner.forEach((pt, i) => {
          const o = s.outer[i]
          expect(Math.hypot(o.x - pt.x, o.y - pt.y)).toBeCloseTo(17, 6)
        })
      }
    }
  })
})

describe('additional button sizes', () => {
  it('paddles are shorter than before, and scale/width/height multiply', () => {
    expect(extraSize('paddle', { scale: 1, width: 1, height: 1 })).toEqual({ w: 28, h: 52 })
    expect(extraSize('paddle', { scale: 2, width: 2, height: 0.5 })).toEqual({ w: 112, h: 52 })
  })
})

describe('overlay-wide colors', () => {
  it('apply to the whole overlay by default', () => {
    expect(createProfile('p', 'xbox-one').settings.colorsApplyToAll).toBe(true)
  })

  it("uses the overlay colors when ticked and each part's own colors when not", () => {
    let p = createProfile('p', 'xbox-one')
    p = withSettingsPatch(p, { borderColor: '#ff0000', pressedColor: '#00ff00' })
    p = withPartPatch(p, 'south', { borderColor: '#0000ff', pressedColor: '#ffff00' })

    expect(effectiveColors(p.settings, p.parts.south)).toMatchObject({ border: '#ff0000', pressed: '#00ff00' })

    p = withSettingsPatch(p, { colorsApplyToAll: false })
    expect(effectiveColors(p.settings, p.parts.south)).toMatchObject({ border: '#0000ff', pressed: '#ffff00' })
    expect(effectiveColors(p.settings, p.parts.north).border).toBe(DEFAULT_BORDER_COLOR)
  })

  it('ignores invalid overlay colors', () => {
    const p = withSettingsPatch(createProfile('p', 'xbox-one'), { borderColor: 'red', pressedColor: '#12' })
    expect(p.settings.borderColor).toBe(DEFAULT_BORDER_COLOR)
  })

  it("a part's own colors never change another part", () => {
    const before = createProfile('p', 'xbox-one')
    const after = withPartPatch(before, 'rb', { borderColor: '#123456' })
    for (const id of BASE_PART_IDS.filter((i) => i !== 'rb')) {
      expect(after.parts[id]).toEqual(before.parts[id])
    }
  })
})

describe('switching controllers', () => {
  it('Xbox-style to PlayStation-style resets positions but keeps size, rotation and colors', () => {
    let p = createProfile('p', 'xbox-one')
    p = withPartPatch(p, 'dpadUp', { yaw: 0.9, scale: 2, rotation: 20, borderColor: '#ff0000' })
    const ps = withControllerType(p, 'ps4')
    expect(ps.parts.dpadUp.yaw).toBeCloseTo(anchorFor('playstation', 'dpadUp').x / CANVAS_W, 5)
    expect(ps.parts.dpadUp).toMatchObject({ scale: 2, rotation: 20, borderColor: '#ff0000' })
  })

  it('staying in the same layout family keeps built-in positions', () => {
    let p = createProfile('p', 'razer-wolverine')
    p = withPartPatch(p, 'dpadUp', { yaw: 0.9 })
    expect(withControllerType(p, 'xbox-one').parts.dpadUp.yaw).toBe(0.9)
  })

  it('group positions reset to the new layout but group size is kept', () => {
    let p = createProfile('p', 'xbox-one')
    p = withGroupPatch(p, 'dpad', { yaw: 0.9, scale: 2 })
    const ps = withControllerType(p, 'ps4')
    expect(ps.groups.dpad.yaw).toBeCloseTo(groupAnchorFor('playstation', 'dpad').x / CANVAS_W, 5)
    expect(ps.groups.dpad.scale).toBe(2)
  })
})

describe('older saved profiles', () => {
  it('get parts, groups, rotation and width/height filled in without losing data', () => {
    let fresh = createProfile('old', 'ps4')
    fresh = withButtonPatch(fresh, 'paddle1', { binding: { kind: 'key', code: 'KeyR' }, yaw: 0.3 })
    const buttons = Object.fromEntries(
      EXTRA_BUTTON_IDS.map((id) => {
        const rest: Record<string, unknown> = { ...fresh.buttons[id] }
        delete rest.scale
        delete rest.rotation
        delete rest.width
        delete rest.height
        return [id, rest]
      }),
    )
    const old = {
      ...fresh,
      schemaVersion: 1,
      buttons,
      parts: undefined,
      groups: undefined,
      settings: { scale: 1, deadzone: 0.25, opacity: 1 },
    } as unknown as Profile

    const fixed = normalizeProfile(old)
    expect(Object.keys(fixed.parts)).toHaveLength(19)
    expect(Object.keys(fixed.groups)).toHaveLength(3)
    expect(fixed.groups.controls).toEqual(createGroups('playstation').controls)
    expect(fixed.settings.colorsApplyToAll).toBe(true)
    expect(fixed.buttons.paddle1).toMatchObject({ scale: 1, rotation: 0, width: 1, height: 1 })
    expect(fixed.buttons.paddle1.binding).toEqual({ kind: 'key', code: 'KeyR' })
    expect(fixed.buttons.paddle1.yaw).toBe(0.3)
  })

  it('a schema-2 profile keeps its D-pad and controls group; bumpers reset', () => {
    const fresh = createProfile('v2', 'xbox-one')
    const oldParts = Object.fromEntries(
      Object.entries(fresh.parts).filter(([k]) => !k.startsWith('dpad')),
    )
    const old = {
      ...fresh,
      schemaVersion: 2,
      parts: {
        ...oldParts,
        lb: { ...fresh.parts.lb, yaw: 0.1, pitch: 0.9 },
        dpad: {
          yaw: 0.3, pitch: 0.6, scale: 1.5, artworkId: null,
          borderColor: '#ff0000', pressedColor: '#00ff00',
        },
      },
      groups: undefined,
      controlsGroup: { yaw: 0.4, pitch: 0.45, scale: 1.2 },
    } as unknown as Profile

    const fixed = normalizeProfile(old)
    expect(fixed.groups.dpad).toMatchObject({ yaw: 0.3, pitch: 0.6, scale: 1.5 })
    expect(fixed.groups.controls).toMatchObject({ yaw: 0.4, pitch: 0.45, scale: 1.2, rotation: 0 })
    expect(fixed.parts.dpadUp.borderColor).toBe('#ff0000')
    expect(fixed.parts.dpadUp.yaw * CANVAS_W).toBeCloseTo(anchorFor('xbox', 'dpadUp').x, 5)
    expect(fixed.parts.lb.yaw * CANVAS_W).toBeCloseTo(anchorFor('xbox', 'lb').x, 5)
    expect(fixed.parts.lb.pitch * CANVAS_H).toBeCloseTo(anchorFor('xbox', 'lb').y, 5)
  })
})

describe('duplicating a profile with built-in artwork', () => {
  it('copies artwork for built-in parts and keeps the copy independent', async () => {
    const original = createProfile('Original', 'scuf-envision')
    const shellArt: ArtworkRecord = {
      id: crypto.randomUUID(),
      profileId: original.id,
      kind: 'shell',
      slot: 'normal',
      name: 'shell.png',
      mime: 'image/png',
      data: new Uint8Array([1, 2, 3]).buffer,
      createdAt: Date.now(),
    }
    const withArt = withPartPatch(original, 'shell', { artwork: { normal: shellArt.id, pressed: null } })
    await db.putArtwork(shellArt)
    await db.saveProfile(withArt)

    const copy = await db.duplicateProfile(withArt.id)
    const copyArtId = copy.parts.shell.artwork.normal
    expect(copyArtId).toBeTruthy()
    expect(copyArtId).not.toBe(shellArt.id)
    const copied = await db.getArtwork(copyArtId!)
    expect(copied?.profileId).toBe(copy.id)

    await db.saveProfile(withPartPatch(copy, 'shell', { scale: 2 }))
    expect((await db.loadProfile(withArt.id))?.parts.shell.scale).toBe(1)
  })
})