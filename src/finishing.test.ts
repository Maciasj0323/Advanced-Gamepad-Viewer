import { describe, expect, it } from 'vitest'
import { readPadState, type PadLike } from './gamepad'
import { defaultFill, effectiveColors } from './parts'
import {
  createProfile,
  normalizeProfile,
  withButtonPatch,
  withPartPatch,
  withSettingsPatch,
} from './profile'
import {
  BASE_PART_IDS,
  DEFAULT_FILL_COLOR,
  DEFAULT_SHELL_FILL_COLOR,
  DEFAULT_STICK_TRAVEL,
  EXTRA_BUTTON_IDS,
  MAX_DEADZONE,
  MAX_STICK_TRAVEL,
  MIN_STICK_TRAVEL,
  type Profile,
} from './types'

const padWith = (axes: number[]): PadLike => ({
  id: 'Test pad',
  mapping: 'standard',
  buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
  axes,
})

describe('stick deadzone', () => {
  it('the default deadzone hides small drift', () => {
    const s = readPadState(padWith([0.08, 0.05, 0.06, 0.02]), 0.25)
    expect(s.leftStick).toEqual({ x: 0, y: 0 })
    expect(s.rightStick).toEqual({ x: 0, y: 0 })
  })

  it('a deadzone of 0 shows even tiny drift on both sticks', () => {
    const s = readPadState(padWith([0.04, -0.03, 0.02, 0.01]), 0)
    expect(s.leftStick).toEqual({ x: 0.04, y: -0.03 })
    expect(s.rightStick).toEqual({ x: 0.02, y: 0.01 })
  })

  it('a larger deadzone hides larger movement', () => {
    expect(readPadState(padWith([0.4, 0, 0, 0]), 0.5).leftStick).toEqual({ x: 0, y: 0 })
    expect(readPadState(padWith([0.6, 0, 0, 0]), 0.5).leftStick).toEqual({ x: 0.6, y: 0 })
  })

  it('the settings stay in range', () => {
    const p = createProfile('p', 'xbox-one')
    expect(withSettingsPatch(p, { deadzone: -1 }).settings.deadzone).toBe(0)
    expect(withSettingsPatch(p, { deadzone: 0 }).settings.deadzone).toBe(0)
    expect(withSettingsPatch(p, { deadzone: 5 }).settings.deadzone).toBe(MAX_DEADZONE)
    expect(withSettingsPatch(p, { stickTravel: 1 }).settings.stickTravel).toBe(MIN_STICK_TRAVEL)
    expect(withSettingsPatch(p, { stickTravel: 99 }).settings.stickTravel).toBe(MAX_STICK_TRAVEL)
  })
})

describe('fill colors', () => {
  it('start with the original look: dark shell, grey buttons', () => {
    const p = createProfile('p', 'xbox-one')
    expect(p.parts.shell.fillColor).toBe(DEFAULT_SHELL_FILL_COLOR)
    for (const id of BASE_PART_IDS.filter((i) => i !== 'shell')) {
      expect(p.parts[id].fillColor).toBe(DEFAULT_FILL_COLOR)
    }
    for (const id of EXTRA_BUTTON_IDS) expect(p.buttons[id].fillColor).toBe(DEFAULT_FILL_COLOR)
    expect(p.settings.fillColor).toBe(DEFAULT_FILL_COLOR)
    expect(p.settings.shellFillColor).toBe(DEFAULT_SHELL_FILL_COLOR)
    expect(p.settings.stickTravel).toBe(DEFAULT_STICK_TRAVEL)
    expect(defaultFill('shell')).toBe(DEFAULT_SHELL_FILL_COLOR)
    expect(defaultFill('south')).toBe(DEFAULT_FILL_COLOR)
  })

  it('overlay colors: button fill for parts and extras, shell fill for the shell', () => {
    const p = withSettingsPatch(createProfile('p', 'xbox-one'), {
      fillColor: '#111111',
      shellFillColor: '#222222',
    })
    expect(effectiveColors(p.settings, p.parts.south).fill).toBe('#111111')
    expect(effectiveColors(p.settings, p.buttons.paddle1).fill).toBe('#111111')
    expect(effectiveColors(p.settings, p.parts.shell, true).fill).toBe('#222222')
  })

  it("uses each part's own fill when colors are not applied to the whole overlay", () => {
    let p = createProfile('p', 'xbox-one')
    p = withSettingsPatch(p, { fillColor: '#111111', colorsApplyToAll: false })
    p = withPartPatch(p, 'south', { fillColor: '#abcdef' })
    p = withButtonPatch(p, 'paddle2', { fillColor: '#fedcba' })
    expect(effectiveColors(p.settings, p.parts.south).fill).toBe('#abcdef')
    expect(effectiveColors(p.settings, p.buttons.paddle2).fill).toBe('#fedcba')
    expect(effectiveColors(p.settings, p.parts.north).fill).toBe(DEFAULT_FILL_COLOR)
  })

  it("changing one part's fill never changes another part or extra", () => {
    const before = createProfile('p', 'razer-wolverine')
    const after = withPartPatch(before, 'rb', { fillColor: '#123456' })
    for (const id of BASE_PART_IDS.filter((i) => i !== 'rb')) {
      expect(after.parts[id]).toEqual(before.parts[id])
    }
    expect(after.buttons).toEqual(before.buttons)
    const extra = withButtonPatch(before, 'paddle1', { fillColor: '#654321' })
    for (const id of EXTRA_BUTTON_IDS.filter((i) => i !== 'paddle1')) {
      expect(extra.buttons[id]).toEqual(before.buttons[id])
    }
  })

  it('ignores invalid fill colors', () => {
    let p = createProfile('p', 'ps4')
    p = withPartPatch(p, 'south', { fillColor: 'blue' })
    p = withButtonPatch(p, 'paddle1', { fillColor: '#12' })
    p = withSettingsPatch(p, { fillColor: 'nope', shellFillColor: '' })
    expect(p.parts.south.fillColor).toBe(DEFAULT_FILL_COLOR)
    expect(p.buttons.paddle1.fillColor).toBe(DEFAULT_FILL_COLOR)
    expect(p.settings.fillColor).toBe(DEFAULT_FILL_COLOR)
    expect(p.settings.shellFillColor).toBe(DEFAULT_SHELL_FILL_COLOR)
  })
})

function withoutFill(rec: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(rec).map(([k, v]) => {
      const rest: Record<string, unknown> = { ...(v as Record<string, unknown>) }
      delete rest.fillColor
      return [k, rest]
    }),
  )
}

describe('older profiles', () => {
  it('get fill colors and stick travel without losing their other settings', () => {
    const fresh = createProfile('old', 'ps4')
    const old = {
      ...fresh,
      schemaVersion: 4,
      parts: withoutFill(fresh.parts),
      buttons: withoutFill(fresh.buttons),
      settings: {
        scale: 1,
        deadzone: 0.1,
        opacity: 1,
        colorsApplyToAll: false,
        borderColor: '#ff0000',
        pressedColor: '#00ff00',
      },
    } as unknown as Profile

    const fixed = normalizeProfile(old)
    expect(fixed.parts.shell.fillColor).toBe(DEFAULT_SHELL_FILL_COLOR)
    expect(fixed.parts.south.fillColor).toBe(DEFAULT_FILL_COLOR)
    expect(fixed.buttons.paddle1.fillColor).toBe(DEFAULT_FILL_COLOR)
    expect(fixed.settings.fillColor).toBe(DEFAULT_FILL_COLOR)
    expect(fixed.settings.shellFillColor).toBe(DEFAULT_SHELL_FILL_COLOR)
    expect(fixed.settings.stickTravel).toBe(DEFAULT_STICK_TRAVEL)
    expect(fixed.settings.deadzone).toBe(0.1)
    expect(fixed.settings.borderColor).toBe('#ff0000')
    expect(fixed.settings.colorsApplyToAll).toBe(false)
  })
})