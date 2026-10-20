import { describe, expect, it } from 'vitest'
import { CONTROLLER_LIST, CONTROLLERS } from './controllers'
import { createProfile, normalizeProfile, withControllerType } from './profile'
import { EXTRA_BUTTON_IDS } from './types'

describe('Gamesir Tarantula 8k preset', () => {
  it('is in the controller list with its label', () => {
    expect(CONTROLLER_LIST.map((c) => c.label)).toContain('Gamesir Tarantula 8k')
  })

  it('uses the PlayStation layout with 4 paddles and 2 claw-grip bumpers, no side buttons', () => {
    expect(CONTROLLERS['gamesir-tarantula-8k'].family).toBe('playstation')
    const p = createProfile('t', 'gamesir-tarantula-8k')
    const on = EXTRA_BUTTON_IDS.filter((id) => p.buttons[id].visible)
    expect(on).toEqual(['paddle1', 'paddle2', 'paddle3', 'paddle4', 'clawLeft', 'clawRight'])
    expect(p.buttons.sideLeft.visible).toBe(false)
    expect(p.buttons.sideRight.visible).toBe(false)
  })

  it('switching to it from PS4 keeps built-in positions and turns the paddles and claws on', () => {
    const ps4 = createProfile('p', 'ps4')
    const t = withControllerType(ps4, 'gamesir-tarantula-8k')
    expect(t.parts).toEqual(ps4.parts)
    expect(t.buttons.paddle1.visible).toBe(true)
    expect(t.buttons.clawLeft.visible).toBe(true)
    expect(t.buttons.sideLeft.visible).toBe(false)
  })

  it('a saved profile of this type survives loading', () => {
    const p = createProfile('t', 'gamesir-tarantula-8k')
    expect(normalizeProfile(p).controllerType).toBe('gamesir-tarantula-8k')
  })
})