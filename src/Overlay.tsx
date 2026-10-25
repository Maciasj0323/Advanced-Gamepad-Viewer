import BaseController from './BaseController'
import { CONTROLLERS } from './controllers'
import ExtraButtons from './ExtraButtons'
import type { PadState } from './gamepad'
import { CANVAS_H, CANVAS_W } from './layouts'
import type { Profile } from './types'

interface Props {
  profile: Profile
  pad: PadState
  down: ReadonlySet<string>
  /** Uploaded image id -> browser URL. */
  urls: Record<string, string>
  /** Small preview: hides the "press a button" hint. */
  compact?: boolean
  /** Fill the whole window (used by the OBS view). */
  fill?: boolean
}

/** The whole overlay: base controller layers, then the additional buttons on top. */
export default function Overlay({ profile, pad, down, urls, compact = false, fill = false }: Props) {
  const family = CONTROLLERS[profile.controllerType].family
  return (
    <svg
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      width="100%"
      height={fill ? '100%' : undefined}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Controller overlay"
      style={{ display: 'block' }}
    >
      <BaseController
        family={family}
        pad={pad}
        parts={profile.parts}
        groups={profile.groups}
        settings={profile.settings}
        urls={urls}
        showHint={!compact}
      />
      <ExtraButtons buttons={profile.buttons} settings={profile.settings} down={down} urls={urls} />
    </svg>
  )
}
