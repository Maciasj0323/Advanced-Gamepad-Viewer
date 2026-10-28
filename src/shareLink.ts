import { helperQuery, type HelperConfig } from './helperClient'
import {
  fromBase64,
  MAX_BACKUP_BYTES,
  parseBackup,
  serializeBackup,
  toBase64,
  type BackupFile,
} from './backup'

/**
 * OBS's URL box only accepts about 32,000 characters and silently cuts off anything
 * longer, so a link longer than this must not be offered for OBS.
 */
export const MAX_URL_CHARS = 30_000

const toB64Url = (bytes: Uint8Array): string =>
  toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function fromB64Url(text: string): Uint8Array {
  let t = text.replace(/-/g, '+').replace(/_/g, '/')
  while (t.length % 4 !== 0) t += '='
  return fromBase64(t)
}

const toArrayBuffer = (u: Uint8Array): ArrayBuffer =>
  u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Decompresses, refusing anything that grows past the backup size limit. */
async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_BACKUP_BYTES) {
      await reader.cancel()
      throw new Error('too large')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

/** Turns a one-profile backup into text that is safe to put in an address. */
export async function encodeShareToken(file: BackupFile): Promise<string> {
  const raw = new TextEncoder().encode(serializeBackup(file))
  if (typeof CompressionStream === 'undefined') return `j.${toB64Url(raw)}`
  return `g.${toB64Url(await gzip(raw))}`
}

export async function decodeShareToken(token: string): Promise<{ file: BackupFile } | { error: string }> {
  const kind = token.slice(0, 2)
  if (kind !== 'g.' && kind !== 'j.') return { error: 'This overlay link is not valid.' }
  try {
    let bytes = fromB64Url(token.slice(2))
    if (kind === 'g.') {
      if (typeof DecompressionStream === 'undefined') {
        return { error: 'This browser cannot open compressed overlay links.' }
      }
      bytes = await gunzip(bytes)
    }
    return parseBackup(new TextDecoder().decode(bytes))
  } catch {
    return { error: 'This overlay link is damaged or incomplete. It may have been cut off when it was pasted.' }
  }
}

/** Builds the self-contained address to paste into OBS. */
export function buildShareUrl(
  base: string,
  token: string,
  background: string | null,
  helper?: HelperConfig | null,
): string {
  const bg = background && /^#[0-9a-f]{6}$/i.test(background) ? `&bg=${background.slice(1).toLowerCase()}` : ''
  return `${base}?overlay${bg}${helperQuery(helper)}#d=${token}`
}

/** Reads the token out of an address's hash (location.hash), or null. */
export function readShareToken(hash: string): string | null {
  const m = /^#d=([A-Za-z0-9_.-]+)$/.exec(hash)
  return m ? m[1] : null
}
