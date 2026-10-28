import { bindingKey } from './input'
import { EXTRA_BUTTON_IDS, type Binding, type ExtraButtonConfig, type ExtraButtonId } from './types'

export const DEFAULT_HELPER_PORT = 8765

export interface HelperConfig {
  code: string
  port: number
}

/** Checks a helper code (and optional port). Returns null if either is not usable. */
export function parseHelperConfig(code: unknown, port?: unknown): HelperConfig | null {
  if (typeof code !== 'string' || !/^[0-9a-f]{16,64}$/i.test(code.trim())) return null
  let p = DEFAULT_HELPER_PORT
  if (typeof port === 'number') p = port
  else if (typeof port === 'string' && port.trim() !== '') p = Number(port)
  if (!Number.isInteger(p) || p < 1024 || p > 65535) return null
  return { code: code.trim().toLowerCase(), port: p }
}

/** The inputs the helper should report: every visible extra button's keyboard/mouse binding. */
export function watchedInputs(buttons: Record<ExtraButtonId, ExtraButtonConfig>): string[] {
  const found = new Set<string>()
  for (const id of EXTRA_BUTTON_IDS) {
    const b = buttons[id]
    if (b.visible && b.binding) found.add(bindingKey(b.binding))
  }
  return [...found].sort()
}

export function helperUrl(config: HelperConfig, watch: readonly string[]): string {
  return (
    `http://127.0.0.1:${config.port}/events?code=${encodeURIComponent(config.code)}` +
    `&watch=${encodeURIComponent(watch.join(','))}`
  )
}

/** Extra query text that carries the helper settings inside an overlay address. */
export function helperQuery(helper: HelperConfig | null | undefined): string {
  if (!helper) return ''
  const port = helper.port === DEFAULT_HELPER_PORT ? '' : `&hport=${helper.port}`
  return `&helper=${helper.code}${port}`
}

/** Reads one message from the helper: an input going down or up. */
export function parseHelperMessage(text: string): { down: boolean; binding: Binding } | null {
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof v !== 'object' || v === null) return null
  const { d, b } = v as { d?: unknown; b?: unknown }
  if ((d !== 0 && d !== 1) || typeof b !== 'string') return null
  const key = /^key:([A-Za-z0-9_]{1,30})$/.exec(b)
  if (key) return { down: d === 1, binding: { kind: 'key', code: key[1] } }
  const mouse = /^mouse:(\d{1,2})$/.exec(b)
  if (mouse) return { down: d === 1, binding: { kind: 'mouse', button: Number(mouse[1]) } }
  return null
}

// The app remembers the helper code in this browser so it can be baked into overlay files.
const CODE_KEY = 'helperCode'
const PORT_KEY = 'helperPort'

export function readStoredHelper(): HelperConfig | null {
  try {
    return parseHelperConfig(localStorage.getItem(CODE_KEY) ?? '', localStorage.getItem(PORT_KEY) ?? '')
  } catch {
    return null
  }
}

export function readStoredHelperText(): { code: string; port: string } {
  try {
    return {
      code: localStorage.getItem(CODE_KEY) ?? '',
      port: localStorage.getItem(PORT_KEY) || String(DEFAULT_HELPER_PORT),
    }
  } catch {
    return { code: '', port: String(DEFAULT_HELPER_PORT) }
  }
}

export function storeHelperText(code: string, port: string): void {
  try {
    localStorage.setItem(CODE_KEY, code.trim())
    localStorage.setItem(PORT_KEY, port.trim())
  } catch {
    /* storage unavailable: the code just won't be remembered */
  }
}
