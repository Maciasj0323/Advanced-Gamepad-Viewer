import { describe, expect, it, vi } from 'vitest'
import { activeExtraButtons, bindingKey, bindingsEqual, InputTracker } from './input'
import { createProfile, withButtonPatch } from './profile'

const R = { kind: 'key', code: 'KeyR' } as const
const F = { kind: 'key', code: 'KeyF' } as const
const MB4 = { kind: 'mouse', button: 3 } as const

describe('bindings', () => {
  it('keys and mouse buttons have distinct identities', () => {
    expect(bindingKey(R)).toBe('key:KeyR')
    expect(bindingKey(MB4)).toBe('mouse:3')
    expect(bindingsEqual(R, { kind: 'key', code: 'KeyR' })).toBe(true)
    expect(bindingsEqual(R, F)).toBe(false)
    expect(bindingsEqual(R, null)).toBe(false)
  })
})

describe('InputTracker', () => {
  it('tracks press and release', () => {
    const t = new InputTracker()
    t.press(R)
    expect(t.isDown(R)).toBe(true)
    expect(t.isDown(F)).toBe(false)
    t.release(R)
    expect(t.isDown(R)).toBe(false)
  })

  it('clear releases everything', () => {
    const t = new InputTracker()
    t.press(R)
    t.press(MB4)
    t.clear()
    expect(t.isDown(R)).toBe(false)
    expect(t.isDown(MB4)).toBe(false)
  })

  it('notifies subscribers only on real changes, and can unsubscribe', () => {
    const t = new InputTracker()
    const fn = vi.fn()
    const unsubscribe = t.subscribe(fn)
    t.press(R)
    t.press(R) // key repeat: no change
    expect(fn).toHaveBeenCalledTimes(1)
    t.release(R)
    expect(fn).toHaveBeenCalledTimes(2)
    unsubscribe()
    t.press(R)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('activeExtraButtons', () => {
  it('lights up only the button bound to the held input', () => {
    let p = createProfile('p', 'razer-wolverine')
    p = withButtonPatch(p, 'paddle1', { binding: R })
    p = withButtonPatch(p, 'paddle2', { binding: F })
    const t = new InputTracker()

    t.press(R)
    expect([...activeExtraButtons(p.buttons, t.snapshot())]).toEqual(['paddle1'])

    t.release(R)
    expect(activeExtraButtons(p.buttons, t.snapshot()).size).toBe(0)
  })

  it('lights up every button that intentionally shares a binding', () => {
    let p = createProfile('p', 'xbox-one')
    p = withButtonPatch(p, 'paddle1', { binding: R })
    p = withButtonPatch(p, 'clawLeft', { binding: R })
    const t = new InputTracker()
    t.press(R)
    expect([...activeExtraButtons(p.buttons, t.snapshot())].sort()).toEqual([
      'clawLeft',
      'paddle1',
    ])
  })

  it('handles mouse buttons and ignores unassigned buttons', () => {
    let p = createProfile('p', 'xbox-one')
    p = withButtonPatch(p, 'paddle3', { binding: MB4 })
    const t = new InputTracker()
    t.press(MB4)
    expect([...activeExtraButtons(p.buttons, t.snapshot())]).toEqual(['paddle3'])
    t.release(MB4)
    t.press(F) // nothing is bound to F
    expect(activeExtraButtons(p.buttons, t.snapshot()).size).toBe(0)
  })
})