import { EXTRA_BUTTON_IDS } from './types'
import type { Binding, ExtraButtonConfig, ExtraButtonId } from './types'

/** Stable string for a binding, e.g. "key:KeyR" or "mouse:3". */
export function bindingKey(b: Binding): string {
  return b.kind === 'key' ? `key:${b.code}` : `mouse:${b.button}`
}

export function bindingsEqual(a: Binding | null, b: Binding | null): boolean {
  if (!a || !b) return false
  return bindingKey(a) === bindingKey(b)
}

/** Remembers which keys / mouse buttons are currently held down. */
export class InputTracker {
  private down = new Set<string>()
  private listeners = new Set<() => void>()

  press(b: Binding): void {
    const k = bindingKey(b)
    if (!this.down.has(k)) {
      this.down.add(k)
      this.emit()
    }
  }

  release(b: Binding): void {
    if (this.down.delete(bindingKey(b))) this.emit()
  }

  clear(): void {
    if (this.down.size > 0) {
      this.down.clear()
      this.emit()
    }
  }

  isDown(b: Binding | null): boolean {
    return b ? this.down.has(bindingKey(b)) : false
  }

  snapshot(): ReadonlySet<string> {
    return new Set(this.down)
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private emit(): void {
    for (const fn of this.listeners) fn()
  }
}

/**
 * Which additional buttons should light up right now.
 * A button lights up only when its OWN binding is held.
 * (If two buttons intentionally share a binding, both light up.)
 */
export function activeExtraButtons(
  buttons: Record<ExtraButtonId, ExtraButtonConfig>,
  down: ReadonlySet<string>,
): Set<ExtraButtonId> {
  const active = new Set<ExtraButtonId>()
  for (const id of EXTRA_BUTTON_IDS) {
    const binding = buttons[id].binding
    if (binding && down.has(bindingKey(binding))) active.add(id)
  }
  return active
}

/**
 * Starts listening to the real keyboard and mouse and feeds the tracker.
 * Returns a function that stops listening.
 */
export function attachInputListeners(
  tracker: InputTracker,
  target: Window = window,
): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code) tracker.press({ kind: 'key', code: e.code })
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code) tracker.release({ kind: 'key', code: e.code })
  }
  const onMouseDown = (e: MouseEvent) => {
    tracker.press({ kind: 'mouse', button: e.button })
  }
  const onMouseUp = (e: MouseEvent) => {
    tracker.release({ kind: 'mouse', button: e.button })
    // Stop the browser's Back/Forward navigation from mouse buttons 4 and 5.
    if (e.button === 3 || e.button === 4) e.preventDefault()
  }
  // If the window loses focus we never get the key-up, so clear everything.
  const reset = () => tracker.clear()
  const onVisibility = () => {
    if (document.hidden) tracker.clear()
  }

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  target.addEventListener('mousedown', onMouseDown)
  target.addEventListener('mouseup', onMouseUp)
  target.addEventListener('blur', reset)
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    target.removeEventListener('keydown', onKeyDown)
    target.removeEventListener('keyup', onKeyUp)
    target.removeEventListener('mousedown', onMouseDown)
    target.removeEventListener('mouseup', onMouseUp)
    target.removeEventListener('blur', reset)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

/**
 * "Press a key or click a mouse button" assignment.
 * Resolves with the binding, or null if the user pressed Escape or cancel() was called.
 */
export function captureBinding(target: Window = window): {
  promise: Promise<Binding | null>
  cancel: () => void
} {
  let finish: (b: Binding | null) => void = () => {}

  const promise = new Promise<Binding | null>((resolve) => {
    const stop = (e: Event) => {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    const cleanup = () => {
      target.removeEventListener('keydown', onKey, true)
      target.removeEventListener('mousedown', onMouse, true)
      target.removeEventListener('contextmenu', stop, true)
    }
    const done = (b: Binding | null) => {
      cleanup()
      resolve(b)
    }
    const onKey = (e: KeyboardEvent) => {
      stop(e)
      if (e.code === 'Escape') return done(null)
      if (!e.code) return
      done({ kind: 'key', code: e.code })
    }
    const onMouse = (e: MouseEvent) => {
      stop(e)
      swallowNextClick(target)
      done({ kind: 'mouse', button: e.button })
    }
    finish = done
    target.addEventListener('keydown', onKey, true)
    target.addEventListener('mousedown', onMouse, true)
    target.addEventListener('contextmenu', stop, true)
  })

  return { promise, cancel: () => finish(null) }
}

/** Prevents the click that follows an assigning mouse press from hitting the page. */
function swallowNextClick(target: Window): void {
  const swallow = (e: Event) => {
    e.preventDefault()
    e.stopImmediatePropagation()
    remove()
  }
  const remove = () => {
    target.removeEventListener('click', swallow, true)
    target.removeEventListener('auxclick', swallow, true)
  }
  target.addEventListener('click', swallow, true)
  target.addEventListener('auxclick', swallow, true)
  setTimeout(remove, 1500)
}