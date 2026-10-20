import { CONTROLLERS, DEFAULT_POSITIONS } from './controllers'
import { CANVAS_H, CANVAS_W } from './layouts'
import { createGroups, createParts, defaultFill } from './parts'
import {
  BASE_PART_IDS,
  DEFAULT_BORDER_COLOR,
  DEFAULT_FILL_COLOR,
  DEFAULT_PRESSED_COLOR,
  DEFAULT_SHELL_FILL_COLOR,
  DEFAULT_STICK_TRAVEL,
  EXTRA_BUTTON_IDS,
  GROUP_IDS,
  groupOfPart,
  MAX_DEADZONE,
  MAX_SCALE,
  MAX_STICK_TRAVEL,
  MIN_SCALE,
  MIN_STICK_TRAVEL,
  SCHEMA_VERSION,
  type ArtOwner,
  type ArtSlot,
  type ArtworkRefs,
  type BasePartId,
  type Binding,
  type ControllerType,
  type ExtraButtonConfig,
  type ExtraButtonId,
  type GroupConfig,
  type GroupId,
  type OverlaySettings,
  type PartConfig,
  type Profile,
  type Transform,
} from './types'

export function newId(): string {
  return crypto.randomUUID()
}

const clamp01 = (n: number): number =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5

const clampScale = (n: number): number =>
  Number.isFinite(n) ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, n)) : 1

const clampRotation = (n: number): number =>
  Number.isFinite(n) ? Math.min(180, Math.max(-180, n)) : 0

const clampNum = (n: unknown, lo: number, hi: number, fallback: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback

function clampTransform<T extends Transform>(t: T): T {
  return {
    ...t,
    yaw: clamp01(t.yaw),
    pitch: clamp01(t.pitch),
    scale: clampScale(t.scale),
    rotation: clampRotation(t.rotation),
    width: clampScale(t.width),
    height: clampScale(t.height),
  }
}

function readTransform(stored: Partial<Transform> | undefined, d: Transform): Transform {
  return clampTransform({
    yaw: stored?.yaw ?? d.yaw,
    pitch: stored?.pitch ?? d.pitch,
    scale: stored?.scale ?? 1,
    rotation: stored?.rotation ?? 0,
    width: stored?.width ?? 1,
    height: stored?.height ?? 1,
  })
}

/** Reads image ids, including the single `artworkId` older profiles used. */
function readArtwork(stored: unknown): ArtworkRefs {
  const s = (stored ?? {}) as { artwork?: Partial<ArtworkRefs>; artworkId?: string | null }
  return {
    normal: s.artwork?.normal ?? s.artworkId ?? null,
    pressed: s.artwork?.pressed ?? null,
  }
}

/** True for "#rrggbb" (what <input type="color"> produces). */
export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
}

const color = (v: unknown, fallback: string): string => (isHexColor(v) ? v : fallback)

/** Builds eight brand-new, unshared button configs for a controller type. */
export function createButtons(
  type: ControllerType,
): Record<ExtraButtonId, ExtraButtonConfig> {
  const visible = new Set<ExtraButtonId>(CONTROLLERS[type].defaultVisible)
  const result = {} as Record<ExtraButtonId, ExtraButtonConfig>
  for (const id of EXTRA_BUTTON_IDS) {
    result[id] = {
      visible: visible.has(id),
      binding: null,
      yaw: DEFAULT_POSITIONS[id].yaw,
      pitch: DEFAULT_POSITIONS[id].pitch,
      scale: 1,
      rotation: 0,
      width: 1,
      height: 1,
      artwork: { normal: null, pressed: null },
      borderColor: DEFAULT_BORDER_COLOR,
      pressedColor: DEFAULT_PRESSED_COLOR,
      fillColor: DEFAULT_FILL_COLOR,
    }
  }
  return result
}

export function defaultSettings(): OverlaySettings {
  return {
    scale: 1,
    deadzone: 0.25,
    opacity: 1,
    colorsApplyToAll: true,
    borderColor: DEFAULT_BORDER_COLOR,
    pressedColor: DEFAULT_PRESSED_COLOR,
    fillColor: DEFAULT_FILL_COLOR,
    shellFillColor: DEFAULT_SHELL_FILL_COLOR,
    stickTravel: DEFAULT_STICK_TRAVEL,
  }
}

export function createProfile(name: string, type: ControllerType): Profile {
  const now = Date.now()
  const family = CONTROLLERS[type].family
  return {
    id: newId(),
    name: name.trim() || 'Untitled profile',
    schemaVersion: SCHEMA_VERSION,
    controllerType: type,
    parts: createParts(family),
    groups: createGroups(family),
    buttons: createButtons(type),
    settings: defaultSettings(),
    createdAt: now,
    updatedAt: now,
  }
}

// Earlier default spots for the extras. A profile that still has one of these
// (so the user never moved it) is moved to the new default when it is loaded.
type Spots = Record<ExtraButtonId, { yaw: number; pitch: number }>
const OLD_EXTRA_DEFAULTS: Spots[] = [
  {
    paddle1: { yaw: 0.4, pitch: 0.85 },
    paddle2: { yaw: 0.47, pitch: 0.85 },
    paddle3: { yaw: 0.53, pitch: 0.85 },
    paddle4: { yaw: 0.6, pitch: 0.85 },
    clawLeft: { yaw: 0.22, pitch: 0.12 },
    clawRight: { yaw: 0.78, pitch: 0.12 },
    sideLeft: { yaw: 0.1, pitch: 0.5 },
    sideRight: { yaw: 0.9, pitch: 0.5 },
  },
  {
    paddle1: { yaw: 0.32, pitch: 0.9 },
    paddle2: { yaw: 0.4, pitch: 0.9 },
    paddle3: { yaw: 0.6, pitch: 0.9 },
    paddle4: { yaw: 0.68, pitch: 0.9 },
    clawLeft: { yaw: 0.12, pitch: 0.2 },
    clawRight: { yaw: 0.88, pitch: 0.2 },
    sideLeft: { yaw: 0.09, pitch: 0.5 },
    sideRight: { yaw: 0.91, pitch: 0.5 },
  },
]
const OLD_PS_BACK_START = { back: { x: 215, y: 150 }, start: { x: 385, y: 150 } }

const near = (a: number, b: number) => Math.abs(a - b) < 0.0005
const isOldExtraDefault = (id: ExtraButtonId, yaw: number, pitch: number) =>
  OLD_EXTRA_DEFAULTS.some((set) => near(set[id].yaw, yaw) && near(set[id].pitch, pitch))

/**
 * Fills in anything missing from a profile saved by an older version.
 * Never removes user data. Older profiles get these one-time changes:
 *  - before schema 3: bumper positions reset (the bumpers changed shape)
 *  - before schema 4: extras and PlayStation View/Menu buttons still sitting
 *    on their old default spot move to the new default spot
 *  - fill colors, stick travel and the other newer settings get defaults
 */
export function normalizeProfile(p: Profile): Profile {
  const type: ControllerType = p.controllerType in CONTROLLERS ? p.controllerType : 'xbox-one'
  const family = CONTROLLERS[type].family
  const version = p.schemaVersion ?? 1
  const before3 = version < 3
  const before4 = version < 4

  const raw = p as unknown as {
    parts?: Partial<Record<string, Partial<PartConfig>>>
    groups?: Partial<Record<GroupId, Partial<GroupConfig>>>
    controlsGroup?: Partial<Transform>
  }

  const buttonDefaults = createButtons(type)
  const buttons = {} as Record<ExtraButtonId, ExtraButtonConfig>
  for (const id of EXTRA_BUTTON_IDS) {
    const stored: Partial<ExtraButtonConfig> = p.buttons?.[id] ?? {}
    const d = buttonDefaults[id]
    let pos: Partial<Transform> = stored
    if (
      before4 &&
      stored.yaw !== undefined &&
      stored.pitch !== undefined &&
      isOldExtraDefault(id, stored.yaw, stored.pitch)
    ) {
      pos = { ...stored, yaw: d.yaw, pitch: d.pitch }
    }
    buttons[id] = {
      ...readTransform(pos, d),
      visible: stored.visible ?? d.visible,
      binding: stored.binding ?? null,
      artwork: readArtwork(stored),
      borderColor: color(stored.borderColor, DEFAULT_BORDER_COLOR),
      pressedColor: color(stored.pressedColor, DEFAULT_PRESSED_COLOR),
      fillColor: color(stored.fillColor, DEFAULT_FILL_COLOR),
    }
  }

  const oldDpad = raw.parts?.dpad
  const partDefaults = createParts(family)
  const parts = {} as Record<BasePartId, PartConfig>
  for (const id of BASE_PART_IDS) {
    const d = partDefaults[id]
    let stored: Partial<PartConfig> = raw.parts?.[id] ?? {}
    if (!raw.parts?.[id] && groupOfPart(id) === 'dpad' && oldDpad) {
      stored = { borderColor: oldDpad.borderColor, pressedColor: oldDpad.pressedColor }
    }
    // Bumpers changed shape in schema 3, so old positions would leave gaps.
    if (before3 && (id === 'lb' || id === 'rb')) {
      stored = { ...stored, yaw: undefined, pitch: undefined }
    }
    // PlayStation View/Menu buttons moved up in schema 4.
    if (
      before4 &&
      family === 'playstation' &&
      (id === 'back' || id === 'start') &&
      stored.yaw !== undefined &&
      stored.pitch !== undefined
    ) {
      const o = OLD_PS_BACK_START[id]
      if (near(stored.yaw, o.x / CANVAS_W) && near(stored.pitch, o.y / CANVAS_H)) {
        stored = { ...stored, yaw: undefined, pitch: undefined }
      }
    }
    parts[id] = {
      ...readTransform(stored, d),
      artwork: readArtwork(raw.parts?.[id]),
      borderColor: color(stored.borderColor, DEFAULT_BORDER_COLOR),
      pressedColor: color(stored.pressedColor, DEFAULT_PRESSED_COLOR),
      fillColor: color(stored.fillColor, defaultFill(id)),
    }
  }

  const groupDefaults = createGroups(family)
  const groups = {} as Record<GroupId, GroupConfig>
  for (const gid of GROUP_IDS) {
    let stored: Partial<GroupConfig> | undefined = raw.groups?.[gid]
    if (!stored && gid === 'controls') stored = raw.controlsGroup
    if (!stored && gid === 'dpad' && oldDpad) {
      stored = { yaw: oldDpad.yaw, pitch: oldDpad.pitch, scale: oldDpad.scale }
    }
    groups[gid] = {
      ...readTransform(stored, groupDefaults[gid]),
      grouped: stored?.grouped !== false,
    }
  }

  const merged = { ...defaultSettings(), ...p.settings }
  const settings: OverlaySettings = {
    ...merged,
    deadzone: clampNum(merged.deadzone, 0, MAX_DEADZONE, 0.25),
    stickTravel: clampNum(merged.stickTravel, MIN_STICK_TRAVEL, MAX_STICK_TRAVEL, DEFAULT_STICK_TRAVEL),
    colorsApplyToAll: merged.colorsApplyToAll !== false,
    borderColor: color(merged.borderColor, DEFAULT_BORDER_COLOR),
    pressedColor: color(merged.pressedColor, DEFAULT_PRESSED_COLOR),
    fillColor: color(merged.fillColor, DEFAULT_FILL_COLOR),
    shellFillColor: color(merged.shellFillColor, DEFAULT_SHELL_FILL_COLOR),
  }

  return {
    ...p,
    schemaVersion: SCHEMA_VERSION,
    controllerType: type,
    buttons,
    parts,
    groups,
    settings,
  }
}

/**
 * Returns a new profile with ONLY the given extra button changed.
 * Every other button object is carried over untouched.
 */
export function withButtonPatch(
  profile: Profile,
  id: ExtraButtonId,
  patch: Partial<ExtraButtonConfig>,
): Profile {
  const prev = profile.buttons[id]
  const merged = clampTransform<ExtraButtonConfig>({ ...prev, ...patch })
  merged.binding = merged.binding ? { ...merged.binding } : null
  merged.artwork = { ...merged.artwork }
  if (!isHexColor(merged.borderColor)) merged.borderColor = prev.borderColor
  if (!isHexColor(merged.pressedColor)) merged.pressedColor = prev.pressedColor
  if (!isHexColor(merged.fillColor)) merged.fillColor = prev.fillColor
  return { ...profile, buttons: { ...profile.buttons, [id]: merged } }
}

/** Returns a new profile with ONLY the given built-in part changed. */
export function withPartPatch(
  profile: Profile,
  id: BasePartId,
  patch: Partial<PartConfig>,
): Profile {
  const prev = profile.parts[id]
  const merged = clampTransform<PartConfig>({ ...prev, ...patch })
  merged.artwork = { ...merged.artwork }
  if (!isHexColor(merged.borderColor)) merged.borderColor = prev.borderColor
  if (!isHexColor(merged.pressedColor)) merged.pressedColor = prev.pressedColor
  if (!isHexColor(merged.fillColor)) merged.fillColor = prev.fillColor
  return { ...profile, parts: { ...profile.parts, [id]: merged } }
}

/** The two image ids of a part or extra button. */
export function getArtworkRefs(profile: Profile, owner: ArtOwner): ArtworkRefs {
  return owner.kind === 'part' ? profile.parts[owner.id].artwork : profile.buttons[owner.id].artwork
}

/** Sets (or with null clears) ONE image slot of ONE part or extra button. */
export function withArtworkRef(
  profile: Profile,
  owner: ArtOwner,
  slot: ArtSlot,
  artworkId: string | null,
): Profile {
  if (owner.kind === 'part') {
    const prev = profile.parts[owner.id]
    const next: PartConfig = { ...prev, artwork: { ...prev.artwork, [slot]: artworkId } }
    return { ...profile, parts: { ...profile.parts, [owner.id]: next } }
  }
  const prev = profile.buttons[owner.id]
  const next: ExtraButtonConfig = { ...prev, artwork: { ...prev.artwork, [slot]: artworkId } }
  return { ...profile, buttons: { ...profile.buttons, [owner.id]: next } }
}

/** Changes one group (all built-in controls, the face buttons, or the D-pad). */
export function withGroupPatch(
  profile: Profile,
  id: GroupId,
  patch: Partial<GroupConfig>,
): Profile {
  const merged = clampTransform<GroupConfig>({ ...profile.groups[id], ...patch })
  merged.grouped = Boolean(merged.grouped)
  return { ...profile, groups: { ...profile.groups, [id]: merged } }
}

export function withSettingsPatch(
  profile: Profile,
  patch: Partial<OverlaySettings>,
): Profile {
  const prev = profile.settings
  const next: OverlaySettings = { ...prev, ...patch }
  if (!isHexColor(next.borderColor)) next.borderColor = prev.borderColor
  if (!isHexColor(next.pressedColor)) next.pressedColor = prev.pressedColor
  if (!isHexColor(next.fillColor)) next.fillColor = prev.fillColor
  if (!isHexColor(next.shellFillColor)) next.shellFillColor = prev.shellFillColor
  next.deadzone = clampNum(next.deadzone, 0, MAX_DEADZONE, prev.deadzone)
  next.stickTravel = clampNum(next.stickTravel, MIN_STICK_TRAVEL, MAX_STICK_TRAVEL, prev.stickTravel)
  next.colorsApplyToAll = Boolean(next.colorsApplyToAll)
  return { ...profile, settings: next }
}

/**
 * Switches the base controller. Applies the new controller's default
 * extra-button VISIBILITY. If the layout family changes (Xbox-style <->
 * PlayStation-style), built-in part and group positions reset to the new
 * layout; size, rotation, colors, images, bindings and extra-button
 * positions are kept.
 */
export function withControllerType(profile: Profile, type: ControllerType): Profile {
  const visible = new Set<ExtraButtonId>(CONTROLLERS[type].defaultVisible)
  const buttons = { ...profile.buttons }
  for (const id of EXTRA_BUTTON_IDS) {
    buttons[id] = { ...buttons[id], visible: visible.has(id) }
  }

  let parts = profile.parts
  let groups = profile.groups
  const nextFamily = CONTROLLERS[type].family
  if (CONTROLLERS[profile.controllerType].family !== nextFamily) {
    const dp = createParts(nextFamily)
    parts = { ...profile.parts }
    for (const id of BASE_PART_IDS) {
      parts[id] = { ...profile.parts[id], yaw: dp[id].yaw, pitch: dp[id].pitch }
    }
    const dg = createGroups(nextFamily)
    groups = { ...profile.groups }
    for (const id of GROUP_IDS) {
      groups[id] = { ...profile.groups[id], yaw: dg[id].yaw, pitch: dg[id].pitch }
    }
  }

  return { ...profile, controllerType: type, buttons, parts, groups }
}

const MOUSE_NAMES: Record<number, string> = {
  0: 'Left click',
  1: 'Middle click',
  2: 'Right click',
  3: 'Mouse Button 4',
  4: 'Mouse Button 5',
}

/** Raw description, e.g. "KeyR". */
export function describeBinding(binding: Binding | null): string {
  if (!binding) return 'Not assigned'
  if (binding.kind === 'key') return binding.code
  return MOUSE_NAMES[binding.button] ?? `Mouse button ${binding.button + 1}`
}

/** Friendly description for the UI, e.g. "R", "Shift Left", "Mouse Button 4". */
export function formatBinding(binding: Binding | null): string {
  if (!binding) return 'Not assigned'
  if (binding.kind === 'mouse') return describeBinding(binding)
  const code = binding.code
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]
  const digit = /^Digit(\d)$/.exec(code)
  if (digit) return digit[1]
  return code.replace(/([a-z])([A-Z0-9])/g, '$1 $2')
}