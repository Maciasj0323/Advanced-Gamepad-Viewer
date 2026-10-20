import { useId, type ReactNode } from 'react'
import { hasArt, resolveArt } from './artwork'
import { contrastText } from './extras'
import type { PadState } from './gamepad'
import {
  anchorFor,
  groupAnchorFor,
  LABEL_OFFSET,
  LAYOUTS,
  type Box,
  type ControllerFamily,
  type Pt,
} from './layouts'
import PartArt from './PartArt'
import { ART_BOX, effectiveColors, transformString } from './parts'
import type { BasePartId, GroupConfig, GroupId, OverlaySettings, PartConfig } from './types'

const BODY = '#1b1e25' // the dark well around each stick
const TEXT = '#e5e7eb'

interface Props {
  family: ControllerFamily
  pad: PadState
  parts: Record<BasePartId, PartConfig>
  groups: Record<GroupId, GroupConfig>
  settings: OverlaySettings
  /** Uploaded image id -> browser URL. */
  urls: Record<string, string>
  showHint?: boolean
}

/** Draws the base controller as SVG layers. Must be placed inside an <svg>. */
export default function BaseController({
  family,
  pad,
  parts,
  groups,
  settings,
  urls,
  showHint = true,
}: Props) {
  // Unique per overlay so the floating preview doesn't clash with the main one.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const L = LAYOUTS[family]
  const p = pad.pressed
  const colors = (id: BasePartId) => effectiveColors(settings, parts[id], id === 'shell')
  const shellText = contrastText(colors('shell').fill)

  const place = (id: BasePartId, children: ReactNode) => (
    <g key={id} data-part={id} transform={transformString(parts[id], anchorFor(family, id))}>
      {children}
    </g>
  )
  const group = (id: GroupId, children: ReactNode) => (
    <g data-group={id} transform={transformString(groups[id], groupAnchorFor(family, id))}>
      {children}
    </g>
  )
  const rot = (b: Box) => `rotate(${b.rotate ?? 0} ${b.cx} ${b.cy})`

  /**
   * Draws a part: its built-in shape, or (when the part has images) only the
   * image for the current state. `offset` moves the image (used by sticks).
   */
  const draw = (id: BasePartId, pressed: boolean, shape: ReactNode, offset?: Pt) => {
    const view = resolveArt(parts[id].artwork, pressed)
    if (view.kind === 'shape') return place(id, shape)
    if (view.kind === 'none') return place(id, null)
    const url = urls[view.id]
    if (!url) return place(id, null) // still loading
    const a = anchorFor(family, id)
    const box = ART_BOX[id]
    return place(
      id,
      <PartArt
        url={url}
        cx={a.x + (offset?.x ?? 0)}
        cy={a.y + (offset?.y ?? 0)}
        w={box.w}
        h={box.h}
        tint={view.tint}
        tintColor={colors(id).pressed}
      />,
    )
  }

  const trigger = (id: 'lt' | 'rt') => {
    const b = L[id]
    const c = colors(id)
    const v = Math.max(0, Math.min(1, pad[id]))
    const x = b.cx - b.w / 2
    const y = b.cy - b.h / 2
    const clipId = `clip-${uid}-${id}`
    return draw(
      id,
      p[id],
      <g transform={rot(b)}>
        <clipPath id={clipId}>
          <rect x={x} y={y} width={b.w} height={b.h} rx={12} />
        </clipPath>
        <rect x={x} y={y} width={b.w} height={b.h} rx={12} fill={c.fill} />
        <rect
          x={x} y={y + b.h * (1 - v)} width={b.w} height={b.h * v}
          fill={c.pressed} clipPath={`url(#${clipId})`}
        />
        <rect x={x} y={y} width={b.w} height={b.h} rx={12} fill="none" stroke={c.border} strokeWidth={2} />
      </g>,
    )
  }

  // Bumpers are strips along the shell's top edge, so they meet the outline exactly.
  const bumper = (id: 'lb' | 'rb') => {
    const c = colors(id)
    return draw(
      id,
      p[id],
      <path
        d={L[id].path}
        fill={p[id] ? c.pressed : c.fill}
        stroke={c.border}
        strokeWidth={2}
        strokeLinejoin="round"
      />,
    )
  }

  const touchpad = () => {
    const b = L.touchpad
    if (!b) return null
    const c = colors('touchpad')
    return draw(
      'touchpad',
      p.touchpad,
      <rect
        x={b.cx - b.w / 2} y={b.cy - b.h / 2} width={b.w} height={b.h} rx={10}
        fill={p.touchpad ? c.pressed : c.fill} stroke={c.border} strokeWidth={2}
      />,
    )
  }

  const dpadCell = (id: 'dpadUp' | 'dpadDown' | 'dpadLeft' | 'dpadRight', on: boolean) => {
    const a = anchorFor(family, id)
    const c = colors(id)
    return draw(
      id,
      on,
      <rect
        x={a.x - 10} y={a.y - 10} width={20} height={20}
        fill={on ? c.pressed : c.fill} stroke={c.border} strokeWidth={2}
      />,
    )
  }

  const stick = (id: 'leftStick' | 'rightStick', click: 'l3' | 'r3') => {
    const pos = L[id]
    const axis = id === 'leftStick' ? pad.leftStick : pad.rightStick
    const c = colors(id)
    const t = settings.stickTravel
    return draw(
      id,
      p[click],
      <>
        <circle cx={pos.x} cy={pos.y} r={30} fill={BODY} stroke={c.border} strokeWidth={2} />
        <circle
          cx={pos.x + axis.x * t} cy={pos.y + axis.y * t} r={19}
          fill={p[click] ? c.pressed : c.fill} stroke={c.border} strokeWidth={2}
        />
      </>,
      { x: axis.x * t, y: axis.y * t },
    )
  }

  const face = (id: 'south' | 'east' | 'west' | 'north') => {
    const b = L.face[id]
    const c = colors(id)
    const on = p[id]
    return draw(
      id,
      on,
      <>
        <circle cx={b.x} cy={b.y} r={15} fill={on ? c.pressed : c.fill} stroke={c.border} strokeWidth={2} />
        <text
          x={b.x} y={b.y} textAnchor="middle" dominantBaseline="central"
          fontSize={14} fontWeight={700} fill={contrastText(on ? c.pressed : c.fill)}
        >
          {b.label}
        </text>
      </>,
    )
  }

  const small = (id: 'back' | 'start') => {
    const b = L[id]
    const c = colors(id)
    return draw(
      id,
      p[id],
      <>
        <circle cx={b.x} cy={b.y} r={9} fill={p[id] ? c.pressed : c.fill} stroke={c.border} strokeWidth={2} />
        {b.label && (
          <text x={b.x} y={b.y + LABEL_OFFSET} textAnchor="middle" fontSize={11} fill={shellText} opacity={0.7}>
            {b.label}
          </text>
        )}
      </>,
    )
  }

  const home = () => {
    const c = colors('home')
    return draw(
      'home',
      p.home,
      <circle cx={L.home.x} cy={L.home.y} r={12} fill={p.home ? c.pressed : c.fill} stroke={c.border} strokeWidth={2} />,
    )
  }

  const dpadIds = ['dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight'] as const
  const dpadHasArt = dpadIds.some((id) => hasArt(parts[id].artwork))
  const dpadColors = colors('dpadUp')

  return (
    <g>
      {draw(
        'shell',
        false,
        <path d={L.body} fill={colors('shell').fill} stroke={colors('shell').border} strokeWidth={3} />,
      )}

      {group(
        'controls',
        <>
          {trigger('lt')}
          {trigger('rt')}
          {bumper('lb')}
          {bumper('rb')}
          {touchpad()}
          {stick('leftStick', 'l3')}
          {stick('rightStick', 'r3')}
          {small('back')}
          {small('start')}
          {home()}
          {group(
            'face',
            <>
              {face('south')}
              {face('east')}
              {face('west')}
              {face('north')}
            </>,
          )}
          {group(
            'dpad',
            <>
              {!dpadHasArt && (
                <rect
                  x={L.dpad.x - 10} y={L.dpad.y - 10} width={20} height={20}
                  fill={dpadColors.fill} stroke={dpadColors.border} strokeWidth={2}
                />
              )}
              {dpadCell('dpadUp', p.up)}
              {dpadCell('dpadDown', p.down)}
              {dpadCell('dpadLeft', p.left)}
              {dpadCell('dpadRight', p.right)}
            </>,
          )}
        </>,
      )}

      {showHint && !pad.connected && (
        <text x={300} y={430} textAnchor="middle" fontSize={14} fill={TEXT} opacity={0.7}>
          Press any button on your controller to connect it
        </text>
      )}
    </g>
  )
}