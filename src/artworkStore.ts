import { useEffect } from 'react'
import { create } from 'zustand'
import { artworkIds } from './artwork'
import { getArtwork } from './storage'
import type { ArtworkRecord, Profile } from './types'

interface ArtworkState {
  /** image id -> temporary browser URL. Rebuilt from storage each session. */
  urls: Record<string, string>
  error: string | null
  add: (record: ArtworkRecord) => void
  remove: (id: string) => void
  ensure: (ids: string[]) => Promise<void>
  dismissError: () => void
}

const loading = new Set<string>()

function toUrl(record: ArtworkRecord): string {
  return URL.createObjectURL(new Blob([record.data], { type: record.mime }))
}

export const useArtwork = create<ArtworkState>((set, get) => ({
  urls: {},
  error: null,

  add: (record) => {
    const old = get().urls[record.id]
    if (old) URL.revokeObjectURL(old)
    set((s) => ({ urls: { ...s.urls, [record.id]: toUrl(record) } }))
  },

  remove: (id) => {
    const url = get().urls[id]
    if (!url) return
    URL.revokeObjectURL(url)
    set((s) => {
      const urls = { ...s.urls }
      delete urls[id]
      return { urls }
    })
  },

  ensure: async (ids) => {
    const missing = ids.filter((id) => !get().urls[id] && !loading.has(id))
    if (missing.length === 0) return
    missing.forEach((id) => loading.add(id))
    await Promise.all(
      missing.map(async (id) => {
        try {
          const record = await getArtwork(id)
          if (record && !get().urls[id]) get().add(record)
        } catch (e) {
          set({ error: `Could not load an image: ${e instanceof Error ? e.message : String(e)}` })
        } finally {
          loading.delete(id)
        }
      }),
    )
  },

  dismissError: () => set({ error: null }),
}))

/** Loads the active profile's images and returns image id -> URL. */
export function useArtworkUrls(profile: Profile | null): Record<string, string> {
  const urls = useArtwork((s) => s.urls)
  const ensure = useArtwork((s) => s.ensure)
  const key = artworkIds(profile).join('|')
  useEffect(() => {
    if (key) void ensure(key.split('|'))
  }, [key, ensure])
  return urls
}