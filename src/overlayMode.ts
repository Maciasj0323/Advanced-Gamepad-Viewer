import { helperQuery, parseHelperConfig, type HelperConfig } from './helperClient'
import type { Profile } from './types'

export interface OverlayParams {
  /** true when the address has ?overlay (show only the overlay). */
  overlay: boolean
  /** Profile name from ?profile=..., or null. */
  profile: string | null
  /** Background color from ?bg=..., or null for transparent. */
  background: string | null
  /** Input helper settings from ?helper=CODE (and ?hport=), when given and valid. */
  helper?: HelperConfig
}

const NAMED: Record<string, string> = {
  green: '#00ff00',
  blue: '#0000ff',
  magenta: '#ff00ff',
  black: '#000000',
  white: '#ffffff',
}

function readBackground(raw: string | null): string | null {
  const v = (raw ?? '').trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{6}$/.test(v)) return `#${v}`
  return Object.prototype.hasOwnProperty.call(NAMED, v) ? NAMED[v] : null
}

/** Reads the overlay settings out of an address's query string (location.search). */
export function parseOverlayParams(search: string): OverlayParams {
  const q = new URLSearchParams(search)
  const profile = q.get('profile')?.trim()
  const helper = parseHelperConfig(q.get('helper'), q.get('hport'))
  return {
    overlay: q.has('overlay'),
    profile: profile ? profile : null,
    background: readBackground(q.get('bg')),
    ...(helper ? { helper } : {}),
  }
}

/** Builds the address to paste into OBS. */
export function buildObsUrl(
  base: string,
  profileName: string,
  background: string | null,
  helper?: HelperConfig | null,
): string {
  let url = `${base}?overlay&profile=${encodeURIComponent(profileName)}`
  if (background && /^#[0-9a-f]{6}$/i.test(background)) url += `&bg=${background.slice(1).toLowerCase()}`
  return url + helperQuery(helper)
}

/**
 * Picks the profile an overlay address asks for (by name, ignoring case).
 * If a name is given but not found it does NOT guess another profile, so a
 * missing profile is never hidden behind the wrong overlay.
 * With no name it uses the saved active profile, then the first one.
 */
export function chooseOverlayProfile(
  profiles: readonly Profile[],
  wantedName: string | null,
  activeId: string | null,
): { profile: Profile | null; missing: boolean } {
  if (wantedName) {
    const w = wantedName.trim().toLowerCase()
    const hit = profiles.find((p) => p.name.trim().toLowerCase() === w)
    return hit ? { profile: hit, missing: false } : { profile: null, missing: true }
  }
  const fallback = profiles.find((p) => p.id === activeId) ?? profiles[0] ?? null
  return { profile: fallback, missing: false }
}

export interface EmbeddedOverlay {
  token: string
  background: string | null
  helper?: HelperConfig
}

/** Checks the data an overlay file carries (window.__OVERLAY__). Anything odd is ignored. */
export function parseEmbedded(value: unknown): EmbeddedOverlay | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as { token?: unknown; background?: unknown; helper?: unknown }
  if (typeof v.token !== 'string' || !/^[gj]\.[A-Za-z0-9_-]+$/.test(v.token)) return null
  const h = typeof v.helper === 'object' && v.helper !== null ? (v.helper as { code?: unknown; port?: unknown }) : null
  const helper = h ? parseHelperConfig(h.code, h.port) : null
  return {
    token: v.token,
    background: typeof v.background === 'string' ? readBackground(v.background) : null,
    ...(helper ? { helper } : {}),
  }
}

export function readEmbeddedOverlay(): EmbeddedOverlay | null {
  return parseEmbedded((window as unknown as { __OVERLAY__?: unknown }).__OVERLAY__)
}
