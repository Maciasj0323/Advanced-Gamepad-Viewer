import { describe, expect, it } from 'vitest'
import {
  createProfile,
  describeBinding,
  withButtonPatch,
  withControllerType,
} from './profile'
import { EXTRA_BUTTON_IDS, type ExtraButtonId } from './types'

const visibleIds = (p: ReturnType<typeof createProfile>) =>
  EXTRA_BUTTON_IDS.filter((id) => p.buttons[id].visible)

describe('controller defaults', () => {
  it('Xbox One and PS4 start with no extra buttons', () => {
    expect(visibleIds(createProfile('a', 'xbox-one'))).toEqual([])
    expect(visibleIds(createProfile('b', 'ps4'))).toEqual([])
  })

  it('Razer Wolverine: 4 paddles + 2 claw bumpers, no side buttons', () => {
    expect(visibleIds(createProfile('w', 'razer-wolverine'))).toEqual([
      'paddle1', 'paddle2', 'paddle3', 'paddle4', 'clawLeft', 'clawRight',
    ])
  })

  it('SCUF: 4 paddles + 2 side buttons, no claw bumpers', () => {
    expect(visibleIds(createProfile('s', 'scuf-envision'))).toEqual([
      'paddle1', 'paddle2', 'paddle3', 'paddle4', 'sideLeft', 'sideRight',
    ])
  })

  it('has exactly eight independent buttons', () => {
    const p = createProfile('x', 'xbox-one')
    expect(Object.keys(p.buttons)).toHaveLength(12)
    expect(new Set(EXTRA_BUTTON_IDS).size).toBe(12)
    // No shared object references between buttons
    expect(p.buttons.paddle1).not.toBe(p.buttons.paddle2)
  })
})

describe('independent per-button settings', () => {
  it('changing one button never changes any other', () => {
    const before = createProfile('p', 'xbox-one')
    const after = withButtonPatch(before, 'paddle2', {
      binding: { kind: 'key', code: 'KeyF' },
      yaw: 0.9,
      visible: true,
    })
    for (const id of EXTRA_BUTTON_IDS.filter((i) => i !== 'paddle2')) {
      expect(after.buttons[id]).toEqual(before.buttons[id])
    }
    expect(after.buttons.paddle2.binding).toEqual({ kind: 'key', code: 'KeyF' })
    // original not mutated
    expect(before.buttons.paddle2.binding).toBeNull()
  })

  it('keeps four different bindings separate (spec example)', () => {
    let p = createProfile('p', 'razer-wolverine')
    p = withButtonPatch(p, 'paddle1', { binding: { kind: 'key', code: 'KeyR' } })
    p = withButtonPatch(p, 'paddle2', { binding: { kind: 'key', code: 'KeyF' } })
    p = withButtonPatch(p, 'paddle3', { binding: { kind: 'mouse', button: 3 } })
    p = withButtonPatch(p, 'paddle4', { binding: { kind: 'key', code: 'Space' } })

    expect(describeBinding(p.buttons.paddle1.binding)).toBe('KeyR')
    expect(describeBinding(p.buttons.paddle2.binding)).toBe('KeyF')
    expect(describeBinding(p.buttons.paddle3.binding)).toBe('Mouse Button 4')
    expect(describeBinding(p.buttons.paddle4.binding)).toBe('Space')
    expect(p.buttons.clawLeft.binding).toBeNull()
  })

  it('clamps positions to 0..1', () => {
    const p = withButtonPatch(createProfile('p', 'ps4'), 'sideLeft', { yaw: 5, pitch: -2 })
    expect(p.buttons.sideLeft.yaw).toBe(1)
    expect(p.buttons.sideLeft.pitch).toBe(0)
  })

  it('switching controller keeps bindings and positions, resets visibility', () => {
    let p = createProfile('p', 'razer-wolverine')
    p = withButtonPatch(p, 'paddle1', { binding: { kind: 'key', code: 'KeyR' }, yaw: 0.31 })
    const scuf = withControllerType(p, 'scuf-envision')
    expect(scuf.buttons.paddle1.binding).toEqual({ kind: 'key', code: 'KeyR' })
    expect(scuf.buttons.paddle1.yaw).toBe(0.31)
    expect(scuf.buttons.clawLeft.visible).toBe(false)
    expect(scuf.buttons.sideLeft.visible).toBe(true)
  })

  it('every button id can be patched on its own', () => {
    for (const id of EXTRA_BUTTON_IDS as readonly ExtraButtonId[]) {
      const p = withButtonPatch(createProfile('p', 'xbox-one'), id, { visible: true })
      expect(EXTRA_BUTTON_IDS.filter((x) => p.buttons[x].visible)).toEqual([id])
    }
  })
})