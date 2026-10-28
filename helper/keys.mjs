// Turns the key names the hook library uses into the same names the browser uses
// (KeyboardEvent.code), so a binding saved in the app matches what the helper sees.

const SIDED = {
  Ctrl: 'ControlLeft',
  Control: 'ControlLeft',
  CtrlRight: 'ControlRight',
  ControlRight: 'ControlRight',
  Alt: 'AltLeft',
  AltRight: 'AltRight',
  Shift: 'ShiftLeft',
  ShiftRight: 'ShiftRight',
  Meta: 'MetaLeft',
  MetaRight: 'MetaRight',
}

export function eventCodeFromUiohookName(name) {
  if (/^[A-Z]$/.test(name)) return `Key${name}`
  if (/^[0-9]$/.test(name)) return `Digit${name}`
  return Object.prototype.hasOwnProperty.call(SIDED, name) ? SIDED[name] : name
}

/** Builds keycode -> browser key name from the library's own key list. */
export function buildKeycodeMap(keyEnum) {
  const map = new Map()
  for (const [name, keycode] of Object.entries(keyEnum)) {
    if (typeof keycode === 'number') map.set(keycode, eventCodeFromUiohookName(name))
  }
  return map
}

/** Hook library button numbers (1 left, 2 right, 3 middle, 4, 5) -> browser MouseEvent.button. */
export function mouseButtonFromUiohook(button) {
  return { 1: 0, 2: 2, 3: 1, 4: 3, 5: 4 }[button] ?? null
}
