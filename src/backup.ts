import { artworkIds, MAX_IMAGE_BYTES, sniffImageType } from './artwork'
import { CONTROLLERS } from './controllers'
import { newId, normalizeProfile } from './profile'
import {
  BASE_PART_IDS,
  EXTRA_BUTTON_IDS,
  type ArtSlot,
  type ArtworkRecord,
  type Binding,
  type BasePartId,
  type ExtraButtonConfig,
  type ExtraButtonId,
  type PartConfig,
  type Profile,
} from './types'

export const BACKUP_FORMAT = 'gamepad-overlay-profile' as const
export const BACKUP_VERSION = 1
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024
export const MAX_PROFILES_PER_FILE = 50
const MAX_IMAGES_PER_PROFILE = 80

export interface BackupImage {
  id: string
  name: string
  mime: string
  /** The image file's bytes, base64 encoded. */
  data: string
}

export interface BackupEntry {
  profile: unknown
  images: unknown[]
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  profiles: BackupEntry[]
}

export interface PreparedImport {
  profiles: Profile[]
  artwork: ArtworkRecord[]
  /** Images in the file that were damaged, too large or not real images. */
  skippedImages: number
}

export type ImportResult =
  | { ok: true; names: string[]; skippedImages: number }
  | { ok: false; error: string }

// ---------- base64 ----------
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

// ---------- export ----------
/** Packs profiles and the images they use into one file object. */
export function buildExport(
  profiles: readonly Profile[],
  records: readonly ArtworkRecord[],
  now: Date = new Date(),
): BackupFile {
  const byId = new Map(records.map((r) => [r.id, r]))
  const entries: BackupEntry[] = profiles.map((profile) => {
    const images: BackupImage[] = []
    const seen = new Set<string>()
    for (const id of artworkIds(profile)) {
      if (seen.has(id)) continue
      seen.add(id)
      const rec = byId.get(id)
      if (rec) {
        images.push({
          id,
          name: rec.name,
          mime: rec.mime,
          data: toBase64(new Uint8Array(rec.data)),
        })
      }
    }
    return { profile, images }
  })
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), profiles: entries }
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file)
}

// ---------- reading a file ----------
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Checks that text is a backup file this version can read. */
export function parseBackup(text: string): { file: BackupFile } | { error: string } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { error: 'That file is not valid JSON, so it is not a profile backup.' }
  }
  if (!isPlainObject(data) || data.format !== BACKUP_FORMAT) {
    return { error: "This isn't a Gamepad Overlay profile backup file." }
  }
  const version = data.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { error: 'This backup file has an invalid version number.' }
  }
  if (version > BACKUP_VERSION) {
    return { error: 'This backup was made by a newer version of the app. Update the app and try again.' }
  }
  if (!Array.isArray(data.profiles) || data.profiles.length === 0) {
    return { error: 'This backup file contains no profiles.' }
  }
  if (data.profiles.length > MAX_PROFILES_PER_FILE) {
    return { error: `This backup file has too many profiles (limit ${MAX_PROFILES_PER_FILE}).` }
  }

  const entries: BackupEntry[] = []
  for (const e of data.profiles) {
    if (!isPlainObject(e) || !isPlainObject(e.profile)) {
      return { error: 'This backup file is damaged: a profile entry could not be read.' }
    }
    entries.push({
      profile: e.profile,
      images: Array.isArray(e.images) ? e.images.slice(0, MAX_IMAGES_PER_PROFILE) : [],
    })
  }
  return {
    file: {
      format: BACKUP_FORMAT,
      version,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
      profiles: entries,
    },
  }
}

interface ReadImage {
  id: string
  name: string
  mime: string
  data: ArrayBuffer
}

/** Decodes and checks one image from a file. Returns null if it can't be trusted. */
function readImage(item: unknown): ReadImage | null {
  if (!isPlainObject(item) || typeof item.id !== 'string' || typeof item.data !== 'string') return null
  if (Math.floor((item.data.length * 3) / 4) > MAX_IMAGE_BYTES) return null
  let bytes: Uint8Array
  try {
    bytes = fromBase64(item.data)
  } catch {
    return null
  }
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null
  const mime = sniffImageType(bytes) // trust the bytes, not the label
  if (!mime) return null
  const name = typeof item.name === 'string' ? item.name.slice(0, 120) : 'image'
  return { id: item.id, name, mime, data: bytes.buffer as ArrayBuffer }
}

function cleanBinding(b: unknown): Binding | null {
  if (!isPlainObject(b)) return null
  if (b.kind === 'key' && typeof b.code === 'string' && /^[A-Za-z0-9_]{1,30}$/.test(b.code)) {
    return { kind: 'key', code: b.code }
  }
  if (b.kind === 'mouse' && typeof b.button === 'number' && Number.isInteger(b.button) && b.button >= 0 && b.button <= 31) {
    return { kind: 'mouse', button: b.button }
  }
  return null
}

function cleanName(v: unknown): string {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 80) : ''
  return s || 'Imported profile'
}

const finiteOr = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

/**
 * Turns a checked file into brand-new profiles and image records.
 * Every profile and image gets a new id, so nothing existing is touched,
 * and every image slot gets its own record (so removing one never breaks another).
 */
export function prepareImport(
  file: BackupFile,
  existingNames: readonly string[],
  now: number = Date.now(),
): PreparedImport {
  const taken = new Set(existingNames.map((n) => n.toLowerCase()))
  const profiles: Profile[] = []
  const artwork: ArtworkRecord[] = []
  let skippedImages = 0

  file.profiles.forEach((entry, index) => {
    const images = new Map<string, ReadImage>()
    for (const item of entry.images) {
      const img = readImage(item)
      if (img) images.set(img.id, img)
      else skippedImages++
    }

    const src = entry.profile as Record<string, unknown>
    const type =
      typeof src.controllerType === 'string' &&
      Object.prototype.hasOwnProperty.call(CONTROLLERS, src.controllerType)
        ? src.controllerType
        : 'xbox-one'
    const raw = {
      ...src,
      controllerType: type,
      schemaVersion: typeof src.schemaVersion === 'number' ? src.schemaVersion : 1,
      settings: isPlainObject(src.settings) ? src.settings : {},
      parts: isPlainObject(src.parts) ? src.parts : undefined,
      groups: isPlainObject(src.groups) ? src.groups : undefined,
      buttons: isPlainObject(src.buttons) ? src.buttons : undefined,
    }
    const n = normalizeProfile(raw as unknown as Profile)

    const id = newId()
    const base = cleanName(src.name)
    let name = base
    let attempt = 1
    while (taken.has(name.toLowerCase())) {
      attempt++
      name = attempt === 2 ? `${base} (imported)` : `${base} (imported ${attempt - 1})`
    }
    taken.add(name.toLowerCase())

    const take = (ref: unknown, owner: BasePartId | ExtraButtonId, slot: ArtSlot): string | null => {
      if (typeof ref !== 'string') return null
      const img = images.get(ref)
      if (!img) return null
      const record: ArtworkRecord = {
        id: newId(),
        profileId: id,
        kind: owner,
        slot,
        name: img.name,
        mime: img.mime,
        data: img.data.slice(0),
        createdAt: now,
      }
      artwork.push(record)
      return record.id
    }

    const parts = {} as Profile['parts']
    for (const pid of BASE_PART_IDS) {
      const part: PartConfig = n.parts[pid]
      parts[pid] = {
        ...part,
        artwork: {
          normal: take(part.artwork.normal, pid, 'normal'),
          pressed: take(part.artwork.pressed, pid, 'pressed'),
        },
      }
    }

    const buttons = {} as Profile['buttons']
    for (const bid of EXTRA_BUTTON_IDS) {
      const b: ExtraButtonConfig = n.buttons[bid]
      buttons[bid] = {
        ...b,
        visible: b.visible === true,
        binding: cleanBinding(b.binding),
        artwork: {
          normal: take(b.artwork.normal, bid, 'normal'),
          pressed: take(b.artwork.pressed, bid, 'pressed'),
        },
      }
    }

    const s = n.settings
    profiles.push({
      id,
      name,
      schemaVersion: n.schemaVersion,
      controllerType: n.controllerType,
      parts,
      groups: n.groups,
      buttons,
      settings: {
        scale: finiteOr(s.scale, 1),
        deadzone: s.deadzone,
        opacity: finiteOr(s.opacity, 1),
        colorsApplyToAll: s.colorsApplyToAll,
        borderColor: s.borderColor,
        pressedColor: s.pressedColor,
        fillColor: s.fillColor,
        shellFillColor: s.shellFillColor,
        stickTravel: s.stickTravel,
      },
      createdAt: now + index,
      updatedAt: now,
    })
  })

  return { profiles, artwork, skippedImages }
}