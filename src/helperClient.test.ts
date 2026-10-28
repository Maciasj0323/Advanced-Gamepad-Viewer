import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HELPER_PORT,
  helperQuery,
  helperUrl,
  parseHelperConfig,
  parseHelperMessage,
  watchedInputs,
} from './helperClient'
import { createProfile, withButtonPatch } from './profile'

const CODE = 'a1b2c3d4e5f60718293a4b5c'

describe('helper settings', () => {
  it('accept a hex code with the default or a custom port, lowercased', () => {
    expect(parseHelperConfig(CODE)).toEqual({ code: CODE, port: DEFAULT_HELPER_PORT })
    expect(parseHelperConfig(`  ${CODE.toUpperCase()} `, '9000')).toEqual({ code: CODE, port: 9000 })
    expect(parseHelperConfig(CODE, 9001)).toEqual({ code: CODE, port: 9001 })
    expect(parseHelperConfig(CODE, '')).toEqual({ code: CODE, port: DEFAULT_HELPER_PORT })
  })

  it('reject anything that is not a code or a sensible port', () => {
    for (const bad of [undefined, null, 5, '', 'abc', 'g'.repeat(24), `${CODE}!`, 'a'.repeat(15), 'a'.repeat(65)]) {
      expect(parseHelperConfig(bad)).toBeNull()
    }
    for (const port of ['80', '70000', 'x', '12.5', '-1']) {
      expect(parseHelperConfig(CODE, port)).toBeNull()
    }
  })

  it('carry the code inside overlay addresses, leaving out the default port', () => {
    expect(helperQuery(null)).toBe('')
    expect(helperQuery(undefined)).toBe('')
    expect(helperQuery({ code: CODE, port: DEFAULT_HELPER_PORT })).toBe(`&helper=${CODE}`)
    expect(helperQuery({ code: CODE, port: 9000 })).toBe(`&helper=${CODE}&hport=9000`)
  })
})

describe('what the helper is asked to watch', () => {
  it('is every visible, bound extra button, each input once, in a fixed order', () => {
    let p = createProfile('p', 'razer-wolverine') // paddles + claws visible
    p = withButtonPatch(p, 'paddle1', { binding: { kind: 'key', code: 'KeyR' } })
    p = withButtonPatch(p, 'paddle2', { binding: { kind: 'key', code: 'KeyR' } })
    p = withButtonPatch(p, 'paddle3', { binding: { kind: 'mouse', button: 3 } })
    p = withButtonPatch(p, 'clawLeft', { binding: { kind: 'key', code: 'KeyF' } })
    p = withButtonPatch(p, 'sideLeft', { binding: { kind: 'key', code: 'KeyG' } }) // hidden
    expect(watchedInputs(p.buttons)).toEqual(['key:KeyF', 'key:KeyR', 'mouse:3'])
  })

  it('is empty when nothing visible has a binding', () => {
    expect(watchedInputs(createProfile('p', 'razer-wolverine').buttons)).toEqual([])
  })

  it('goes into the address the overlay connects to', () => {
    expect(helperUrl({ code: CODE, port: 8765 }, ['key:KeyR', 'mouse:3'])).toBe(
      `http://127.0.0.1:8765/events?code=${CODE}&watch=key%3AKeyR%2Cmouse%3A3`,
    )
  })
})

describe('messages from the helper', () => {
  it('read key and mouse presses and releases', () => {
    expect(parseHelperMessage('{"d":1,"b":"key:KeyR"}')).toEqual({
      down: true,
      binding: { kind: 'key', code: 'KeyR' },
    })
    expect(parseHelperMessage('{"d":0,"b":"mouse:3"}')).toEqual({
      down: false,
      binding: { kind: 'mouse', button: 3 },
    })
  })

  it('ignore anything else', () => {
    for (const bad of ['', 'nope', '5', 'null', '{}', '{"d":2,"b":"key:KeyR"}', '{"d":1,"b":"key:Bad Code"}', '{"d":1,"b":"mouse:abc"}', '{"d":1,"b":5}']) {
      expect(parseHelperMessage(bad)).toBeNull()
    }
  })
})
