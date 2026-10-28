import { fromBase64, toBase64, type BackupFile } from './backup'
import type { ArtworkRecord } from './types'

const MAX_SIDE = 1024
const KEEP_BYTES = 120_000

/**
 * Makes big images smaller so an overlay link stays a reasonable length.
 * Images already small enough are left exactly as they are. Never makes an image bigger.
 */
export async function shrinkRecord(rec: ArtworkRecord): Promise<ArtworkRecord> {
  try {
    const bitmap = await createImageBitmap(new Blob([rec.data], { type: rec.mime }))
    const longest = Math.max(bitmap.width, bitmap.height)
    if (rec.data.byteLength <= KEEP_BYTES && longest <= MAX_SIDE) {
      bitmap.close()
      return rec
    }
    const k = Math.min(1, MAX_SIDE / longest)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * k))
    canvas.height = Math.max(1, Math.round(bitmap.height * k))
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return rec
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85))
    if (!out || out.type !== 'image/webp' || out.size >= rec.data.byteLength) return rec
    return { ...rec, mime: 'image/webp', data: await out.arrayBuffer() }
  } catch {
    return rec
  }
}

async function shrinkBackupImage(item: unknown): Promise<unknown> {
  if (typeof item !== 'object' || item === null) return item
  const i = item as { id?: unknown; name?: unknown; mime?: unknown; data?: unknown }
  if (typeof i.id !== 'string' || typeof i.mime !== 'string' || typeof i.data !== 'string') return item
  const bytes = fromBase64(i.data)
  const rec: ArtworkRecord = {
    id: i.id,
    profileId: '',
    kind: 'shell',
    name: typeof i.name === 'string' ? i.name : 'image',
    mime: i.mime,
    data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    createdAt: 0,
  }
  const out = await shrinkRecord(rec)
  if (out === rec) return item
  return { id: i.id, name: i.name, mime: out.mime, data: toBase64(new Uint8Array(out.data)) }
}

/** Shrinks every image inside a backup file object. */
export async function shrinkBackup(file: BackupFile): Promise<BackupFile> {
  const profiles = await Promise.all(
    file.profiles.map(async (entry) => ({
      profile: entry.profile,
      images: await Promise.all(entry.images.map(shrinkBackupImage)),
    })),
  )
  return { ...file, profiles }
}
