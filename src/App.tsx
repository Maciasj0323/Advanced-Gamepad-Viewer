import { parseOverlayParams, readEmbeddedOverlay } from './overlayMode'
import OverlayView from './OverlayView'
import Studio from './Studio'

// Decide this before the first paint so no page styling can flash or leak into OBS.
// An overlay file (made by "Download overlay file") carries its data inside itself.
const embedded = readEmbeddedOverlay()
const overlayParams = parseOverlayParams(window.location.search)
const overlayMode = overlayParams.overlay || embedded !== null
const overlayBackground = embedded?.background ?? overlayParams.background
if (overlayMode) {
  document.documentElement.setAttribute('data-overlay', '1')
  if (overlayBackground) {
    document.documentElement.style.setProperty('--overlay-bg', overlayBackground)
  }
}

/** The OBS view when ?overlay or an overlay file is used; otherwise the full app. */
export default function App() {
  return overlayMode ? <OverlayView /> : <Studio />
}
