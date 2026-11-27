import { useMemo, type ReactNode } from 'react'
import {
  resetLinecap,
  resetLinejoin,
  resetStrokeWidth,
  selectionField,
  selectionHasOverride,
  selectionRect,
  setLinecapOverride,
  setLinejoinOverride,
  setSelectionBounds,
  setStrokeWidthOverride,
  validateBoundsCoord,
  validateBoundsSize,
  validateStrokeWidth,
  type FieldState,
  type Linecap,
  type Linejoin,
  type Rect,
  type StyleField,
} from '../../../core'
import { useEditor, useEditorStore, useActiveContent } from '../../../hooks/use-editor'
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

// Shown only when something is selected. Bounds edits go through setSelectionBounds. Style fields are per-shape
// overrides applied to every selected shape; "Inherited" means the value comes from the document default.
export default function ShapeSection() {
  const store = useEditorStore()
  const doc = useActiveContent()
  const selection = useEditor((e) => e.selection)

  const rect = useMemo(() => selectionRect(doc, selection), [doc, selection])
  const stroke = useMemo(() => selectionField(doc, selection, 'strokeWidth'), [doc, selection])
  const cap = useMemo(() => selectionField(doc, selection, 'linecap'), [doc, selection])
  const join = useMemo(() => selectionField(doc, selection, 'linejoin'), [doc, selection])
  const hasOverride = (field: StyleField) => selectionHasOverride(doc, selection, field)

  // Keeps the other three values; the command's sizes are ignored for axes of zero extent.
  const setBounds = (patch: Partial<Rect>) => {
    if (!rect) return
    const next = { ...rect, ...patch }
    store.dispatch(setSelectionBounds(store.getState().selection, next.x, next.y, next.w, next.h))
  }

  return (
    <section className={s.section} aria-labelledby="shape-section-heading">
      <h2 id="shape-section-heading" className={s.heading}>
        Shape
      </h2>
      <div className={s.rows}>
        <div className={s.pair}>
          <NumberField
            id="shape-x"
            label="X"
            value={rect?.x}
            validate={validateBoundsCoord}
            disabled={!rect}
            onCommit={(n) => setBounds({ x: n })}
          />
          <NumberField
            id="shape-y"
            label="Y"
            value={rect?.y}
            validate={validateBoundsCoord}
            disabled={!rect}
            onCommit={(n) => setBounds({ y: n })}
          />
          <NumberField
            id="shape-w"
            label="W"
            value={rect?.w}
            validate={validateBoundsSize}
            disabled={!rect}
            onCommit={(n) => setBounds({ w: n })}
          />
          <NumberField
            id="shape-h"
            label="H"
            value={rect?.h}
            validate={validateBoundsSize}
            disabled={!rect}
            onCommit={(n) => setBounds({ h: n })}
          />
        </div>

        <StrokeRow
          state={stroke}
          overridden={hasOverride('strokeWidth')}
          onCommit={(n) => store.dispatch(setStrokeWidthOverride(store.getState().selection, n))}
          onReset={() => store.dispatch(resetStrokeWidth(store.getState().selection))}
        />

        <StyleRow
          label="Linecap"
          state={cap}
          overridden={hasOverride('linecap')}
          onReset={() => store.dispatch(resetLinecap(store.getState().selection))}
        >
          <SegmentedControl<Linecap>
            label="Shape linecap"
            options={CAPS}
            value={cap.kind === 'same' ? cap.value : undefined}
            mixed={cap.kind === 'mixed'}
            disabled={cap.kind === 'none'}
            onChange={(v) => store.dispatch(setLinecapOverride(store.getState().selection, v))}
          />
        </StyleRow>

        <StyleRow
          label="Linejoin"
          state={join}
          overridden={hasOverride('linejoin')}
          onReset={() => store.dispatch(resetLinejoin(store.getState().selection))}
        >
          <SegmentedControl<Linejoin>
            label="Shape linejoin"
            options={JOINS}
            value={join.kind === 'same' ? join.value : undefined}
            mixed={join.kind === 'mixed'}
            disabled={join.kind === 'none'}
            onChange={(v) => store.dispatch(setLinejoinOverride(store.getState().selection, v))}
          />
        </StyleRow>
      </div>
    </section>
  )
}

interface StyleRowProps<V> {
  label: string
  state: FieldState<V>
  overridden: boolean
  onReset: () => void
  children: ReactNode
}

// Label, control and a status line with Reset. The status shows Inherited or Override, or Mixed.
function StyleRow<V>({ label, state, overridden, onReset, children }: StyleRowProps<V>) {
  return (
    <div className={s.styleRow}>
      <div className={s.styleHead}>
        <span>{label}</span>
        <span className={s.status}>{statusText(state, overridden)}</span>
        <button type="button" className={s.reset} disabled={!overridden} onClick={onReset}>
          Reset
        </button>
      </div>
      {children}
    </div>
  )
}

function statusText<V>(state: FieldState<V>, overridden: boolean): string {
  if (state.kind === 'none') return ''
  if (state.kind === 'mixed') return 'Mixed'
  return overridden ? 'Override' : 'Inherited'
}

function StrokeRow({
  state,
  overridden,
  onCommit,
  onReset,
}: {
  state: FieldState<number>
  overridden: boolean
  onCommit: (n: number) => void
  onReset: () => void
}) {
  return (
    <div className={s.styleRow}>
      <div className={s.styleHead}>
        <span className={s.grow}>Stroke width</span>
        <span className={s.status}>{statusText(state, overridden)}</span>
        <button type="button" className={s.reset} disabled={!overridden} onClick={onReset}>
          Reset
        </button>
      </div>
      <NumberField
        id="shape-stroke-width"
        step={0.5}
        label="Value"
        value={state.kind === 'same' ? state.value : state.kind === 'mixed' ? 'mixed' : undefined}
        validate={validateStrokeWidth}
        disabled={state.kind === 'none'}
        onCommit={onCommit}
      />
    </div>
  )
}
