import { resolveArt } from './artwork'
import {
  contrastText,
  EXTRA_BASE_SIZE,
  EXTRA_SHORT_LABELS,
  extraKind,
  extraSize,
  litExtras,
  visibleExtras,
} from './extras'
import { CANVAS_H, CANVAS_W } from './layouts'
import PartArt from './PartArt'
import { effectiveColors } from './parts'
import { EXTRA_BUTTON_LABELS, type ExtraButtonConfig, type ExtraButtonId, type OverlaySettings } from './types'

interface Props {
  buttons: Record<ExtraButtonId, ExtraButtonConfig>
  settings: OverlaySettings
  down: ReadonlySet<string>
  /** Uploaded image id -> browser URL. */
  urls: Record<string, string>
}

/**
 * Draws the additional buttons as SVG layers. Must be placed inside an <svg>.
 * Each button is placed by its own yaw/pitch, sized by scale x width/height,
 * and rotated by its own rotation. A button with images draws only the image.
 */
export default function ExtraButtons({ buttons, settings, down, urls }: Props) {
  const lit = litExtras(buttons, down)

  return (
    <g>
      {visibleExtras(buttons).map((id) => {
        const b = buttons[id]
        const on = lit.has(id)
        const c = effectiveColors(settings, b)
        const kind = extraKind(id)
        const view = resolveArt(b.artwork, on)
        const label = `${EXTRA_BUTTON_LABELS[id]}${on ? ' (pressed)' : ''}`
        const place = `translate(${b.yaw * CANVAS_W} ${b.pitch * CANVAS_H}) rotate(${b.rotation})`

        if (view.kind !== 'shape') {
          const url = view.kind === 'image' ? urls[view.id] : undefined
          const base = EXTRA_BASE_SIZE[kind]
          return (
            <g
              key={id}
              role="img"
              aria-label={label}
              data-extra={id}
              data-lit={on}
              transform={`${place} scale(${b.scale * b.width} ${b.scale * b.height})`}
            >
              {url && view.kind === 'image' && (
                <PartArt
                  url={url} cx={0} cy={0} w={base.w} h={base.h}
                  tint={view.tint} tintColor={c.pressed}
                />
              )}
            </g>
          )
        }

        const { w, h } = extraSize(kind, b)
        const rx = kind === 'paddle' ? Math.min(10 * b.scale, w / 2, h / 2) : Math.min(w, h) / 2
        return (
          <g key={id} role="img" aria-label={label} data-extra={id} data-lit={on} transform={place}>
            <rect
              x={-w / 2} y={-h / 2} width={w} height={h} rx={rx}
              fill={on ? c.pressed : c.fill} stroke={c.border} strokeWidth={3}
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={13 * b.scale}
              fontWeight={700}
              fill={contrastText(on ? c.pressed : c.fill)}
              style={{ fontFamily: 'system-ui, sans-serif' }}
            >
              {EXTRA_SHORT_LABELS[id]}
            </text>
          </g>
        )
      })}
    </g>
  )
}