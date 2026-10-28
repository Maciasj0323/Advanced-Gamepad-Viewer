// Gamepad Overlay input helper.
// Lets OBS see the keys and mouse buttons you assigned to extra buttons (paddles, claws, ...)
// while you are playing in another window. It only reports inputs the overlay asks for,
// only to this PC, and only to something that knows the helper code.

import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createBridge } from './bridge.mjs'
import { buildKeycodeMap, mouseButtonFromUiohook } from './keys.mjs'

const require = createRequire(import.meta.url)
let hook
try {
  hook = require('uiohook-napi')
} catch (e) {
  console.error('Could not load the input library. Run install.bat first.')
  console.error(String(e && e.message ? e.message : e))
  process.exit(1)
}
const { uIOhook, UiohookKey } = hook

// The code is kept in a file so it stays the same every time you start the helper.
const codeFile = fileURLToPath(new URL('./helper-code.txt', import.meta.url))
let code = existsSync(codeFile) ? readFileSync(codeFile, 'utf8').trim() : ''
if (!/^[0-9a-f]{24}$/.test(code)) {
  code = randomBytes(12).toString('hex')
  writeFileSync(codeFile, `${code}\n`)
}

const port = Number(process.env.OVERLAY_HELPER_PORT) || 8765
const keycodes = buildKeycodeMap(UiohookKey)
const bridge = createBridge({ code, port })

uIOhook.on('keydown', (e) => {
  const name = keycodes.get(e.keycode)
  if (name) bridge.press(`key:${name}`)
})
uIOhook.on('keyup', (e) => {
  const name = keycodes.get(e.keycode)
  if (name) bridge.release(`key:${name}`)
})
uIOhook.on('mousedown', (e) => {
  const b = mouseButtonFromUiohook(e.button)
  if (b !== null) bridge.press(`mouse:${b}`)
})
uIOhook.on('mouseup', (e) => {
  const b = mouseButtonFromUiohook(e.button)
  if (b !== null) bridge.release(`mouse:${b}`)
})

try {
  await bridge.listen()
} catch (e) {
  if (e && e.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Another copy of the helper may already be running.`)
  } else {
    console.error(String(e && e.message ? e.message : e))
  }
  process.exit(1)
}

uIOhook.start()

console.log('Gamepad Overlay input helper is running.')
console.log('')
console.log(`  Helper code: ${code}`)
console.log(`  Port:        ${port}`)
console.log('')
console.log('Paste the helper code into the app (Global input helper section).')
console.log('Leave this window open while you play or stream. Press Ctrl+C to stop.')

const stop = () => {
  try {
    uIOhook.stop()
  } catch {
    /* already stopped */
  }
  void bridge.close().then(() => process.exit(0))
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
