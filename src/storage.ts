import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { newId } from './profile'
import { BASE_PART_IDS, EXTRA_BUTTON_IDS, type ArtworkRecord, type Profile } from './types'

export class StorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageError'
  }
}

interface GamepadDB extends DBSchema {
  profiles: { key: string; value: Profile }
  artwork: {
    key: string
    value: ArtworkRecord
    indexes: { byProfile: string }
  }
  meta: { key: string; value: string }
}

const DB_NAME = 'gamepad-overlay'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<GamepadDB>> | null = null

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function getDb(): Promise<IDBPDatabase<GamepadDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GamepadDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('profiles', { keyPath: 'id' })
        const artwork = db.createObjectStore('artwork', { keyPath: 'id' })
        artwork.createIndex('byProfile', 'profileId')
        db.createObjectStore('meta')
      },
    }).catch((e) => {
      dbPromise = null
      throw new StorageError(`Could not open browser storage: ${describe(e)}`)
    })
  }
  return dbPromise
}

async function guard<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof StorageError) throw e
    throw new StorageError(`${what} failed: ${describe(e)}`)
  }
}

/** Closes the connection (like a page refresh). Data stays on disk. */
export async function closeDatabase(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
}

/** Test helper: closes and deletes the whole database. */
export async function resetDatabaseForTests(): Promise<void> {
  await closeDatabase()
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
}

// ---------- Profiles ----------
export function listProfiles(): Promise<Profile[]> {
  return guard('Loading profiles', async () => {
    const all = await (await getDb()).getAll('profiles')
    return all.sort((a, b) => a.createdAt - b.createdAt)
  })
}

export function loadProfile(id: string): Promise<Profile | undefined> {
  return guard('Loading profile', async () => (await getDb()).get('profiles', id))
}

export function saveProfile(profile: Profile): Promise<void> {
  return guard('Saving profile', async () => {
    await (await getDb()).put('profiles', profile)
  })
}

/** Deletes a profile and all artwork that belongs to it. Other profiles are untouched. */
export function deleteProfile(id: string): Promise<void> {
  return guard('Deleting profile', async () => {
    const db = await getDb()
    const tx = db.transaction(['profiles', 'artwork'], 'readwrite')
    await tx.objectStore('profiles').delete(id)
    const keys = await tx.objectStore('artwork').index('byProfile').getAllKeys(id)
    for (const key of keys) await tx.objectStore('artwork').delete(key)
    await tx.done
  })
}

/**
 * Points a part's or button's image ids at the copied images. Handles both
 * the current shape ({ artwork: { normal, pressed } }) and the single
 * `artworkId` older profiles used.
 */
function remapImages(holder: unknown, idMap: Map<string, string>): void {
  const h = holder as
    | { artwork?: { normal?: string | null; pressed?: string | null }; artworkId?: string | null }
    | undefined
  if (!h) return
  const map = (id: string | null | undefined) => (id ? (idMap.get(id) ?? null) : null)
  if (h.artwork) {
    h.artwork.normal = map(h.artwork.normal)
    h.artwork.pressed = map(h.artwork.pressed)
  }
  if ('artworkId' in h) h.artworkId = map(h.artworkId)
}

/**
 * Creates a fully independent copy: new profile id, new image ids,
 * and copied image bytes, all written in one transaction.
 */
export function duplicateProfile(id: string): Promise<Profile> {
  return guard('Duplicating profile', async () => {
    const db = await getDb()
    const tx = db.transaction(['profiles', 'artwork'], 'readwrite')
    const original = await tx.objectStore('profiles').get(id)
    if (!original) throw new Error('Profile not found')

    const copy: Profile = structuredClone(original)
    copy.id = newId()
    copy.name = `${original.name} (copy)`
    copy.createdAt = Date.now()
    copy.updatedAt = copy.createdAt

    const records = await tx.objectStore('artwork').index('byProfile').getAll(id)
    const idMap = new Map<string, string>()
    for (const rec of records) {
      const newRecord: ArtworkRecord = {
        ...rec,
        id: newId(),
        profileId: copy.id,
        data: rec.data.slice(0),
      }
      idMap.set(rec.id, newRecord.id)
      await tx.objectStore('artwork').put(newRecord)
    }

    for (const pid of BASE_PART_IDS) remapImages(copy.parts?.[pid], idMap)
    for (const bid of EXTRA_BUTTON_IDS) remapImages(copy.buttons?.[bid], idMap)

    await tx.objectStore('profiles').put(copy)
    await tx.done
    return copy
  })
}

// ---------- Artwork ----------
export function putArtwork(record: ArtworkRecord): Promise<void> {
  return guard('Saving image', async () => {
    await (await getDb()).put('artwork', record)
  })
}

export function getArtwork(id: string): Promise<ArtworkRecord | undefined> {
  return guard('Loading image', async () => (await getDb()).get('artwork', id))
}

export function deleteArtwork(id: string): Promise<void> {
  return guard('Deleting image', async () => {
    await (await getDb()).delete('artwork', id)
  })
}

// ---------- Active profile ----------
export function getActiveProfileId(): Promise<string | undefined> {
  return guard('Loading active profile', async () =>
    (await getDb()).get('meta', 'activeProfileId'),
  )
}

export function setActiveProfileId(id: string): Promise<void> {
  return guard('Saving active profile', async () => {
    await (await getDb()).put('meta', id, 'activeProfileId')
  })
}