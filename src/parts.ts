import {
  anchorFor,
  CANVAS_H,
  CANVAS_W,
  groupAnchorFor,
  type ControllerFamily,
  type Pt,
} from './layouts'
import {
  BASE_PART_IDS,
  DEFAULT_BORDER_COLOR,
  DEFAULT_PRESSED_COLOR,
  DEFAULT_FILL_COLOR,
  DEFAULT_SHELL_FILL_COLOR,
  GROUP_IDS,
  type BasePartId,
  type GroupConfig,
  type GroupId,
  type OverlaySettings,
  type PartConfig,
  type Transform,
} from './types'

export const BASE_PART_LABELS: Record<BasePartId, string> = {
  shell: 'Controller shell',
  lt: 'Left trigger',
  rt: 'Right trigger',
  lb: 'Left bumper',
  rb: 'Right bumper',
  dpadUp: 'D-pad up',
  dpadDown: 'D-pad down',
  dpadLeft: 'D-pad left',
  dpadRight: 'D-pad right',
  leftStick: 'Left stick',
  rightStick: 'Right stick',
  south: 'Face button: bottom (A / ✕)',
  east: 'Face button: right (B / ○)',
  west: 'Face button: left (X / □)',
  north: 'Face button: top (Y / △)',
  back: 'View / Share button',
  start: 'Menu / Options button',
  home: 'Home button',
  touchpad: 'Touchpad (PlayStation)',
}

export const GROUP_LABELS: Record<GroupId, string> = {
  controls: 'All built-in controls (group)',
  face: 'Face buttons (group)',
  dpad: 'D-pad (group)',
}

/**
 * The box an uploaded image is fitted into (aspect ratio kept), centered on
 * the part's default position. Scale, width and height then adjust it.
 */
export const ART_BOX: Record<BasePartId, { w: number; h: number }> = {
  shell: { w: 520, h: 300 },
  lt: { w: 78, h: 36 },
  rt: { w: 78, h: 36 },
  lb: { w: 104, h: 32 },
  rb: { w: 104, h: 32 },
  dpadUp: { w: 20, h: 20 },
  dpadDown: { w: 20, h: 20 },
  dpadLeft: { w: 20, h: 20 },
  dpadRight: { w: 20, h: 20 },
  leftStick: { w: 60, h: 60 },
  rightStick: { w: 60, h: 60 },
  south: { w: 30, h: 30 },
  east: { w: 30, h: 30 },
  west: { w: 30, h: 30 },
  north: { w: 30, h: 30 },
  back: { w: 20, h: 20 },
  start: { w: 20, h: 20 },
  home: { w: 24, h: 24 },
  touchpad: { w: 120, h: 58 },
}

function atAnchor(a: Pt): Transform {
  return {
    yaw: a.x / CANVAS_W,
    pitch: a.y / CANVAS_H,
    scale: 1,
    rotation: 0,
    width: 1,
    height: 1,
  }
}

export function defaultFill(id: BasePartId): string {
  return id === 'shell' ? DEFAULT_SHELL_FILL_COLOR : DEFAULT_FILL_COLOR
}

/** A part at its default layout position, normal size, no rotation, no images. */
export function defaultPart(family: ControllerFamily, id: BasePartId): PartConfig {
  return {
    ...atAnchor(anchorFor(family, id)),
    artwork: { normal: null, pressed: null },
    borderColor: DEFAULT_BORDER_COLOR,
    pressedColor: DEFAULT_PRESSED_COLOR,
    fillColor: defaultFill(id),
  }
}

export function createParts(family: ControllerFamily): Record<BasePartId, PartConfig> {
  const parts = {} as Record<BasePartId, PartConfig>
  for (const id of BASE_PART_IDS) parts[id] = defaultPart(family, id)
  return parts
}

export function defaultGroup(family: ControllerFamily, id: GroupId): GroupConfig {
  return { ...atAnchor(groupAnchorFor(family, id)), grouped: true }
}

export function createGroups(family: ControllerFamily): Record<GroupId, GroupConfig> {
  const groups = {} as Record<GroupId, GroupConfig>
  for (const id of GROUP_IDS) groups[id] = defaultGroup(family, id)
  return groups
}

const n = (v: number) => Math.round(v * 1000) / 1000

/**
 * SVG transform that places something (drawn at its default position) at
 * yaw/pitch, rotated, and scaled (with separate width and height), all
 * around its own center.
 */
export function transformString(t: Transform, anchor: Pt): string {
  return (
    `translate(${n(t.yaw * CANVAS_W)} ${n(t.pitch * CANVAS_H)}) ` +
    `rotate(${n(t.rotation)}) ` +
    `scale(${n(t.scale * t.width)} ${n(t.scale * t.height)}) ` +
    `translate(${n(-anchor.x)} ${n(-anchor.y)})`
  )
}

/** Which colors to draw with: the overlay-wide set, or the part's own. */
export function effectiveColors(
  settings: OverlaySettings,
  own: { borderColor: string; pressedColor: string; fillColor: string },
  isShell = false,
): { border: string; pressed: string; fill: string } {
  return settings.colorsApplyToAll
    ? {
        border: settings.borderColor,
        pressed: settings.pressedColor,
        fill: isShell ? settings.shellFillColor : settings.fillColor,
      }
    : { border: own.borderColor, pressed: own.pressedColor, fill: own.fillColor }
}