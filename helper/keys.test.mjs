import { describe, expect, it } from 'vitest'
import { buildKeycodeMap, eventCodeFromUiohookName, mouseButtonFromUiohook } from './keys.mjs'

describe('key names', () => {
  it('turn letters and digits into browser key names', () => {
    expect(eventCodeFromUiohookName('R')).toBe('KeyR')
    expect(eventCodeFromUiohookName('0')).toBe('Digit0')
    expect(eventCodeFromUiohookName('7')).toBe('Digit7')
  })

  it('turn modifier names into the left/right names the browser uses', () => {
    expect(eventCodeFromUiohookName('Ctrl')).toBe('ControlLeft')
    expect(eventCodeFromUiohookName('CtrlRight')).toBe('ControlRight')
    expect(eventCodeFromUiohookName('Shift')).toBe('ShiftLeft')
    expect(eventCodeFromUiohookName('ShiftRight')).toBe('ShiftRight')
    expect(eventCodeFromUiohookName('Alt')).toBe('AltLeft')
    expect(eventCodeFromUiohookName('Meta')).toBe('MetaLeft')
  })

  it('keep names that already match the browser (space, arrows, F keys, numpad, symbols)', () => {
    for (const n of ['Space', 'Enter', 'ArrowUp', 'F13', 'F24', 'Numpad5', 'NumpadAdd', 'Semicolon', 'Backquote', 'Tab']) {
      expect(eventCodeFromUiohookName(n)).toBe(n)
    }
  })

  it('does not trip over names like "toString"', () => {
    expect(eventCodeFromUiohookName('toString')).toBe('toString')
  })
})

describe('key list', () => {
  it('maps the library keycodes to browser names', () => {
    const map = buildKeycodeMap({ A: 30, 0: 11, Ctrl: 29, Space: 57, F13: 91, junk: 'x' })
    expect(map.get(30)).toBe('KeyA')
    expect(map.get(11)).toBe('Digit0')
    expect(map.get(29)).toBe('ControlLeft')
    expect(map.get(57)).toBe('Space')
    expect(map.get(91)).toBe('F13')
    expect(map.size).toBe(5)
  })
})

describe('mouse buttons', () => {
  it('map to the numbers the app uses', () => {
    expect(mouseButtonFromUiohook(1)).toBe(0) // left
    expect(mouseButtonFromUiohook(3)).toBe(1) // middle
    expect(mouseButtonFromUiohook(2)).toBe(2) // right
    expect(mouseButtonFromUiohook(4)).toBe(3) // back
    expect(mouseButtonFromUiohook(5)).toBe(4) // forward
    expect(mouseButtonFromUiohook(9)).toBeNull()
  })
})
