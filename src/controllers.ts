import type { ControllerType, ExtraButtonId } from './types'

export interface ControllerDefinition {
  type: ControllerType
  label: string
  /** Which built-in base layout to draw. */
  family: 'xbox' | 'playstation'
  /** Additional buttons that are visible by default for this controller. */
  defaultVisible: ExtraButtonId[]
}

export const CONTROLLERS: Record<ControllerType, ControllerDefinition> = {
  'xbox-one': {
    type: 'xbox-one',
    label: 'Xbox One',
    family: 'xbox',
    defaultVisible: [],
  },
  ps4: {
    type: 'ps4',
    label: 'PlayStation 4',
    family: 'playstation',
    defaultVisible: [],
  },
  'razer-wolverine': {
    type: 'razer-wolverine',
    label: 'Razer Wolverine',
    family: 'xbox',
    defaultVisible: ['paddle1', 'paddle2', 'paddle3', 'paddle4', 'clawLeft', 'clawRight'],
  },
  'scuf-envision': {
    type: 'scuf-envision',
    label: 'SCUF Envision/Omega',
    family: 'playstation',
    defaultVisible: ['paddle1', 'paddle2', 'paddle3', 'paddle4', 'sideLeft', 'sideRight'],
  },
}

export const CONTROLLER_LIST: ControllerDefinition[] = Object.values(CONTROLLERS)

/** Starting positions for the extras (0..1 of the overlay). Users adjust them. */
/** Starting positions for the extras (0..1 of the overlay). Users adjust them. */
export const DEFAULT_POSITIONS: Record<ExtraButtonId, { yaw: number; pitch: number }> = {
  // Left handle: P2 near the bottom center, P1 above it, clear of the side button.
  paddle1: { yaw: 0.175, pitch: 0.6 },
  paddle2: { yaw: 0.175, pitch: 0.745 },
  // Right handle: P4 near the bottom center, P3 above it.
  paddle3: { yaw: 0.825, pitch: 0.6 },
  paddle4: { yaw: 0.825, pitch: 0.745 },
  // Outside the shell at trigger height.
  clawLeft: { yaw: 0.12, pitch: 0.115 },
  clawRight: { yaw: 0.88, pitch: 0.115 },
  sideLeft: { yaw: 0.09, pitch: 0.5 },
  sideRight: { yaw: 0.91, pitch: 0.5 },
}