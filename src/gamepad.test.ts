import { describe, expect, it } from 'vitest'
import { emptyPadState, pickPad, readPadState, type PadLike } from './gamepad'

const button = (pressed = false, value = pressed ? 1 : 0) => ({ pressed, value })

function makePad(pressedIndexes: number[] = [], axes = [0, 0, 0, 0]): PadLike {
  return {
    id: 'Test pad',
    buttons: Array.from({ length: 18 }, (_, i) => button(pressedIndexes.includes(i))),
    axes,
  }
}

// Mirrors the real SCUF Envision V2 readings from the diagnostic test.
function makeScuf(pressed: number[] = [], overrides: Record<number, number> = {}): PadLike {
  const axes = [0, 0, 0, -1, -1, 0, 0, 0, 0, 1.29]
  for (const [i, v] of Object.entries(overrides)) axes[Number(i)] = v
  return {
    id: 'SCUF Envision Controller V2 (Vendor: 1b1c Product: 3a04)',
    mapping: '',
    buttons: Array.from({ length: 19 }, (_, i) => button(pressed.includes(i))),
    axes,
  }
}

describe('readPadState', () => {
  it('returns a disconnected, all-released state when there is no pad', () => {
    const s = readPadState(null)
    expect(s.connected).toBe(false)
    expect(Object.values(s.pressed).every((v) => v === false)).toBe(true)
    expect(s).toEqual(emptyPadState())
  })

  it('maps standard button indexes to names', () => {
    const s = readPadState(makePad([0, 12]))
    expect(s.connected).toBe(true)
    expect(s.pressed.south).toBe(true)
    expect(s.pressed.up).toBe(true)
    expect(s.pressed.east).toBe(false)
    expect(s.pressed.lb).toBe(false)
  })

  it('reads analog trigger values', () => {
    const pad = makePad()
    const buttons = [...pad.buttons]
    buttons[6] = { pressed: true, value: 0.6 }
    buttons[7] = { pressed: false, value: 0.2 }
    const s = readPadState({ ...pad, buttons })
    expect(s.lt).toBe(0.6)
    expect(s.rt).toBe(0.2)
  })

  it('applies the deadzone to sticks', () => {
    const s = readPadState(makePad([], [0.1, 0.1, 0.9, 0]), 0.25)
    expect(s.leftStick).toEqual({ x: 0, y: 0 })
    expect(s.rightStick).toEqual({ x: 0.9, y: 0 })
  })

  it('copes with a pad that reports fewer buttons', () => {
    const s = readPadState({ buttons: [button(true)], axes: [] })
    expect(s.pressed.south).toBe(true)
    expect(s.pressed.touchpad).toBe(false)
    expect(s.leftStick).toEqual({ x: 0, y: 0 })
  })
})

describe('SCUF Envision V2 layout', () => {
  it('maps face buttons, bumpers and menu buttons to their real indexes', () => {
    const s = readPadState(makeScuf([0, 4, 6, 7, 8, 10]))
    expect(s.mapped).toBe(true)
    expect(s.pressed.south).toBe(true)
    expect(s.pressed.lb).toBe(true)
    expect(s.pressed.back).toBe(true)
    expect(s.pressed.start).toBe(true)
    expect(s.pressed.l3).toBe(true)
    expect(s.pressed.home).toBe(true)
    expect(s.pressed.r3).toBe(false)
    expect(s.pressed.east).toBe(false)
  })

  it('reads triggers from axes 3 and 4 (rest -1, pressed +1)', () => {
    const rest = readPadState(makeScuf())
    expect(rest.lt).toBe(0)
    expect(rest.rt).toBe(0)
    expect(rest.pressed.lt).toBe(false)

    const s = readPadState(makeScuf([], { 3: 1, 4: 0 }))
    expect(s.lt).toBe(1)
    expect(s.pressed.lt).toBe(true)
    expect(s.rt).toBe(0.5)
  })

  it('decodes the four D-pad directions from the hat axis', () => {
    const dir = (v: number) => {
      const s = readPadState(makeScuf([], { 9: v }))
      return { up: s.pressed.up, down: s.pressed.down, left: s.pressed.left, right: s.pressed.right }
    }
    expect(dir(-1)).toEqual({ up: true, down: false, left: false, right: false })
    expect(dir(0.14)).toEqual({ up: false, down: true, left: false, right: false })
    expect(dir(0.71)).toEqual({ up: false, down: false, left: true, right: false })
    expect(dir(-0.43)).toEqual({ up: false, down: false, left: false, right: true })
  })

  it('decodes diagonals and the neutral position', () => {
    const at = (v: number) => readPadState(makeScuf([], { 9: v })).pressed
    expect(at(-0.71).up && at(-0.71).right).toBe(true)
    expect(at(1.0).up && at(1.0).left).toBe(true)
    const neutral = at(1.29)
    expect(neutral.up || neutral.down || neutral.left || neutral.right).toBe(false)
  })

  it('reads the right stick from axes 2 and 5', () => {
    const s = readPadState(makeScuf([], { 2: 0.9, 5: 0.8 }))
    expect(s.rightStick).toEqual({ x: 0.9, y: 0.8 })
    expect(s.leftStick).toEqual({ x: 0, y: 0 })
  })
})

describe('pad selection and fallback', () => {
  it('prefers a controller whose layout is known', () => {
    const unknown: PadLike = {
      id: 'Unknown Gamepad (Vendor: 045e Product: 09a6)',
      mapping: '',
      buttons: [],
      axes: [],
    }
    expect(pickPad([unknown, makeScuf()])?.id).toContain('SCUF')
    expect(pickPad([makeScuf(), unknown])?.id).toContain('SCUF')
  })

  it('falls back to the standard layout for unknown pads and flags it', () => {
    const s = readPadState({ id: 'Mystery pad', mapping: '', buttons: [button(true)], axes: [] })
    expect(s.mapped).toBe(false)
    expect(s.pressed.south).toBe(true)
  })
})