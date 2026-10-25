import { activeExtraButtons, bindingsEqual } from './input'
import { isHexColor } from './profile'
import { EXTRA_BUTTON_IDS, type ExtraButtonConfig, type ExtraButtonId } from './types'

type Buttons = Record<ExtraButtonId, ExtraButtonConfig>

export type ExtraKind = 'paddle' | 'claw' | 'side' | 'mid'

export function extraKind(id: ExtraButtonId): ExtraKind {
  if (id.startsWith('paddle')) return 'paddle'
  if (id.startsWith('claw')) return 'claw'
  if (id.startsWith('mid')) return 'mid'
  return 'side'
}

export const EXTRA_SHORT_LABELS: Record<ExtraButtonId, string> = {
  paddle1: 'P1',
  paddle2: 'P2',
  paddle3: 'P3',
  paddle4: 'P4',
  clawLeft: 'LC',
  clawRight: 'RC',
  sideLeft: 'LS',
  sideRight: 'RS',
  mid1: 'C1',
  mid2: 'C2',
  mid3: 'C3',
  mid4: 'C4',
}

/** Default size of each kind of extra button, in canvas units. */
export const EXTRA_BASE_SIZE: Record<ExtraKind, { w: number; h: number }> = {
  paddle: { w: 28, h: 52 },
  claw: { w: 90, h: 22 },
  side: { w: 42, h: 42 },
  mid: { w: 34, h: 16 },
}

/** Label size of each kind of extra button. */
export const EXTRA_FONT_SIZE: Record<ExtraKind, number> = {
  paddle: 13,
  claw: 13,
  side: 13,
  mid: 9,
}

/**
 * A tilt built into how a button is drawn (the C buttons slope like the real
 * ones). The Rotation slider adds to it, and its 0 means "as drawn".
 */
export const EXTRA_BASE_ROTATION: Record<ExtraButtonId, number> = {
  paddle1: 0,
  paddle2: 0,
  paddle3: 0,
  paddle4: 0,
  clawLeft: 0,
  clawRight: 0,
  sideLeft: 0,
  sideRight: 0,
  mid1: 35,
  mid2: 35,
  mid3: -35,
  mid4: -35,
}

/** Final drawn size: default size x scale x width/height multipliers. */
export function extraSize(
  kind: ExtraKind,
  t: { scale: number; width: number; height: number },
): { w: number; h: number } {
  const base = EXTRA_BASE_SIZE[kind]
  return { w: base.w * t.scale * t.width, h: base.h * t.scale * t.height }
}

/** Buttons the profile has switched on. */
export function visibleExtras(buttons: Buttons): ExtraButtonId[] {
  return EXTRA_BUTTON_IDS.filter((id) => buttons[id].visible)
}

/**
 * Which extras are lit right now: visible AND their own keyboard/mouse
 * binding is held. This takes only the held-input set, never controller
 * data, so a paddle that mirrors a controller button can't light anything.
 */
export function litExtras(buttons: Buttons, down: ReadonlySet<string>): Set<ExtraButtonId> {
  const active = activeExtraButtons(buttons, down)
  const lit = new Set<ExtraButtonId>()
  for (const id of visibleExtras(buttons)) {
    if (active.has(id)) lit.add(id)
  }
  return lit
}

/** Other buttons that use the same binding as this one (sharing is allowed). */
export function sharedWith(buttons: Buttons, id: ExtraButtonId): ExtraButtonId[] {
  const mine = buttons[id].binding
  if (!mine) return []
  return EXTRA_BUTTON_IDS.filter((o) => o !== id && bindingsEqual(mine, buttons[o].binding))
}

/** Dark or white text, whichever is readable on this background color. */
export function contrastText(hex: string): string {
  if (!isHexColor(hex)) return '#ffffff'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#1b1e25' : '#ffffff'
}
