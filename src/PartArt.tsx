import { useId } from 'react'

interface Props {
  url: string
  /** Center of the box the image is fitted into. */
  cx: number
  cy: number
  w: number
  h: number
  /** Draw a pressed-color tint over the image (used when there is no pressed image). */
  tint: boolean
  tintColor: string
}

/** One uploaded image, fitted into a box with its aspect ratio kept. Goes inside an <svg>. */
export default function PartArt({ url, cx, cy, w, h, tint, tintColor }: Props) {
  const filterId = `tint-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const common = {
    href: url,
    x: cx - w / 2,
    y: cy - h / 2,
    width: w,
    height: h,
    preserveAspectRatio: 'xMidYMid meet' as const,
  }
  return (
    <g>
      {tint && (
        <defs>
          <filter id={filterId} x="0%" y="0%" width="100%" height="100%">
            <feFlood floodColor={tintColor} floodOpacity={0.6} />
            <feComposite in2="SourceAlpha" operator="in" />
          </filter>
        </defs>
      )}
      <image {...common} />
      {tint && <image {...common} filter={`url(#${filterId})`} />}
    </g>
  )
}