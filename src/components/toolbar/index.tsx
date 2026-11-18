import { useState } from 'react'
import {
  actualSizeViewport,
  createDefaultDoc,
  fitViewport,
  type ActiveTool,
  type EditorStore,
  type SnapIncrement,
} from '../../core'
import { useEditor, useEditorStore } from '../../hooks/use-editor'
import CopySvgButton from '../copy-svg-button'
import s from './styles.module.css'

const SNAP_INCREMENTS: readonly SnapIncrement[] = [1, 0.5, 0.25]

const DRAW_TOOLS: readonly { tool: ActiveTool; label: string; key: string }[] = [
  { tool: 'select', label: 'Select', key: 'V' },
  { tool: 'line', label: 'Line', key: 'L' },
  { tool: 'rect', label: 'Rect', key: 'R' },
  { tool: 'ellipse', label: 'Ellipse', key: 'E' },
]

// The text is kept as typed, so a half-entered value such as "" or "1." is not overwritten. Each valid
// number goes to the store, clamped to 0 or more. Blur shows the stored value again.
function RadiusInput({ store }: { store: EditorStore }) {
  const [text, setText] = useState(() => String(store.getState().ui.rectRadius))
  return (
    <label className={s.field}>
      Corner radius
      <input
        type="number"
        className={s.input}
        min={0}
        step={0.5}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number.parseFloat(e.target.value)
          if (Number.isFinite(n)) store.setUi({ rectRadius: Math.max(0, n) })
        }}
        onBlur={() => setText(String(store.getState().ui.rectRadius))}
      />
    </label>
  )
}

export default function Toolbar() {
  const store = useEditorStore()
  const showGrid = useEditor((e) => e.ui.showGrid)
  const showSubgrid = useEditor((e) => e.ui.showSubgrid)
  const showKeylines = useEditor((e) => e.ui.showKeylines)
  const snapEnabled = useEditor((e) => e.ui.snapEnabled)
  const snapIncrement = useEditor((e) => e.ui.snapIncrement)
  const zoom = useEditor((e) => e.ui.viewport.zoom)
  const activeTool = useEditor((e) => e.ui.activeTool)

  const fit = () => {
    const { doc, ui } = store.getState()
    store.setUi({ viewport: fitViewport(ui.canvasSize, doc.size, doc.size) })
  }

  const actualSize = () => {
    const { doc, ui } = store.getState()
    store.setUi({ viewport: actualSizeViewport(ui.canvasSize, doc.size, doc.size) })
  }

  // Autosave persists the replacement through subscribeCommitted; the viewport already fits the same artboard size.
  const newDocument = () => {
    if (!window.confirm('Start a new document? The current one will be replaced.')) return
    store.replaceDocument(createDefaultDoc())
  }

  return (
    <div className={s.toolbar}>
      <div className={s.group}>
        <button type="button" className={s.button} onClick={newDocument}>
          New
        </button>
        <button
          type="button"
          className={s.button}
          aria-pressed={showGrid}
          onClick={() => store.setUi({ showGrid: !store.getState().ui.showGrid })}
        >
          Grid
        </button>
        <button
          type="button"
          className={s.button}
          aria-pressed={showSubgrid}
          onClick={() => store.setUi({ showSubgrid: !store.getState().ui.showSubgrid })}
        >
          Subgrid
        </button>
      </div>
      <div className={s.group} role="group" aria-label="Drawing tool">
        {DRAW_TOOLS.map(({ tool, label, key }) => (
          <button
            key={tool}
            type="button"
            className={s.button}
            aria-pressed={activeTool === tool}
            title={`${label} (${key})`}
            onClick={() => store.setUi({ activeTool: tool })}
          >
            {label}
          </button>
        ))}
        {activeTool === 'rect' && <RadiusInput store={store} />}
      </div>
      <div className={s.group}>
        <button
          type="button"
          className={s.button}
          aria-pressed={showKeylines}
          onClick={() => store.setUi({ showKeylines: !store.getState().ui.showKeylines })}
        >
          Keylines
        </button>
        <button
          type="button"
          className={s.button}
          aria-pressed={snapEnabled}
          title="Toggle snapping (`)"
          onClick={() => store.setUi({ snapEnabled: !store.getState().ui.snapEnabled })}
        >
          Snap
        </button>
        <div className={s.group} role="group" aria-label="Snap increment">
          {SNAP_INCREMENTS.map((increment) => (
            <button
              key={increment}
              type="button"
              className={s.button}
              aria-pressed={snapIncrement === increment}
              onClick={() => store.setUi({ snapIncrement: increment })}
            >
              {String(increment)}
            </button>
          ))}
        </div>
      </div>
      <div className={s.group}>
        <CopySvgButton />
        <button type="button" className={s.button} onClick={fit}>
          Fit
        </button>
        <button type="button" className={s.button} onClick={actualSize}>
          100%
        </button>
        <span className={s.zoom}>{`${Math.round(zoom * 100)}%`}</span>
      </div>
    </div>
  )
}
