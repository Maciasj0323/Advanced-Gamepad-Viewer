import { parseOverlayParams } from './overlayMode'
import OverlayView from './OverlayView'
import Studio from './Studio'

/** ?overlay in the address shows only the overlay (for OBS); otherwise the full app. */
export default function App() {
  return parseOverlayParams(window.location.search).overlay ? <OverlayView /> : <Studio />
}
