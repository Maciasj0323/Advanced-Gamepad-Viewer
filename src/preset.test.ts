import { describe, expect, it } from 'vitest'
import { CONTROLLER_LIST, CONTROLLERS, DEFAULT_POSITIONS } from './controllers'
import { EXTRA_BASE_ROTATION } from './extras'
import { CANVAS_W, LAYOUTS } from './layouts'
import { createProfile, normalizeProfile, withControllerType } from './profile'
import { EXTRA_BUTTON_IDS, type Profile } from './types'

const MIDDLE = ['mid1', 'mid2', 'mid3', 'mid4'] as const

describe('Gamesir Tarantula 8k preset', () => {
  it('is in the controller list with its label', () => {
    expect(CONTROLLER_LIST.map((c) => c.label)).toContain('Gamesir Tarantula 8k')
  })

  it('has its own layout with the paddles, claw bumpers and four middle buttons on', () => {
    expect(CONTROLLERS['gamesir-tarantula-8k'].family).toBe('gamesir')
    const p = createProfile('t', 'gamesir-tarantula-8k')
    const on = EXTRA_BUTTON_IDS.filter((id) => p.buttons[id].visible)
    expect(on).toEqual([
      'paddle1', 'paddle2', 'paddle3', 'paddle4', 'clawLeft', 'clawRight',
      'mid1', 'mid2', 'mid3', 'mid4',
    ])
    expect(p.buttons.sideLeft.visible).toBe(false)
    expect(p.buttons.sideRight.visible).toBe(false)
  })

  it('the other controllers do not show the middle buttons by default', () => {
    for (const type of ['xbox-one', 'ps4', 'razer-wolverine', 'scuf-envision'] as const) {
      const p = createProfile('x', type)
      for (const id of MIDDLE) expect(p.buttons[id].visible).toBe(false)
    }
  })

  it('switching to it from PS4 moves built-in parts to its layout and turns the extras on', () => {
    const t = withControllerType(createProfile('p', 'ps4'), 'gamesir-tarantula-8k')
    expect(t.parts.dpadUp.yaw * CANVAS_W).toBeCloseTo(LAYOUTS.gamesir.dpad.x, 5)
    expect(t.buttons.paddle1.visible).toBe(true)
    expect(t.buttons.mid1.visible).toBe(true)
    expect(t.buttons.sideLeft.visible).toBe(false)
  })

  it('its layout has no touchpad and bumpers that meet the shell corners', () => {
    const L = LAYOUTS.gamesir
    expect(L.touchpad).toBeNull()
    expect(L.lb.inner[0].x).toBeCloseTo(L.topEdge[0].x, 6)
    expect(L.lb.inner[0].y).toBeCloseTo(L.topEdge[0].y, 6)
    const last = L.rb.inner[L.rb.inner.length - 1]
    expect(last.x).toBeCloseTo(L.topEdge[3].x, 6)
    expect(last.y).toBeCloseTo(L.topEdge[3].y, 6)
    expect(L.body.startsWith('M94 125 C150 82 450 82 506 125')).toBe(true)
  })

  it('the C buttons mirror each other left to right', () => {
    const d = DEFAULT_POSITIONS
    expect(d.mid1.yaw + d.mid4.yaw).toBeCloseTo(1, 3)
    expect(d.mid2.yaw + d.mid3.yaw).toBeCloseTo(1, 3)
    expect(d.mid1.pitch).toBe(d.mid4.pitch)
    expect(d.mid2.pitch).toBe(d.mid3.pitch)
    expect(EXTRA_BASE_ROTATION.mid1).toBe(-EXTRA_BASE_ROTATION.mid4)
    expect(EXTRA_BASE_ROTATION.mid2).toBe(-EXTRA_BASE_ROTATION.mid3)
  })

  it('a profile saved before the middle buttons existed gets them with defaults', () => {
    const p = createProfile('old', 'gamesir-tarantula-8k')
    const buttons: Record<string, unknown> = { ...p.buttons }
    for (const id of MIDDLE) delete buttons[id]
    const fixed = normalizeProfile({ ...p, buttons } as unknown as Profile)
    for (const id of MIDDLE) {
      expect(fixed.buttons[id].visible).toBe(true)
      expect(fixed.buttons[id].yaw).toBe(DEFAULT_POSITIONS[id].yaw)
      expect(fixed.buttons[id].binding).toBeNull()
    }
  })

  it('a saved profile of this type survives loading', () => {
    const p = createProfile('t', 'gamesir-tarantula-8k')
    expect(normalizeProfile(p).controllerType).toBe('gamesir-tarantula-8k')
  })
})
