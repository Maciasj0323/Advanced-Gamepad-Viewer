import {
  BASE_PART_IDS,
  EXTRA_BUTTON_IDS,
  type ArtworkRefs,
  type Profile,
} from './types'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 8192

/** What to draw for a part. */
export type ArtView =
  | { kind: 'shape' } // no images: draw the built-in shape
  | { kind: 'none' } // images exist, but none applies right now: draw nothing
  | { kind: 'image'; id: string; tint: boolean } // draw this image (tinted = no pressed image)

export function hasArt(refs: ArtworkRefs): boolean {
  return Boolean(refs.normal || refs.pressed)
}

/**
 * Chooses what to draw. When any image exists, the built-in shape is never drawn.
 * Only a not-pressed image: pressed shows it tinted. Only a pressed image:
 * nothing is shown until pressed.
 */
export function resolveArt(refs: ArtworkRefs, pressed: boolean): ArtView {
  const { normal, pressed: down } = refs
  if (!normal && !down) return { kind: 'shape' }
  if (pressed) {
    if (down) return { kind: 'image', id: down, tint: false }
    return { kind: 'image', id: normal as string, tint: true }
  }
  return normal ? { kind: 'image', id: normal, tint: false } : { kind: 'none' }
}

/** Every image id a profile refers to. */
export function artworkIds(profile: Profile | null): string[] {
  if (!profile) return []
  const ids: string[] = []
  const add = (refs: ArtworkRefs | undefined) => {
    if (refs?.normal) ids.push(refs.normal)
    if (refs?.pressed) ids.push(refs.pressed)
  }
  for (const id of BASE_PART_IDS) add(profile.parts[id]?.artwork)
  for (const id of EXTRA_BUTTON_IDS) add(profile.buttons[id]?.artwork)
  return ids
}

/** Identifies PNG, JPEG, GIF and WebP from the file's first bytes (not its name). */
export function sniffImageType(b: Uint8Array): string | null {
  const is = (offset: number, sig: number[]) => sig.every((v, i) => b[offset + i] === v)
  if (is(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (is(0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (is(0, [0x47, 0x49, 0x46, 0x38]) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) {
    return 'image/gif'
  }
  if (is(0, [0x52, 0x49, 0x46, 0x46]) && is(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp'
  return null
}

export type PreparedImage = { error: string } | { mime: string; data: ArrayBuffer }

/** Checks an uploaded file and returns its bytes, or a plain-language error. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (file.size === 0) return { error: 'That file is empty.' }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: `That file is too large (limit ${MAX_IMAGE_BYTES / 1024 / 1024} MB).` }
  }

  let data: ArrayBuffer
  try {
    data = await file.arrayBuffer()
  } catch {
    return { error: 'The file could not be read.' }
  }

  const mime = sniffImageType(new Uint8Array(data))
  if (!mime) return { error: 'That is not a PNG, JPEG, WebP or GIF image.' }

  const url = URL.createObjectURL(new Blob([data], { type: mime }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    if (img.naturalWidth > MAX_IMAGE_PIXELS || img.naturalHeight > MAX_IMAGE_PIXELS) {
      return { error: `That image is too big (limit ${MAX_IMAGE_PIXELS} pixels on a side).` }
    }
  } catch {
    return { error: 'That image is damaged or could not be opened.' }
  } finally {
    URL.revokeObjectURL(url)
  }

  return { mime, data }
}