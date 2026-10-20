import { useEffect, useRef, useState } from 'react'
import { hasArt } from './artwork'
import { useArtwork } from './artworkStore'
import { CONTROLLERS, DEFAULT_POSITIONS } from './controllers'
import { sharedWith } from './extras'
import { captureBinding } from './input'
import { BASE_PART_LABELS, defaultGroup, defaultPart, GROUP_LABELS } from './parts'
import { formatBinding } from './profile'
import { useProfiles } from './store'
import {
  BASE_PART_IDS,
  DEFAULT_BORDER_COLOR,
  DEFAULT_FILL_COLOR,
  DEFAULT_PRESSED_COLOR,
  DEFAULT_SHELL_FILL_COLOR,
  DEFAULT_STICK_TRAVEL,
  EXTRA_BUTTON_IDS,
  EXTRA_BUTTON_LABELS,
  GROUP_IDS,
  groupOfPart,
  MAX_DEADZONE,
  MAX_STICK_TRAVEL,
  MIN_STICK_TRAVEL,
  type ArtOwner,
  type ArtSlot,
  type BasePartId,
  type ExtraButtonConfig,
  type ExtraButtonId,
  type GroupId,
  type PartConfig,
  type Profile,
  type SubGroupId,
  type Transform,
} from './types'

type PartKey = GroupId | BasePartId | ExtraButtonId

const isExtra = (k: PartKey): k is ExtraButtonId =>
  (EXTRA_BUTTON_IDS as readonly string[]).includes(k)
const isGroup = (k: PartKey): k is GroupId => (GROUP_IDS as readonly string[]).includes(k)

type Target =
  | { kind: 'group'; id: GroupId }
  | { kind: 'extra'; id: ExtraButtonId }
  | { kind: 'part'; id: BasePartId }

const IDENTITY = { scale: 1, rotation: 0, width: 1, height: 1 }

function labelOf(k: PartKey): string {
  if (isGroup(k)) return GROUP_LABELS[k]
  if (isExtra(k)) return EXTRA_BUTTON_LABELS[k]
  return BASE_PART_LABELS[k]
}

const GROUP_NOUN: Record<SubGroupId, string> = { face: 'face buttons', dpad: 'D-pad buttons' }

const CHECKER = 'repeating-conic-gradient(#8885 0% 25%, transparent 0% 50%) 50% / 12px 12px'

function ArtRow(props: {
  label: string
  refId: string | null
  url: string | undefined
  busy: boolean
  error: string | null
  onPick: (file: File) => void
  onClear: () => void
}) {
  const { label, refId, url, busy, error, onPick, onClear } = props
  return (
    <div style={{ margin: '8px 0' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ width: 130 }}>{label}</span>
        <span
          style={{
            width: 48, height: 48, background: CHECKER, border: '1px solid #6b728080',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {url ? (
            <img src={url} alt={`${label} preview`} style={{ maxWidth: '100%', maxHeight: '100%' }} />
          ) : (
            <small>none</small>
          )}
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={busy}
          aria-label={`Choose ${label}`}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = '' // lets the same file be chosen again later
            if (file) onPick(file)
          }}
        />
        <button onClick={onClear} disabled={!refId || busy}>Remove</button>
        {busy && <small>Adding…</small>}
      </div>
      {error && (
        <small role="alert" style={{ display: 'block', color: '#ff8a8a' }}>{error}</small>
      )}
    </div>
  )
}

export default function AdvancedOptions({ profile }: { profile: Profile }) {
  const updateButton = useProfiles((s) => s.updateButton)
  const updatePart = useProfiles((s) => s.updatePart)
  const updateGroup = useProfiles((s) => s.updateGroup)
  const updateSettings = useProfiles((s) => s.updateSettings)
  const setArtwork = useProfiles((s) => s.setArtwork)
  const clearArtwork = useProfiles((s) => s.clearArtwork)
  const urls = useArtwork((s) => s.urls)

  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<PartKey>('paddle1')
  const [assigning, setAssigning] = useState(false)
  const [busySlot, setBusySlot] = useState<ArtSlot | null>(null)
  const [artError, setArtError] = useState<{ slot: ArtSlot; text: string } | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)

  const settings = profile.settings
  const family = CONTROLLERS[profile.controllerType].family

  const stopAssigning = () => {
    cancelRef.current?.()
    cancelRef.current = null
    setAssigning(false)
  }

  // Stop listening if this panel goes away mid-assignment.
  useEffect(
    () => () => {
      cancelRef.current?.()
    },
    [],
  )

  const startAssigning = () => {
    if (!isExtra(selected)) return
    stopAssigning()
    const buttonId = selected
    const { promise, cancel } = captureBinding()
    cancelRef.current = cancel
    setAssigning(true)
    void promise.then((binding) => {
      if (cancelRef.current !== cancel) return // cancelled or replaced
      cancelRef.current = null
      setAssigning(false)
      if (binding) updateButton(buttonId, { binding })
    })
  }

  const select = (k: PartKey) => {
    stopAssigning()
    setArtError(null)
    setSelected(k)
  }

  // ----- what the sliders edit -----
  const parentGroup: SubGroupId | null =
    !isExtra(selected) && !isGroup(selected) ? groupOfPart(selected) : null
  const grouped = parentGroup ? profile.groups[parentGroup].grouped : false

  const target: Target = isGroup(selected)
    ? { kind: 'group', id: selected }
    : isExtra(selected)
      ? { kind: 'extra', id: selected }
      : grouped && parentGroup
        ? { kind: 'group', id: parentGroup }
        : { kind: 'part', id: selected }

  const current: Transform =
    target.kind === 'group'
      ? profile.groups[target.id]
      : target.kind === 'extra'
        ? profile.buttons[target.id]
        : profile.parts[target.id]

  const setTransform = (patch: Partial<Transform>) => {
    if (target.kind === 'group') updateGroup(target.id, patch)
    else if (target.kind === 'extra') updateButton(target.id, patch)
    else updatePart(target.id, patch)
  }

  const resetTransform = () => {
    if (target.kind === 'group') {
      const d = defaultGroup(family, target.id)
      updateGroup(target.id, { yaw: d.yaw, pitch: d.pitch, ...IDENTITY })
    } else if (target.kind === 'extra') {
      const d = DEFAULT_POSITIONS[target.id]
      updateButton(target.id, { yaw: d.yaw, pitch: d.pitch, ...IDENTITY })
    } else {
      const d = defaultPart(family, target.id)
      updatePart(target.id, { yaw: d.yaw, pitch: d.pitch, ...IDENTITY })
    }
  }

  // Colors and images belong to the selected part itself, never to a group.
  // `own` is null while a group is selected, so every use below is inside a null check.
  const own: PartConfig | ExtraButtonConfig | null = isGroup(selected)
    ? null
    : isExtra(selected)
      ? profile.buttons[selected]
      : profile.parts[selected]

  const owner: ArtOwner | null = isGroup(selected)
    ? null
    : isExtra(selected)
      ? { kind: 'extra', id: selected }
      : { kind: 'part', id: selected }

  const artOn = own !== null && hasArt(own.artwork)

  const setOwnColors = (patch: { borderColor?: string; pressedColor?: string; fillColor?: string }) => {
    if (isGroup(selected)) return
    if (isExtra(selected)) {
      updateButton(selected, patch)
      return
    }
    updatePart(selected, patch)
  }

  const pickImage = async (slot: ArtSlot, file: File) => {
    if (!owner) return
    setBusySlot(slot)
    setArtError(null)
    const error = await setArtwork(owner, slot, file)
    setBusySlot(null)
    if (error) setArtError({ slot, text: error })
  }

  const checkGroup: SubGroupId | null = isGroup(selected)
    ? selected === 'controls'
      ? null
      : selected
    : parentGroup

  const extra: ExtraButtonConfig | null = isExtra(selected) ? profile.buttons[selected] : null
  const shared = isExtra(selected) ? sharedWith(profile.buttons, selected) : []

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    unit: string,
    onChange: (v: number) => void,
  ) => (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0' }}>
      <span style={{ width: 150 }}>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1 }}
      />
      <span style={{ width: 60, textAlign: 'right' }}>{value}{unit}</span>
    </label>
  )

  const isShell = selected === 'shell'

  return (
    <section style={{ border: '1px solid #6b728080', borderRadius: 6, padding: 12, marginBottom: 16 }}>
      <button
        onClick={() => {
          stopAssigning()
          setOpen(!open)
        }}
        aria-expanded={open}
      >
        Advanced Options {open ? '▲' : '▼'}
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          {/* ---------- Colors ---------- */}
          <h3 style={{ fontSize: 16, margin: '0 0 6px' }}>Colors</h3>
          <label>
            <input
              type="checkbox"
              checked={settings.colorsApplyToAll}
              onChange={(e) => updateSettings({ colorsApplyToAll: e.target.checked })}
            />{' '}
            Apply colors to the whole overlay
          </label>
          {settings.colorsApplyToAll ? (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', margin: '8px 0', flexWrap: 'wrap' }}>
              <label>
                Border color{' '}
                <input
                  type="color" value={settings.borderColor}
                  onChange={(e) => updateSettings({ borderColor: e.target.value })}
                />
              </label>
              <label>
                Pressed color{' '}
                <input
                  type="color" value={settings.pressedColor}
                  onChange={(e) => updateSettings({ pressedColor: e.target.value })}
                />
              </label>
              <label>
                Button fill{' '}
                <input
                  type="color" value={settings.fillColor}
                  onChange={(e) => updateSettings({ fillColor: e.target.value })}
                />
              </label>
              <label>
                Shell fill{' '}
                <input
                  type="color" value={settings.shellFillColor}
                  onChange={(e) => updateSettings({ shellFillColor: e.target.value })}
                />
              </label>
              <button
                onClick={() =>
                  updateSettings({
                    borderColor: DEFAULT_BORDER_COLOR,
                    pressedColor: DEFAULT_PRESSED_COLOR,
                    fillColor: DEFAULT_FILL_COLOR,
                    shellFillColor: DEFAULT_SHELL_FILL_COLOR,
                  })
                }
              >
                Reset colors
              </button>
            </div>
          ) : (
            <small style={{ display: 'block', margin: '6px 0' }}>
              Every part uses its own colors. Pick a part below to set them.
            </small>
          )}

          {/* ---------- Sticks ---------- */}
          <h3 style={{ fontSize: 16, margin: '16px 0 6px' }}>Sticks</h3>
          {slider(
            'Deadzone',
            Math.round(settings.deadzone * 100),
            0,
            Math.round(MAX_DEADZONE * 100),
            1,
            '%',
            (v) => updateSettings({ deadzone: v / 100 }),
          )}
          {slider('Stick travel', settings.stickTravel, MIN_STICK_TRAVEL, MAX_STICK_TRAVEL, 1, '', (v) =>
            updateSettings({ stickTravel: v }),
          )}
          <small style={{ display: 'block' }}>
            At 0% every tiny movement shows, including stick drift. Raise Stick travel to make small
            movements easier to see.{' '}
            <button onClick={() => updateSettings({ deadzone: 0.25, stickTravel: DEFAULT_STICK_TRAVEL })}>
              Reset sticks
            </button>
          </small>

          {/* ---------- Additional buttons ---------- */}
          <h3 style={{ fontSize: 16, margin: '16px 0 6px' }}>Additional buttons</h3>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th align="left">Button</th>
                <th>Visible</th>
                <th align="left">Binding</th>
              </tr>
            </thead>
            <tbody>
              {EXTRA_BUTTON_IDS.map((id) => (
                <tr key={id} style={{ background: id === selected ? '#ffd23f22' : undefined }}>
                  <td>
                    <button onClick={() => select(id)} style={{ fontWeight: id === selected ? 700 : 400 }}>
                      {EXTRA_BUTTON_LABELS[id]}
                    </button>
                  </td>
                  <td align="center">
                    <input
                      type="checkbox"
                      aria-label={`${EXTRA_BUTTON_LABELS[id]} visible`}
                      checked={profile.buttons[id].visible}
                      onChange={(e) => updateButton(id, { visible: e.target.checked })}
                    />
                  </td>
                  <td>{formatBinding(profile.buttons[id].binding)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ---------- Selected part ---------- */}
          <h3 style={{ fontSize: 16, margin: '16px 0 6px' }}>Size, shape and position</h3>
          <label>
            Part:{' '}
            <select value={selected} onChange={(e) => select(e.target.value as PartKey)}>
              <optgroup label="Groups">
                {GROUP_IDS.map((id) => (
                  <option key={id} value={id}>{GROUP_LABELS[id]}</option>
                ))}
              </optgroup>
              <optgroup label="Controller">
                {BASE_PART_IDS.map((id) => (
                  <option key={id} value={id}>{BASE_PART_LABELS[id]}</option>
                ))}
              </optgroup>
              <optgroup label="Additional buttons">
                {EXTRA_BUTTON_IDS.map((id) => (
                  <option key={id} value={id}>{EXTRA_BUTTON_LABELS[id]}</option>
                ))}
              </optgroup>
            </select>
          </label>

          {checkGroup && (
            <div style={{ margin: '8px 0' }}>
              <label>
                <input
                  type="checkbox"
                  checked={profile.groups[checkGroup].grouped}
                  onChange={(e) => updateGroup(checkGroup, { grouped: e.target.checked })}
                />{' '}
                Move the {GROUP_NOUN[checkGroup]} together as one group
              </label>
              {target.kind === 'group' && !isGroup(selected) && (
                <small style={{ display: 'block' }}>
                  Editing the whole group. Untick the box above to edit {labelOf(selected)} on its own.
                </small>
              )}
              <small style={{ display: 'block' }}>
                Group edits and single-button edits stack, so regrouping keeps your single-button tweaks.
              </small>
            </div>
          )}

          <div style={{ fontWeight: 600, margin: '6px 0' }}>
            Editing: {target.kind === 'group' ? GROUP_LABELS[target.id] : labelOf(selected)}
          </div>

          {slider('Scale (size)', Math.round(current.scale * 100), 10, 300, 1, '%', (v) =>
            setTransform({ scale: v / 100 }),
          )}
          {slider('Width', Math.round(current.width * 100), 10, 300, 1, '%', (v) =>
            setTransform({ width: v / 100 }),
          )}
          {slider('Height', Math.round(current.height * 100), 10, 300, 1, '%', (v) =>
            setTransform({ height: v / 100 }),
          )}
          {slider('Rotation', Math.round(current.rotation), -180, 180, 1, '°', (v) =>
            setTransform({ rotation: v }),
          )}
          {slider('Yaw (horizontal)', Math.round(current.yaw * 1000) / 10, 0, 100, 0.5, '%', (v) =>
            setTransform({ yaw: v / 100 }),
          )}
          {slider('Pitch (vertical)', Math.round(current.pitch * 1000) / 10, 0, 100, 0.5, '%', (v) =>
            setTransform({ pitch: v / 100 }),
          )}
          <button onClick={resetTransform}>Reset position, size and rotation</button>

          {/* ---------- Images ---------- */}
          <h3 style={{ fontSize: 16, margin: '16px 0 6px' }}>Images</h3>
          {owner && own ? (
            <>
              <small style={{ display: 'block' }}>
                Images for <b>{labelOf(selected)}</b> (PNG, JPEG, WebP or GIF, up to 5 MB). They follow
                this part's size, rotation and position, including any group it is in.
              </small>
              <ArtRow
                label={isShell ? 'Image' : 'Not pressed image'}
                refId={own.artwork.normal}
                url={own.artwork.normal ? urls[own.artwork.normal] : undefined}
                busy={busySlot === 'normal'}
                error={artError?.slot === 'normal' ? artError.text : null}
                onPick={(f) => void pickImage('normal', f)}
                onClear={() => clearArtwork(owner, 'normal')}
              />
              {!isShell && (
                <ArtRow
                  label="Pressed image"
                  refId={own.artwork.pressed}
                  url={own.artwork.pressed ? urls[own.artwork.pressed] : undefined}
                  busy={busySlot === 'pressed'}
                  error={artError?.slot === 'pressed' ? artError.text : null}
                  onPick={(f) => void pickImage('pressed', f)}
                  onClear={() => clearArtwork(owner, 'pressed')}
                />
              )}
              {!isShell && (
                <small style={{ display: 'block' }}>
                  With only a "Not pressed" image, pressing tints it with the pressed color. With only a
                  "Pressed" image, nothing shows until it is pressed.
                </small>
              )}
            </>
          ) : (
            <small style={{ display: 'block' }}>
              Pick an individual part (not a group) to add images to it.
            </small>
          )}

          {/* ---------- This part's own colors ---------- */}
          {own && artOn && (
            <small style={{ display: 'block', marginTop: 8 }}>
              This part is showing your image, so its shape, border and fill are not drawn. The pressed
              color is only used to tint the image when there is no pressed image.
            </small>
          )}
          {own && !settings.colorsApplyToAll && (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', margin: '12px 0', flexWrap: 'wrap' }}>
              <label>
                Border color{' '}
                <input
                  type="color" value={own.borderColor} disabled={artOn}
                  onChange={(e) => setOwnColors({ borderColor: e.target.value })}
                />
              </label>
              <label>
                Pressed color{' '}
                <input
                  type="color" value={own.pressedColor}
                  onChange={(e) => setOwnColors({ pressedColor: e.target.value })}
                />
              </label>
              <label>
                Fill color{' '}
                <input
                  type="color" value={own.fillColor} disabled={artOn}
                  onChange={(e) => setOwnColors({ fillColor: e.target.value })}
                />
              </label>
              <button
                onClick={() =>
                  setOwnColors({
                    borderColor: DEFAULT_BORDER_COLOR,
                    pressedColor: DEFAULT_PRESSED_COLOR,
                    fillColor: isShell ? DEFAULT_SHELL_FILL_COLOR : DEFAULT_FILL_COLOR,
                  })
                }
              >
                Reset colors
              </button>
            </div>
          )}
          {own && settings.colorsApplyToAll && !artOn && (
            <small style={{ display: 'block', marginTop: 8 }}>
              This part is using the overlay colors. Untick "Apply colors to the whole overlay" to give it its own.
            </small>
          )}

          {/* ---------- Binding (additional buttons only) ---------- */}
          {extra && (
            <div style={{ marginTop: 12 }}>
              <div style={{ margin: '6px 0' }}>
                Binding for {labelOf(selected)}:{' '}
                <strong>{assigning ? 'Press a key or click a mouse button…' : formatBinding(extra.binding)}</strong>{' '}
                <button onClick={startAssigning}>{extra.binding ? 'Change' : 'Assign'}</button>{' '}
                <button
                  onClick={() => {
                    stopAssigning()
                    if (isExtra(selected)) updateButton(selected, { binding: null })
                  }}
                  disabled={!extra.binding}
                >
                  Clear
                </button>
              </div>
              {assigning && (
                <small style={{ display: 'block' }}>
                  Press <b>Esc</b> to cancel. Any key or mouse button is accepted, including the mouse's
                  back and forward buttons. Browser shortcuts such as Ctrl+W can't be captured.
                </small>
              )}
              {shared.length > 0 && (
                <small style={{ display: 'block' }}>
                  Also used by: {shared.map((id) => EXTRA_BUTTON_LABELS[id]).join(', ')} (they will light together).
                </small>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}