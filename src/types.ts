// ---------- Additional buttons ----------
export const EXTRA_BUTTON_IDS = [
  'paddle1',
  'paddle2',
  'paddle3',
  'paddle4',
  'clawLeft',
  'clawRight',
  'sideLeft',
  'sideRight',
] as const

export type ExtraButtonId = (typeof EXTRA_BUTTON_IDS)[number]

export const EXTRA_BUTTON_LABELS: Record<ExtraButtonId, string> = {
  paddle1: 'Paddle 1',
  paddle2: 'Paddle 2',
  paddle3: 'Paddle 3',
  paddle4: 'Paddle 4',
  clawLeft: 'Left claw-grip bumper',
  clawRight: 'Right claw-grip bumper',
  sideLeft: 'Left side action button',
  sideRight: 'Right side action button',
}

// A binding is either a keyboard key (KeyboardEvent.code, e.g. "KeyR", "Space")
// or a mouse button (MouseEvent.button: 0 left, 1 middle, 2 right, 3 back, 4 forward).
export type Binding =
  | { kind: 'key'; code: string }
  | { kind: 'mouse'; button: number }

/** Placement shared by every part, group and additional button. */
export interface Transform {
  /** Horizontal position of the part's center, 0..1 of the overlay width. */
  yaw: number
  /** Vertical position of the part's center, 0..1 of the overlay height. */
  pitch: number
  /** Size multiplier. 1 = default size. */
  scale: number
  /** Rotation in degrees, -180..180. */
  rotation: number
  /** Width multiplier on top of scale. 1 = unchanged. */
  width: number
  /** Height multiplier on top of scale. 1 = unchanged. */
  height: number
}

/** Ids of the two uploaded images a part can have. null = none. */
export interface ArtworkRefs {
  normal: string | null
  pressed: string | null
}
export type ArtSlot = keyof ArtworkRefs

export interface ExtraButtonConfig extends Transform {
  visible: boolean
  binding: Binding | null
  /** Uploaded images. When any is set, the built-in shape is not drawn. */
  artwork: ArtworkRefs
    /** Used when colors are not applied to the whole overlay. */
  borderColor: string
  pressedColor: string
  fillColor: string
}

// ---------- Built-in controller parts ----------
export const BASE_PART_IDS = [
  'shell',
  'lt',
  'rt',
  'lb',
  'rb',
  'dpadUp',
  'dpadDown',
  'dpadLeft',
  'dpadRight',
  'leftStick',
  'rightStick',
  'south',
  'east',
  'west',
  'north',
  'back',
  'start',
  'home',
  'touchpad',
] as const

export type BasePartId = (typeof BASE_PART_IDS)[number]

export interface PartConfig extends Transform {
  artwork: ArtworkRefs
  borderColor: string
  pressedColor: string
  fillColor: string
}

/** Which part or extra button an image belongs to. */
export type ArtOwner =
  | { kind: 'part'; id: BasePartId }
  | { kind: 'extra'; id: ExtraButtonId }

// ---------- Groups ----------
/** 'controls' holds every built-in part except the shell. 'face' and 'dpad' sit inside it. */
export const GROUP_IDS = ['controls', 'face', 'dpad'] as const
export type GroupId = (typeof GROUP_IDS)[number]
export type SubGroupId = Exclude<GroupId, 'controls'>

export const GROUP_MEMBERS: Record<SubGroupId, readonly BasePartId[]> = {
  face: ['south', 'east', 'west', 'north'],
  dpad: ['dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight'],
}

export function groupOfPart(id: BasePartId): SubGroupId | null {
  for (const g of ['face', 'dpad'] as const) {
    if (GROUP_MEMBERS[g].includes(id)) return g
  }
  return null
}

export interface GroupConfig extends Transform {
  /** true: the editor moves the whole group; false: members are edited one by one. */
  grouped: boolean
}

// ---------- Controllers ----------
export type ControllerType =
  | 'xbox-one'
  | 'ps4'
  | 'razer-wolverine'
  | 'scuf-envision'

export interface OverlaySettings {
  scale: number
  deadzone: number
  opacity: number
    /** true: every part uses the overlay colors below. */
  colorsApplyToAll: boolean
  borderColor: string
  pressedColor: string
  /** Fill of buttons and other parts (not the shell). */
  fillColor: string
  /** Fill of the controller shell. */
  shellFillColor: string
  /** How far a stick cap moves at full tilt (canvas units). */
  stickTravel: number
}

// ---------- Profiles ----------
export const SCHEMA_VERSION = 5

export interface Profile {
  id: string
  name: string
  schemaVersion: number
  controllerType: ControllerType
  parts: Record<BasePartId, PartConfig>
  groups: Record<GroupId, GroupConfig>
  buttons: Record<ExtraButtonId, ExtraButtonConfig>
  settings: OverlaySettings
  createdAt: number
  updatedAt: number
}

// ---------- Artwork ----------
export interface ArtworkRecord {
  id: string
  profileId: string
  kind: 'base' | BasePartId | ExtraButtonId
  /** Which of the part's two image slots this fills. Missing means 'normal'. */
  slot?: ArtSlot
  name: string
  mime: string
  /** Raw uploaded file bytes. Stored as ArrayBuffer (not an object URL). */
  data: ArrayBuffer
  createdAt: number
}

export const DEFAULT_BORDER_COLOR = '#6b7280'
export const DEFAULT_PRESSED_COLOR = '#ffd23f'
export const MIN_SCALE = 0.1
export const MAX_SCALE = 5
export const DEFAULT_FILL_COLOR = '#3a3f4b'
export const DEFAULT_SHELL_FILL_COLOR = '#1b1e25'
export const DEFAULT_STICK_TRAVEL = 10
export const MIN_STICK_TRAVEL = 5
export const MAX_STICK_TRAVEL = 30
export const MAX_DEADZONE = 0.6