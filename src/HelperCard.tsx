import { useState } from 'react'
import {
  DEFAULT_HELPER_PORT,
  parseHelperConfig,
  readStoredHelperText,
  storeHelperText,
  watchedInputs,
} from './helperClient'
import type { Profile } from './types'
import { inputTracker } from './useInput'
import { useHelper } from './useHelper'

export default function HelperCard({ profile }: { profile: Profile }) {
  const [text, setText] = useState(readStoredHelperText)
  const config = parseHelperConfig(text.code, text.port)
  const watch = watchedInputs(profile.buttons)
  const status = useHelper(config, watch, inputTracker)

  const change = (next: { code: string; port: string }) => {
    setText(next)
    storeHelperText(next.code, next.port)
  }

  let message: string
  if (!config) message = text.code.trim() === '' ? 'Paste the helper code to connect.' : 'That does not look like a helper code.'
  else if (watch.length === 0) message = 'Assign a key or mouse button to a visible extra button first.'
  else if (status === 'connected') message = 'Connected. Extra buttons now light from any window.'
  else if (status === 'rejected') message = 'The helper refused the code. Copy it again from the helper window.'
  else message = 'Waiting for the helper. Is start-helper.bat running?'

  return (
    <section className="card">
      <h3>Global input helper</h3>
      <small style={{ display: 'block', marginBottom: 10 }}>
        OBS only receives keys and clicks aimed at itself, so paddles, claws and other extra buttons
        need this small helper running on your PC to light up while you play.
      </small>
      <ol className="steps">
        <li>One time: open the <code>helper</code> folder and double-click <b>install.bat</b>.</li>
        <li>Double-click <b>start-helper.bat</b> and leave it open while you play or stream. It shows a helper code.</li>
        <li>Paste the code below. The status should turn to Connected.</li>
        <li>Download the overlay file again so it carries the code into OBS.</li>
      </ol>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <label className="field" style={{ flex: '1 1 260px', margin: 0 }}>
          Helper code
          <input
            value={text.code}
            spellCheck={false}
            onChange={(e) => change({ ...text, code: e.target.value })}
            placeholder="24 letters and numbers"
          />
        </label>
        <label className="field" style={{ width: 110, margin: 0 }}>
          Port
          <input
            value={text.port}
            inputMode="numeric"
            onChange={(e) => change({ ...text, port: e.target.value })}
            placeholder={String(DEFAULT_HELPER_PORT)}
          />
        </label>
      </div>
      <p role="status" style={{ marginBottom: 0 }}>
        <span className={status === 'connected' ? 'dot on' : 'dot'} style={{ marginLeft: 0, marginRight: 8 }} />
        {message}
      </p>
      <small style={{ display: 'block', marginTop: 8 }}>
        The helper reports only the keys and buttons you assigned to extra buttons, only to this PC, and
        only to something that has your code. If a game runs as administrator, start the helper as
        administrator too.
      </small>
    </section>
  )
}
