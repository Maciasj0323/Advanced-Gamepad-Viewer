import { describe, expect, it } from 'vitest'
import { buildObsUrl, chooseOverlayProfile, parseEmbedded, parseOverlayParams } from './overlayMode'
import { createProfile } from './profile'

describe('reading the overlay address', () => {
  it('reads ?overlay, the profile name and the background', () => {
    expect(parseOverlayParams('?overlay&profile=tynza&bg=00ff00')).toEqual({
      overlay: true,
      profile: 'tynza',
      background: '#00ff00',
    })
  })

  it('without ?overlay it is the normal app', () => {
    expect(parseOverlayParams('').overlay).toBe(false)
    expect(parseOverlayParams('?profile=x&bg=ff0000').overlay).toBe(false)
  })

  it('accepts hex (with or without #, any case) and a few color names, and ignores junk', () => {
    expect(parseOverlayParams('?overlay&bg=%2300FF00').background).toBe('#00ff00')
    expect(parseOverlayParams('?overlay&bg=green').background).toBe('#00ff00')
    expect(parseOverlayParams('?overlay&bg=zzz').background).toBeNull()
    expect(parseOverlayParams('?overlay&bg=toString').background).toBeNull()
    expect(parseOverlayParams('?overlay').background).toBeNull()
  })
})

describe('building the short OBS link', () => {
  it('round-trips names with spaces and symbols', () => {
    const name = 'my profile+1 & ü'
    const url = buildObsUrl('https://x.test/app/', name, '#00FF00')
    const parsed = parseOverlayParams(new URL(url).search)
    expect(parsed).toEqual({ overlay: true, profile: name, background: '#00ff00' })
  })

  it('leaves the background out when transparent', () => {
    expect(buildObsUrl('https://x.test/', 'a', null)).not.toContain('bg=')
  })
})

describe('choosing the profile to show', () => {
  const a = createProfile('tynza', 'ps4')
  const b = createProfile('Other', 'xbox-one')

  it('finds a profile by name, ignoring case and spaces', () => {
    expect(chooseOverlayProfile([a, b], '  TYNZA ', b.id)).toEqual({ profile: a, missing: false })
  })

  it('never guesses: a name that is not found shows no profile', () => {
    expect(chooseOverlayProfile([a, b], 'nope', b.id)).toEqual({ profile: null, missing: true })
  })

  it('with no name it uses the saved active profile, then the first', () => {
    expect(chooseOverlayProfile([a, b], null, b.id)).toEqual({ profile: b, missing: false })
    expect(chooseOverlayProfile([a, b], null, null)).toEqual({ profile: a, missing: false })
  })

  it('returns no profile when there are none', () => {
    expect(chooseOverlayProfile([], 'x', null).profile).toBeNull()
    expect(chooseOverlayProfile([], null, null)).toEqual({ profile: null, missing: false })
  })
})

describe('data baked into an overlay file', () => {
  it('accepts a valid token and background', () => {
    expect(parseEmbedded({ token: 'g.abc_-', background: '#00FF00' })).toEqual({
      token: 'g.abc_-',
      background: '#00ff00',
    })
    expect(parseEmbedded({ token: 'j.abc', background: null })).toEqual({ token: 'j.abc', background: null })
  })

  it('ignores anything that is not a valid token', () => {
    for (const bad of [undefined, null, 5, 'x', {}, { token: 5 }, { token: 'x.abc' }, { token: 'g.a b' }, { token: 'g.<script>' }]) {
      expect(parseEmbedded(bad)).toBeNull()
    }
    expect(parseEmbedded({ token: 'g.abc', background: 'nope' })?.background).toBeNull()
  })
})

describe('helper settings in overlay addresses', () => {
  const CODE = 'a1b2c3d4e5f60718293a4b5c'

  it('are read from ?helper= and ?hport=', () => {
    expect(parseOverlayParams(`?overlay&helper=${CODE}`).helper).toEqual({ code: CODE, port: 8765 })
    expect(parseOverlayParams(`?overlay&helper=${CODE}&hport=9000`).helper).toEqual({ code: CODE, port: 9000 })
  })

  it('are ignored when invalid or missing', () => {
    expect(parseOverlayParams('?overlay&helper=short').helper).toBeUndefined()
    expect(parseOverlayParams(`?overlay&helper=${CODE}&hport=80`).helper).toBeUndefined()
    expect(parseOverlayParams('?overlay').helper).toBeUndefined()
  })

  it('round-trip through the short link', () => {
    const url = buildObsUrl('https://x.test/', 'tynza', null, { code: CODE, port: 9000 })
    expect(parseOverlayParams(new URL(url).search)).toMatchObject({
      profile: 'tynza',
      helper: { code: CODE, port: 9000 },
    })
  })

  it('are read from the data baked into an overlay file', () => {
    expect(parseEmbedded({ token: 'g.abc', background: null, helper: { code: CODE, port: 8765 } })).toEqual({
      token: 'g.abc',
      background: null,
      helper: { code: CODE, port: 8765 },
    })
    expect(parseEmbedded({ token: 'g.abc', helper: { code: 'bad' } })?.helper).toBeUndefined()
    expect(parseEmbedded({ token: 'g.abc', helper: 'nope' })?.helper).toBeUndefined()
  })
})
