import type { BasePartId, GroupId } from './types'

export const CANVAS_W = 600
export const CANVAS_H = 440

export type ControllerFamily = 'xbox' | 'playstation' | 'gamesir'

export interface Pt {
  x: number
  y: number
}
export interface Labeled extends Pt {
  label: string
}
/** Center-based box, optionally rotated (degrees) around its center. */
export interface Box {
  cx: number
  cy: number
  w: number
  h: number
  rotate?: number
}
/** A drawn outline plus its center, and the two edges it was built from. */
export interface Shape {
  path: string
  anchor: Pt
  inner: Pt[]
  outer: Pt[]
}

export type Curve = readonly [Pt, Pt, Pt, Pt]

export function bez(c: Curve, t: number): Pt {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const d = 3 * u * t * t
  const e = t * t * t
  return {
    x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x,
    y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y,
  }
}

function bezTangent(c: Curve, t: number): Pt {
  const u = 1 - t
  const a = 3 * u * u
  const b = 6 * u * t
  const d = 3 * t * t
  return {
    x: a * (c[1].x - c[0].x) + b * (c[2].x - c[1].x) + d * (c[3].x - c[2].x),
    y: a * (c[1].y - c[0].y) + b * (c[2].y - c[1].y) + d * (c[3].y - c[2].y),
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * A strip that hugs part of a shell edge. Its inner edge lies exactly on the
 * curve, so it meets the shell with no gap and no overlap. The outer edge is
 * offset outward by `thickness`.
 */
export function edgeStrip(c: Curve, t0: number, t1: number, thickness: number, steps = 16): Shape {
  const inner: Pt[] = []
  const outer: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps
    const pt = bez(c, t)
    const tan = bezTangent(c, t)
    const len = Math.hypot(tan.x, tan.y) || 1
    inner.push(pt)
    outer.push({ x: pt.x + (tan.y / len) * thickness, y: pt.y - (tan.x / len) * thickness })
  }
  const ring = [...inner, ...[...outer].reverse()]
  const path = 'M' + ring.map((p) => `${r2(p.x)} ${r2(p.y)}`).join(' L') + ' Z'
  const anchor = {
    x: ring.reduce((s, p) => s + p.x, 0) / ring.length,
    y: ring.reduce((s, p) => s + p.y, 0) / ring.length,
  }
  return { path, anchor, inner, outer }
}

type FaceSet = Record<'south' | 'east' | 'west' | 'north', Labeled>

const centerOf = (f: FaceSet): Pt => {
  const v = Object.values(f)
  return {
    x: v.reduce((s, p) => s + p.x, 0) / v.length,
    y: v.reduce((s, p) => s + p.y, 0) / v.length,
  }
}

export interface Layout {
  body: string
  bodyAnchor: Pt
  /** The top edge of the shell; the bumpers are built along it. */
  topEdge: Curve
  face: FaceSet
  faceCenter: Pt
  dpad: Pt
  leftStick: Pt
  rightStick: Pt
  back: Labeled
  start: Labeled
  home: Pt
  touchpad: Box | null
  lb: Shape
  rb: Shape
  lt: Box
  rt: Box
}

export const DPAD_STEP = 20
/** Gap between a small button's center and the baseline of its label. */
export const LABEL_OFFSET = 20
const BUMPER_THICKNESS = 17

const XBOX_EDGE: Curve = [
  { x: 150, y: 120 },
  { x: 170, y: 90 },
  { x: 430, y: 90 },
  { x: 450, y: 120 },
]
const PS_EDGE: Curve = [
  { x: 160, y: 110 },
  { x: 200, y: 95 },
  { x: 400, y: 95 },
  { x: 440, y: 110 },
]
// The GameSir shell's top edge. The shell outline starts with this exact curve.
const GS_EDGE: Curve = [
  { x: 94, y: 125 },
  { x: 150, y: 82 },
  { x: 450, y: 82 },
  { x: 506, y: 125 },
]

const XBOX_FACE: FaceSet = {
  south: { x: 425, y: 195, label: 'A' },
  east: { x: 455, y: 165, label: 'B' },
  west: { x: 395, y: 165, label: 'X' },
  north: { x: 425, y: 135, label: 'Y' },
}
const PS_FACE: FaceSet = {
  south: { x: 425, y: 200, label: '✕' },
  east: { x: 455, y: 170, label: '○' },
  west: { x: 395, y: 170, label: '□' },
  north: { x: 425, y: 140, label: '△' },
}
const GS_FACE: FaceSet = {
  south: { x: 450, y: 199, label: 'A' },
  east: { x: 481, y: 168, label: 'B' },
  west: { x: 419, y: 168, label: 'X' },
  north: { x: 450, y: 137, label: 'Y' },
}

// Original shapes drawn for this project, in a 600 x 440 canvas.
export const LAYOUTS: Record<ControllerFamily, Layout> = {
  xbox: {
    body: 'M150 120 C170 90 430 90 450 120 C500 140 560 260 540 330 C525 375 470 370 440 320 C420 290 400 270 360 270 L240 270 C200 270 180 290 160 320 C130 370 75 375 60 330 C40 260 100 140 150 120 Z',
    bodyAnchor: { x: 300, y: 235 },
    topEdge: XBOX_EDGE,
    face: XBOX_FACE,
    faceCenter: centerOf(XBOX_FACE),
    dpad: { x: 235, y: 235 },
    leftStick: { x: 165, y: 160 },
    rightStick: { x: 365, y: 235 },
    back: { x: 265, y: 165, label: '' },
    start: { x: 335, y: 165, label: '' },
    home: { x: 300, y: 125 },
    touchpad: null,
    lb: edgeStrip(XBOX_EDGE, 0, 0.38, BUMPER_THICKNESS),
    rb: edgeStrip(XBOX_EDGE, 0.62, 1, BUMPER_THICKNESS),
    lt: { cx: 190, cy: 52, w: 78, h: 36, rotate: -8 },
    rt: { cx: 410, cy: 52, w: 78, h: 36, rotate: 8 },
  },
  playstation: {
    body: 'M160 110 C200 95 400 95 440 110 C500 125 570 250 550 330 C535 380 480 380 455 330 C440 300 420 285 385 285 L215 285 C180 285 160 300 145 330 C120 380 65 380 50 330 C30 250 100 125 160 110 Z',
    bodyAnchor: { x: 300, y: 238 },
    topEdge: PS_EDGE,
    face: PS_FACE,
    faceCenter: centerOf(PS_FACE),
    dpad: { x: 175, y: 170 },
    leftStick: { x: 240, y: 240 },
    rightStick: { x: 360, y: 240 },
    back: { x: 215, y: 124, label: 'Share' },
    start: { x: 385, y: 124, label: 'Options' },
    home: { x: 300, y: 240 },
    touchpad: { cx: 300, cy: 147, w: 120, h: 58 },
    lb: edgeStrip(PS_EDGE, 0, 0.38, BUMPER_THICKNESS),
    rb: edgeStrip(PS_EDGE, 0.62, 1, BUMPER_THICKNESS),
    lt: { cx: 195, cy: 44, w: 78, h: 36, rotate: -8 },
    rt: { cx: 405, cy: 44, w: 78, h: 36, rotate: 8 },
  },
  // Based on the GameSir Tarantula picture: wide shoulders, D-pad top left,
  // symmetric sticks, A/B/X/Y top right, three small buttons and the logo in the middle.
  gamesir: {
    body: 'M94 125 C150 82 450 82 506 125 C540 190 556 280 549 319 C543 368 518 392 495 390 C468 388 452 360 440 330 C428 300 420 284 400 281 L200 281 C180 284 172 300 160 330 C148 360 132 388 105 390 C82 392 57 368 51 319 C44 280 60 190 94 125 Z',
    bodyAnchor: { x: 300, y: 240 },
    topEdge: GS_EDGE,
    face: GS_FACE,
    faceCenter: centerOf(GS_FACE),
    dpad: { x: 150, y: 168 },
    leftStick: { x: 223, y: 230 },
    rightStick: { x: 376, y: 230 },
    back: { x: 274, y: 161, label: '' },
    start: { x: 326, y: 161, label: '' },
    home: { x: 300, y: 220 },
    touchpad: null,
    lb: edgeStrip(GS_EDGE, 0, 0.3, BUMPER_THICKNESS),
    rb: edgeStrip(GS_EDGE, 0.7, 1, BUMPER_THICKNESS),
    lt: { cx: 150, cy: 50, w: 78, h: 36, rotate: -8 },
    rt: { cx: 450, cy: 50, w: 78, h: 36, rotate: 8 },
  },
}

/** The default center point of each built-in part. */
export function anchorFor(family: ControllerFamily, part: BasePartId): Pt {
  const L = LAYOUTS[family]
  switch (part) {
    case 'shell':
      return L.bodyAnchor
    case 'lt':
    case 'rt': {
      const b = L[part]
      return { x: b.cx, y: b.cy }
    }
    case 'lb':
    case 'rb':
      return L[part].anchor
    case 'dpadUp':
      return { x: L.dpad.x, y: L.dpad.y - DPAD_STEP }
    case 'dpadDown':
      return { x: L.dpad.x, y: L.dpad.y + DPAD_STEP }
    case 'dpadLeft':
      return { x: L.dpad.x - DPAD_STEP, y: L.dpad.y }
    case 'dpadRight':
      return { x: L.dpad.x + DPAD_STEP, y: L.dpad.y }
    case 'leftStick':
      return L.leftStick
    case 'rightStick':
      return L.rightStick
    case 'south':
    case 'east':
    case 'west':
    case 'north':
      return L.face[part]
    case 'back':
      return L.back
    case 'start':
      return L.start
    case 'home':
      return L.home
    case 'touchpad':
      return L.touchpad ? { x: L.touchpad.cx, y: L.touchpad.cy } : { x: 300, y: 147 }
  }
}

/** The point each group is scaled and rotated around. */
export function groupAnchorFor(family: ControllerFamily, id: GroupId): Pt {
  const L = LAYOUTS[family]
  if (id === 'controls') return { x: CANVAS_W / 2, y: CANVAS_H / 2 }
  if (id === 'dpad') return L.dpad
  return L.faceCenter
}
