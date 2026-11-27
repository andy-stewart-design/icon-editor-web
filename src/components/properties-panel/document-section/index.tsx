import {
  activeBoard,
  deleteArtboard,
  duplicateArtboard,
  renameArtboard,
  resizeArtboard,
  setDocLinecap,
  setDocLinejoin,
  setDocStrokeWidth,
  validateArtboardSize,
  type ResizeMode,
  validateStrokeWidth,
  type Linecap,
  type Linejoin,
} from '../../../core'
import { useEditor, useEditorStore } from '../../../hooks/use-editor'
import NumberField from '../../number-field'
import SegmentedControl from '../../segmented-control'
import s from './styles.module.css'

const CAPS = [
  { value: 'butt', label: 'Butt' },
  { value: 'round', label: 'Round' },
  { value: 'square', label: 'Square' },
] as const satisfies readonly { value: Linecap; label: string }[]

const JOINS = [
  { value: 'miter', label: 'Miter' },
  { value: 'round', label: 'Round' },
  { value: 'bevel', label: 'Bevel' },
] as const satisfies readonly { value: Linejoin; label: string }[]

const RESIZE_MODES = [
  { value: 'keep', label: 'Stay in place' },
  { value: 'scale', label: 'Scale shapes' },
] as const satisfies readonly { value: ResizeMode; label: string }[]

// Document defaults: stroke width, linecap, linejoin, and artboard size. The artboard size commits immediately;
// the "On resize" choice (UI state, not history) decides whether shapes stay in place or scale with it.
export default function DocumentSection() {
  const store = useEditorStore()
  const resizeMode = useEditor((e) => e.ui.artboardResizeMode)
  const strokeWidth = useEditor((e) => e.doc.strokeWidth)
  const linecap = useEditor((e) => e.doc.linecap)
  const linejoin = useEditor((e) => e.doc.linejoin)
  const board = useEditor(activeBoard)
  const canDelete = useEditor((e) => e.doc.boards.length > 1)
  const editing = useEditor((e) => e.tx !== null)

  return (
    <section className={s.section} aria-labelledby="document-section-heading">
      <h2 id="document-section-heading" className={s.heading}>
        Document
      </h2>
      <div className={s.rows}>
        <div role="group" aria-label="Active artboard" className={s.resize}>
          <span>{board.name}</span>
          <div className={s.actions}>
            <button
              type="button"
              disabled={editing}
              onClick={() => {
                const name = window.prompt('Artboard name', board.name)
                if (name !== null) store.dispatch(renameArtboard(name))
              }}
            >
              Rename
            </button>
            <button
              type="button"
              disabled={editing}
              onClick={() => {
                const { doc, activeBoardId } = store.getState()
                store.dispatch(duplicateArtboard(doc, activeBoardId))
              }}
            >
              Duplicate
            </button>
            <button
              type="button"
              disabled={editing || !canDelete}
              onClick={() => store.dispatch(deleteArtboard())}
            >
              Delete
            </button>
          </div>
        </div>
        <NumberField
          id="doc-stroke-width"
          step={0.5}
          label="Stroke width"
          value={strokeWidth}
          validate={validateStrokeWidth}
          onCommit={(n) => store.dispatch(setDocStrokeWidth(n))}
        />
        <SegmentedControl
          label="Linecap"
          options={CAPS}
          value={linecap}
          onChange={(cap) => store.dispatch(setDocLinecap(cap))}
        />
        <SegmentedControl
          label="Linejoin"
          options={JOINS}
          value={linejoin}
          onChange={(join) => store.dispatch(setDocLinejoin(join))}
        />
        <NumberField
          key={board.id}
          id="doc-artboard-size"
          disabled={editing}
          label="Artboard"
          value={board.size}
          validate={validateArtboardSize}
          onCommit={(n) =>
            store.dispatch(resizeArtboard(n, store.getState().ui.artboardResizeMode))
          }
        />
        <div className={s.resize}>
          <span className={s.hint}>On resize (applies to artboard size)</span>
          <SegmentedControl
            label="On resize (applies to artboard size)"
            options={RESIZE_MODES}
            value={resizeMode}
            onChange={(mode) => store.setUi({ artboardResizeMode: mode })}
          />
        </div>
      </div>
    </section>
  )
}
