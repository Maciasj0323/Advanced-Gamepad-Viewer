import { describe, expect, it } from 'vitest'
import { buildObsUrl, chooseOverlayProfile, parseOverlayParams } from './overlayMode'
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

describe('building the OBS link', () => {
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

  it('falls back to the saved active profile, then the first, and says it was missing', () => {
    expect(chooseOverlayProfile([a, b], 'nope', b.id)).toEqual({ profile: b, missing: true })
    expect(chooseOverlayProfile([a, b], 'nope', null)).toEqual({ profile: a, missing: true })
    expect(chooseOverlayProfile([a, b], null, b.id)).toEqual({ profile: b, missing: false })
  })

  it('returns no profile when there are none', () => {
    expect(chooseOverlayProfile([], 'x', null).profile).toBeNull()
  })
})
