import type { Profile } from './types'

export interface OverlayParams {
  /** true when the address has ?overlay (show only the overlay). */
  overlay: boolean
  /** Profile name from ?profile=..., or null. */
  profile: string | null
  /** Background color from ?bg=..., or null for transparent. */
  background: string | null
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
  return {
    overlay: q.has('overlay'),
    profile: profile ? profile : null,
    background: readBackground(q.get('bg')),
  }
}

/** Builds the address to paste into OBS. */
export function buildObsUrl(base: string, profileName: string, background: string | null): string {
  let url = `${base}?overlay&profile=${encodeURIComponent(profileName)}`
  if (background && /^#[0-9a-f]{6}$/i.test(background)) url += `&bg=${background.slice(1).toLowerCase()}`
  return url
}

/**
 * Picks the profile an overlay address asks for (by name, ignoring case).
 * If it isn't found, falls back to the saved active profile, then the first one.
 */
export function chooseOverlayProfile(
  profiles: readonly Profile[],
  wantedName: string | null,
  activeId: string | null,
): { profile: Profile | null; missing: boolean } {
  if (wantedName) {
    const w = wantedName.trim().toLowerCase()
    const hit = profiles.find((p) => p.name.trim().toLowerCase() === w)
    if (hit) return { profile: hit, missing: false }
  }
  const fallback = profiles.find((p) => p.id === activeId) ?? profiles[0] ?? null
  return { profile: fallback, missing: wantedName !== null }
}
