// Pure logic for reading a controller. No React, no browser calls, easy to test.

// Standard layout: the button index equals the position in this list.
export const PAD_BUTTON_NAMES = [
  'south', // A / Cross
  'east', // B / Circle
  'west', // X / Square
  'north', // Y / Triangle
  'lb',
  'rb',
  'lt',
  'rt',
  'back', // View / Share
  'start', // Menu / Options
  'l3',
  'r3',
  'up',
  'down',
  'left',
  'right',
  'home', // Xbox / PS button
  'touchpad', // PlayStation only
] as const

export type PadButtonName = (typeof PAD_BUTTON_NAMES)[number]

export interface Stick {
  x: number
  y: number
}

export interface PadState {
  connected: boolean
  /** true when we know this controller's layout; false means we guessed "standard". */
  mapped: boolean
  id: string
  pressed: Record<PadButtonName, boolean>
  lt: number
  rt: number
  leftStick: Stick
  rightStick: Stick
}

/** The small part of the browser's Gamepad object that we use. */
export interface PadLike {
  id?: string
  mapping?: string
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>
  axes: ReadonlyArray<number>
}

// ---------- Per-controller layouts ----------
interface PadMap {
  name: string
  /** Button name -> index in pad.buttons. Leave out anything that is not a button. */
  buttons: Partial<Record<PadButtonName, number>>
  /** Triggers that report as axes (rest at -1, fully pressed at +1). */
  triggerAxes?: { lt: number; rt: number }
  /** D-pad reported as one "hat" axis. */
  hatAxis?: number
  leftStick: readonly [number, number]
  rightStick: readonly [number, number]
}

const STANDARD_MAP: PadMap = {
  name: 'Standard',
  buttons: Object.fromEntries(PAD_BUTTON_NAMES.map((n, i) => [n, i])) as PadMap['buttons'],
  leftStick: [0, 1],
  rightStick: [2, 3],
}

// Measured on a real SCUF Envision Controller V2 (Vendor 1b1c, Product 3a04).
const SCUF_ENVISION_V2: PadMap = {
  name: 'SCUF Envision V2',
  buttons: {
    south: 0,
    east: 1,
    west: 2,
    north: 3,
    lb: 4,
    rb: 5,
    back: 6,
    start: 7,
    l3: 8,
    r3: 9,
    home: 10,
  },
  triggerAxes: { lt: 3, rt: 4 },
  hatAxis: 9,
  leftStick: [0, 1],
  rightStick: [2, 5],
}

const KNOWN_PADS: ReadonlyArray<{ vendor: string; product: string; map: PadMap }> = [
  { vendor: '1b1c', product: '3a04', map: SCUF_ENVISION_V2 },
]

function parseIds(id: string): { vendor: string; product: string } | null {
  const m = /Vendor:\s*([0-9a-f]{4})\s*Product:\s*([0-9a-f]{4})/i.exec(id)
  return m ? { vendor: m[1].toLowerCase(), product: m[2].toLowerCase() } : null
}

/** Returns the layout for this controller, or null if we don't know it. */
function mapForPad(pad: PadLike): PadMap | null {
  if (pad.mapping === 'standard') return STANDARD_MAP
  const ids = parseIds(pad.id ?? '')
  const known = ids && KNOWN_PADS.find((k) => k.vendor === ids.vendor && k.product === ids.product)
  return known ? known.map : null
}

/** When several controllers are connected, prefer one whose layout we know. */
export function pickPad<T extends PadLike>(pads: readonly T[]): T | undefined {
  return pads.find((p) => mapForPad(p) !== null) ?? pads[0]
}

// ---------- Reading ----------
function emptyPressed(): Record<PadButtonName, boolean> {
  const pressed = {} as Record<PadButtonName, boolean>
  for (const name of PAD_BUTTON_NAMES) pressed[name] = false
  return pressed
}

export function emptyPadState(): PadState {
  return {
    connected: false,
    mapped: false,
    id: '',
    pressed: emptyPressed(),
    lt: 0,
    rt: 0,
    leftStick: { x: 0, y: 0 },
    rightStick: { x: 0, y: 0 },
  }
}

const clamp1 = (n: number) => Math.max(-1, Math.min(1, Number.isFinite(n) ? n : 0))

function stick(x: number | undefined, y: number | undefined, deadzone: number): Stick {
  const cx = clamp1(x ?? 0)
  const cy = clamp1(y ?? 0)
  return Math.hypot(cx, cy) < deadzone ? { x: 0, y: 0 } : { x: cx, y: cy }
}

/** Trigger axis: -1 (released) .. +1 (fully pressed)  ->  0 .. 1 */
function axisToTrigger(a: number | undefined): number {
  if (a === undefined || !Number.isFinite(a)) return 0
  return Math.max(0, Math.min(1, (a + 1) / 2))
}

// Hat positions in order: up, up-right, right, down-right, down, down-left, left, up-left.
const HAT_VALUES = [-1, -0.714, -0.429, -0.143, 0.143, 0.429, 0.714, 1]

function decodeHat(v: number | undefined): { up: boolean; right: boolean; down: boolean; left: boolean } {
  const none = { up: false, right: false, down: false, left: false }
  if (v === undefined || !Number.isFinite(v)) return none
  const i = HAT_VALUES.findIndex((h) => Math.abs(h - v) < 0.1)
  if (i < 0) return none // neutral (about 1.29) or anything unexpected
  return {
    up: i === 7 || i === 0 || i === 1,
    right: i >= 1 && i <= 3,
    down: i >= 3 && i <= 5,
    left: i >= 5 && i <= 7,
  }
}

export function readPadState(pad: PadLike | null | undefined, deadzone = 0.25): PadState {
  if (!pad) return emptyPadState()
  const known = mapForPad(pad)
  const map = known ?? STANDARD_MAP

  const pressed = emptyPressed()
  for (const name of PAD_BUTTON_NAMES) {
    const idx = map.buttons[name]
    if (idx !== undefined) pressed[name] = pad.buttons[idx]?.pressed ?? false
  }

    let lt: number
    let rt: number
  if (map.triggerAxes) {
    lt = axisToTrigger(pad.axes[map.triggerAxes.lt])
    rt = axisToTrigger(pad.axes[map.triggerAxes.rt])
    pressed.lt = lt > 0.2
    pressed.rt = rt > 0.2
  } else {
    const li = map.buttons.lt
    const ri = map.buttons.rt
    lt = li !== undefined ? (pad.buttons[li]?.value ?? 0) : 0
    rt = ri !== undefined ? (pad.buttons[ri]?.value ?? 0) : 0
  }

  if (map.hatAxis !== undefined) {
    const hat = decodeHat(pad.axes[map.hatAxis])
    pressed.up = hat.up
    pressed.right = hat.right
    pressed.down = hat.down
    pressed.left = hat.left
  }

  return {
    connected: true,
    mapped: known !== null,
    id: pad.id ?? '',
    pressed,
    lt,
    rt,
    leftStick: stick(pad.axes[map.leftStick[0]], pad.axes[map.leftStick[1]], deadzone),
    rightStick: stick(pad.axes[map.rightStick[0]], pad.axes[map.rightStick[1]], deadzone),
  }
}