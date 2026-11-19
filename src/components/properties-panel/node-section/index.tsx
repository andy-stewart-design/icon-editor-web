import { useMemo } from 'react'
import {
  nodePanelState,
  setNodePosition,
  setSelectedNodesMode,
  validateBoundsCoord,
  type NodePanelMode,
} from '../../../core'
import { useEditor, useEditorStore } from '../../../hooks/use-editor'
import NumberField from '../../number-field'
import SegmentedControl from '../../segmented-control'
import s from './styles.module.css'

const MODES = [
  { value: 'straight', label: 'Straight' },
  { value: 'free', label: 'Free' },
  { value: 'smooth', label: 'Smooth' },
  { value: 'symmetric', label: 'Symmetric' },
] as const satisfies readonly { value: NodePanelMode; label: string }[]

// Shown with the Node tool when nodes are selected. X and Y set the selected nodes' anchors (an axis shows Mixed when
// the nodes differ). The mode control sets the mode of every selected node.
export default function NodeSection() {
  const store = useEditorStore()
  const active = useEditor((e) => e.ui.activeTool === 'node')
  const doc = useEditor((e) => e.doc)
  const selection = useEditor((e) => e.selection)

  const state = useMemo(() => (active ? nodePanelState(doc, selection) : null), [active, doc, selection])
  if (!state) return null

  const countLabel = state.count === 1 ? '1 node' : `${state.count} nodes`
  const mode = state.mode === 'mixed' ? undefined : state.mode

  return (
    <section className={s.section} aria-labelledby="node-section-heading">
      <h2 id="node-section-heading" className={s.heading}>
        Node
      </h2>
      <div className={s.rows}>
        <div className={s.count}>{countLabel}</div>
        <div className={s.pair}>
          <NumberField
            id="node-x"
            label="X"
            value={state.x}
            validate={validateBoundsCoord}
            onCommit={(n) => store.dispatch(setNodePosition(store.getState().selection, { x: n }))}
          />
          <NumberField
            id="node-y"
            label="Y"
            value={state.y}
            validate={validateBoundsCoord}
            onCommit={(n) => store.dispatch(setNodePosition(store.getState().selection, { y: n }))}
          />
        </div>
        <div className={s.modeRow}>
          <span className={s.label}>Mode</span>
          <SegmentedControl<NodePanelMode>
            label="Node mode"
            options={MODES}
            value={mode}
            mixed={state.mode === 'mixed'}
            onChange={(m) => store.dispatch(setSelectedNodesMode(store.getState().selection, m))}
          />
        </div>
      </div>
    </section>
  )
}
