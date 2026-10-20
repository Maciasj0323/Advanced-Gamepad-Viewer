import { describe, expect, it } from 'vitest'
import { readPadState } from './gamepad'
import { InputTracker } from './input'
import { createProfile, withButtonPatch } from './profile'
import { extraKind, litExtras, visibleExtras } from './extras'
import { EXTRA_BUTTON_IDS } from './types'

const R = { kind: 'key', code: 'KeyR' } as const
const F = { kind: 'key', code: 'KeyF' } as const

describe('extra buttons layer', () => {
  it('only draws buttons the profile has switched on', () => {
    expect(visibleExtras(createProfile('w', 'razer-wolverine').buttons)).toEqual([
      'paddle1', 'paddle2', 'paddle3', 'paddle4', 'clawLeft', 'clawRight',
    ])
    expect(visibleExtras(createProfile('x', 'xbox-one').buttons)).toEqual([])
  })

  it('a hidden button never lights, even if bound and held', () => {
    let p = createProfile('p', 'xbox-one') // everything hidden
    p = withButtonPatch(p, 'paddle1', { binding: R })
    const t = new InputTracker()
    t.press(R)
    expect(litExtras(p.buttons, t.snapshot()).size).toBe(0)

    p = withButtonPatch(p, 'paddle1', { visible: true })
    expect([...litExtras(p.buttons, t.snapshot())]).toEqual(['paddle1'])
  })

  it('a visible button lights only while its own input is held', () => {
    let p = createProfile('p', 'razer-wolverine')
    p = withButtonPatch(p, 'paddle1', { binding: R })
    p = withButtonPatch(p, 'paddle2', { binding: F })
    const t = new InputTracker()

    t.press(R)
    expect([...litExtras(p.buttons, t.snapshot())]).toEqual(['paddle1'])
    t.release(R)
    expect(litExtras(p.buttons, t.snapshot()).size).toBe(0)
    t.press(F)
    expect([...litExtras(p.buttons, t.snapshot())]).toEqual(['paddle2'])
  })

  it('visible but unassigned buttons never light', () => {
    const p = createProfile('p', 'razer-wolverine') // visible, no bindings
    const t = new InputTracker()
    t.press(R)
    t.press({ kind: 'mouse', button: 3 })
    expect(litExtras(p.buttons, t.snapshot()).size).toBe(0)
  })

  it('controller input can never light an extra', () => {
    // Every controller button and axis fully pressed...
    const pad = {
      id: 'Test pad',
      mapping: 'standard',
      buttons: Array.from({ length: 18 }, () => ({ pressed: true, value: 1 })),
      axes: [1, 1, 1, 1],
    }
    expect(readPadState(pad).pressed.south).toBe(true)

    // ...but extras depend only on keyboard/mouse state.
    let p = createProfile('p', 'razer-wolverine')
    p = withButtonPatch(p, 'paddle1', { binding: R })
    expect(litExtras(p.buttons, new InputTracker().snapshot()).size).toBe(0)
  })

  it('groups the eight buttons into 4 paddles, 2 claw bumpers and 2 side buttons', () => {
    const kinds = EXTRA_BUTTON_IDS.map(extraKind)
    expect(kinds.filter((k) => k === 'paddle')).toHaveLength(4)
    expect(kinds.filter((k) => k === 'claw')).toHaveLength(2)
    expect(kinds.filter((k) => k === 'side')).toHaveLength(2)
  })
})