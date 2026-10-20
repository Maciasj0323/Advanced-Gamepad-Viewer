import { create } from 'zustand'
import { prepareImage } from './artwork'
import { useArtwork } from './artworkStore'
import {
  buildExport,
  parseBackup,
  prepareImport,
  serializeBackup,
  type ImportResult,
} from './backup'
import {
  createProfile,
  getArtworkRefs,
  newId,
  normalizeProfile,
  withArtworkRef,
  withButtonPatch,
  withControllerType,
  withGroupPatch,
  withPartPatch,
  withSettingsPatch,
} from './profile'
import * as db from './storage'
import type {
  ArtOwner,
  ArtSlot,
  ArtworkRecord,
  BasePartId,
  ControllerType,
  ExtraButtonConfig,
  ExtraButtonId,
  GroupConfig,
  GroupId,
  OverlaySettings,
  PartConfig,
  Profile,
} from './types'

interface ProfileState {
  ready: boolean
  profiles: Profile[]
  activeId: string | null
  error: string | null

  init: () => Promise<void>
  dismissError: () => void
  createProfile: (name: string, type: ControllerType) => void
  selectProfile: (id: string) => void
  renameProfile: (id: string, name: string) => void
  duplicateProfile: (id: string) => void
  deleteProfile: (id: string) => void
  setControllerType: (type: ControllerType) => void
  updateButton: (id: ExtraButtonId, patch: Partial<ExtraButtonConfig>) => void
  updatePart: (id: BasePartId, patch: Partial<PartConfig>) => void
  updateGroup: (id: GroupId, patch: Partial<GroupConfig>) => void
  updateSettings: (patch: Partial<OverlaySettings>) => void
  /** Returns an error message to show, or null when the image was added. */
  setArtwork: (owner: ArtOwner, slot: ArtSlot, file: File) => Promise<string | null>
  clearArtwork: (owner: ArtOwner, slot: ArtSlot) => void
  /** Builds the text of a backup file for the given profiles. */
  exportProfiles: (ids: string[]) => Promise<string>
  /** Adds the profiles in a backup file as new profiles. */
  importBackup: (text: string) => Promise<ImportResult>
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// All writes run one after another so saves can never land out of order.
let chain: Promise<unknown> = Promise.resolve()
function enqueue(task: () => Promise<unknown>) {
  chain = chain.then(task).catch((e) => {
    useProfiles.setState({
      error: `${message(e)} Your latest change may not be saved.`,
    })
  })
}

export const useProfiles = create<ProfileState>((set, get) => {
  /** Applies a change to the active profile in memory, then saves it. */
  const mutateActive = (fn: (p: Profile) => Profile) => {
    const { profiles, activeId } = get()
    const current = profiles.find((p) => p.id === activeId)
    if (!current) return
    const next: Profile = { ...fn(current), updatedAt: Date.now() }
    set({ profiles: profiles.map((p) => (p.id === next.id ? next : p)) })
    enqueue(() => db.saveProfile(next))
  }

  return {
    ready: false,
    profiles: [],
    activeId: null,
    error: null,

    init: async () => {
      try {
        let profiles = (await db.listProfiles()).map(normalizeProfile)
        if (profiles.length === 0) {
          const first = createProfile('Default', 'xbox-one')
          await db.saveProfile(first)
          profiles = [first]
        }
        const savedId = await db.getActiveProfileId()
        const activeId = profiles.some((p) => p.id === savedId) ? savedId! : profiles[0].id
        set({ profiles, activeId, ready: true })
      } catch (e) {
        // Storage unavailable: keep the app usable, but tell the user plainly.
        const fallback = createProfile('Default', 'xbox-one')
        set({
          profiles: [fallback],
          activeId: fallback.id,
          ready: true,
          error: `${message(e)} Changes will NOT be saved in this session.`,
        })
      }
    },

    dismissError: () => set({ error: null }),

    createProfile: (name, type) => {
      const profile = createProfile(name, type)
      set({ profiles: [...get().profiles, profile], activeId: profile.id })
      enqueue(async () => {
        await db.saveProfile(profile)
        await db.setActiveProfileId(profile.id)
      })
    },

    selectProfile: (id) => {
      if (!get().profiles.some((p) => p.id === id)) return
      set({ activeId: id })
      enqueue(() => db.setActiveProfileId(id))
    },

    renameProfile: (id, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const { profiles } = get()
      const target = profiles.find((p) => p.id === id)
      if (!target) return
      const next = { ...target, name: trimmed, updatedAt: Date.now() }
      set({ profiles: profiles.map((p) => (p.id === id ? next : p)) })
      enqueue(() => db.saveProfile(next))
    },

    duplicateProfile: (id) => {
      enqueue(async () => {
        const copy = normalizeProfile(await db.duplicateProfile(id))
        set({ profiles: [...get().profiles, copy], activeId: copy.id })
        await db.setActiveProfileId(copy.id)
      })
    },

    deleteProfile: (id) => {
      const remaining = get().profiles.filter((p) => p.id !== id)
      if (remaining.length === get().profiles.length) return
      if (remaining.length === 0) {
        const fresh = createProfile('Default', 'xbox-one')
        set({ profiles: [fresh], activeId: fresh.id })
        enqueue(async () => {
          await db.deleteProfile(id)
          await db.saveProfile(fresh)
          await db.setActiveProfileId(fresh.id)
        })
        return
      }
      const activeId = get().activeId === id ? remaining[0].id : get().activeId
      set({ profiles: remaining, activeId })
      enqueue(async () => {
        await db.deleteProfile(id)
        if (activeId) await db.setActiveProfileId(activeId)
      })
    },

    setControllerType: (type) => mutateActive((p) => withControllerType(p, type)),
    updateButton: (id, patch) => mutateActive((p) => withButtonPatch(p, id, patch)),
    updatePart: (id, patch) => mutateActive((p) => withPartPatch(p, id, patch)),
    updateGroup: (id, patch) => mutateActive((p) => withGroupPatch(p, id, patch)),
    updateSettings: (patch) => mutateActive((p) => withSettingsPatch(p, patch)),

    setArtwork: async (owner, slot, file) => {
      const startId = get().activeId
      if (!startId) return 'There is no active profile.'

      const prepared = await prepareImage(file)
      if ('error' in prepared) return prepared.error

      const { profiles, activeId } = get()
      if (activeId !== startId) {
        return 'The profile changed while the image was loading. Please try again.'
      }
      const current = profiles.find((p) => p.id === activeId)
      if (!current) return 'There is no active profile.'

      const record: ArtworkRecord = {
        id: newId(),
        profileId: current.id,
        kind: owner.id,
        slot,
        name: file.name,
        mime: prepared.mime,
        data: prepared.data,
        createdAt: Date.now(),
      }
      const oldId = getArtworkRefs(current, owner)[slot]
      const next: Profile = { ...withArtworkRef(current, owner, slot, record.id), updatedAt: Date.now() }

      useArtwork.getState().add(record)
      set({ profiles: profiles.map((p) => (p.id === next.id ? next : p)) })
      if (oldId) useArtwork.getState().remove(oldId)

      // The image is saved before the profile that points at it.
      enqueue(async () => {
        await db.putArtwork(record)
        await db.saveProfile(next)
        if (oldId) await db.deleteArtwork(oldId)
      })
      return null
    },

    clearArtwork: (owner, slot) => {
      const { profiles, activeId } = get()
      const current = profiles.find((p) => p.id === activeId)
      if (!current) return
      const oldId = getArtworkRefs(current, owner)[slot]
      if (!oldId) return
      const next: Profile = { ...withArtworkRef(current, owner, slot, null), updatedAt: Date.now() }
      set({ profiles: profiles.map((p) => (p.id === next.id ? next : p)) })
      useArtwork.getState().remove(oldId)
      enqueue(async () => {
        await db.saveProfile(next)
        await db.deleteArtwork(oldId)
      })
    },

    exportProfiles: async (ids) => {
      // Wait for pending saves so the export includes the very latest changes.
      await chain.catch(() => undefined)
      const chosen = get().profiles.filter((p) => ids.includes(p.id))
      if (chosen.length === 0) throw new Error('There is nothing to export.')
      const records: ArtworkRecord[] = []
      for (const profile of chosen) {
        for (const profileArtId of artworkIdsOf(profile)) {
          const record = await db.getArtwork(profileArtId)
          if (record) records.push(record)
        }
      }
      return serializeBackup(buildExport(chosen, records))
    },

    importBackup: (text) =>
      new Promise<ImportResult>((resolve) => {
        enqueue(async () => {
          try {
            const parsed = parseBackup(text)
            if ('error' in parsed) {
              resolve({ ok: false, error: parsed.error })
              return
            }
            const prepared = prepareImport(parsed.file, get().profiles.map((p) => p.name))
            await db.importProfiles(prepared.profiles, prepared.artwork)
            const first = prepared.profiles[0]
            set({ profiles: [...get().profiles, ...prepared.profiles], activeId: first.id })
            await db.setActiveProfileId(first.id)
            resolve({
              ok: true,
              names: prepared.profiles.map((p) => p.name),
              skippedImages: prepared.skippedImages,
            })
          } catch (e) {
            resolve({ ok: false, error: `Could not import: ${message(e)}` })
          }
        })
      }),
  }
})

function artworkIdsOf(profile: Profile): string[] {
  const ids = new Set<string>()
  for (const part of Object.values(profile.parts)) {
    if (part.artwork.normal) ids.add(part.artwork.normal)
    if (part.artwork.pressed) ids.add(part.artwork.pressed)
  }
  for (const button of Object.values(profile.buttons)) {
    if (button.artwork.normal) ids.add(button.artwork.normal)
    if (button.artwork.pressed) ids.add(button.artwork.pressed)
  }
  return [...ids]
}