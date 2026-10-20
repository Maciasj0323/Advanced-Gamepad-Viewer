import { describe, expect, it } from 'vitest'
import { contrastText, sharedWith } from './extras'
import { createProfile, formatBinding, normalizeProfile, withButtonPatch } from './profile'
import {
  DEFAULT_BORDER_COLOR,
  DEFAULT_PRESSED_COLOR,
  EXTRA_BUTTON_IDS,
  type ExtraButtonConfig,
  type Profile,
} from './types'

const R = { kind: 'key', code: 'KeyR' } as const
const F = { kind: 'key', code: 'KeyF' } as const

describe('button colors', () => {
  it('every button starts with the default colors', () => {
    const p = createProfile('p', 'xbox-one')
    for (const id of EXTRA_BUTTON_IDS) {
      expect(p.buttons[id].borderColor).toBe(DEFAULT_BORDER_COLOR)
      expect(p.buttons[id].pressedColor).toBe(DEFAULT_PRESSED_COLOR)
    }
  })

  it('changing one button color leaves every other button alone', () => {
    const before = createProfile('p', 'xbox-one')
    const after = withButtonPatch(before, 'paddle2', { borderColor: '#ff0000', pressedColor: '#00ff00' })
    expect(after.buttons.paddle2.borderColor).toBe('#ff0000')
    expect(after.buttons.paddle2.pressedColor).toBe('#00ff00')
    for (const id of EXTRA_BUTTON_IDS.filter((i) => i !== 'paddle2')) {
      expect(after.buttons[id]).toEqual(before.buttons[id])
    }
  })

  it('ignores invalid colors', () => {
    const p = withButtonPatch(createProfile('p', 'ps4'), 'paddle1', {
      borderColor: 'red',
      pressedColor: '#12',
    })
    expect(p.buttons.paddle1.borderColor).toBe(DEFAULT_BORDER_COLOR)
    expect(p.buttons.paddle1.pressedColor).toBe(DEFAULT_PRESSED_COLOR)
  })

  it('fills in colors on profiles saved before colors existed', () => {
    let p = createProfile('old', 'ps4')
    p = withButtonPatch(p, 'paddle1', { binding: R, yaw: 0.3 })
    const stripped = {
      ...p,
      buttons: Object.fromEntries(
        EXTRA_BUTTON_IDS.map((id) => {
          const rest: Partial<ExtraButtonConfig> = { ...p.buttons[id] }
          delete rest.borderColor
          delete rest.pressedColor
          return [id, rest]
        }),
      ),
    } as unknown as Profile

    const fixed = normalizeProfile(stripped)
    for (const id of EXTRA_BUTTON_IDS) {
      expect(fixed.buttons[id].borderColor).toBe(DEFAULT_BORDER_COLOR)
      expect(fixed.buttons[id].pressedColor).toBe(DEFAULT_PRESSED_COLOR)
    }
    expect(fixed.buttons.paddle1.binding).toEqual(R)
    expect(fixed.buttons.paddle1.yaw).toBe(0.3)
  })

  it('picks readable text for light and dark colors', () => {
    expect(contrastText('#ffd23f')).toBe('#1b1e25')
    expect(contrastText('#000000')).toBe('#ffffff')
    expect(contrastText('nope')).toBe('#ffffff')
  })
})

describe('binding display', () => {
  it('formats keys in a friendly way', () => {
    expect(formatBinding({ kind: 'key', code: 'KeyR' })).toBe('R')
    expect(formatBinding({ kind: 'key', code: 'Digit1' })).toBe('1')
    expect(formatBinding({ kind: 'key', code: 'Space' })).toBe('Space')
    expect(formatBinding({ kind: 'key', code: 'ShiftLeft' })).toBe('Shift Left')
    expect(formatBinding({ kind: 'key', code: 'ArrowUp' })).toBe('Arrow Up')
    expect(formatBinding({ kind: 'key', code: 'Numpad5' })).toBe('Numpad 5')
    expect(formatBinding({ kind: 'key', code: 'F13' })).toBe('F13')
  })

  it('formats mouse buttons and empty bindings', () => {
    expect(formatBinding({ kind: 'mouse', button: 0 })).toBe('Left click')
    expect(formatBinding({ kind: 'mouse', button: 3 })).toBe('Mouse Button 4')
    expect(formatBinding(null)).toBe('Not assigned')
  })

  it('lists the other buttons sharing a binding', () => {
    let p = createProfile('p', 'xbox-one')
    p = withButtonPatch(p, 'paddle1', { binding: R })
    p = withButtonPatch(p, 'clawLeft', { binding: R })
    p = withButtonPatch(p, 'paddle2', { binding: F })
    expect(sharedWith(p.buttons, 'paddle1')).toEqual(['clawLeft'])
    expect(sharedWith(p.buttons, 'paddle2')).toEqual([])
    expect(sharedWith(p.buttons, 'sideLeft')).toEqual([])
  })
})