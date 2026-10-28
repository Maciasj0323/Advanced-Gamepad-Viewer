import { afterEach, describe, expect, it, vi } from 'vitest'
import { newId } from './profile'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => vi.unstubAllGlobals())

describe('newId', () => {
  it('makes unique version-4 ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(V4)
  })

  it('still works on pages without crypto.randomUUID (like OBS local files)', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (a: Uint8Array) => {
        for (let i = 0; i < a.length; i++) a[i] = (i * 37 + 11) % 256
        return a
      },
    })
    expect(newId()).toMatch(V4)
  })

  it('and even with no crypto at all', () => {
    vi.stubGlobal('crypto', undefined)
    expect(newId()).toMatch(V4)
  })
})
