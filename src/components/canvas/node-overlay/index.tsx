import { useMemo } from 'react'
import { docToScreen, nodeOverlay } from '../../../core'
import { useEditor } from '../../../hooks/use-editor'
import s from './styles.module.css'

const ANCHOR_HALF = 3 // half the side of an anchor square, screen px
const HANDLE_DOT_RADIUS = 3 // screen px

// Static node display for the Node tool: every anchor of the selected shapes (selected ones filled) and the handles of
// the selected nodes. The segment outlines come from SelectionOutline, which is drawn below this layer. Drawn in screen
// pixels at constant size, from the live doc each render. Only shown for the Node tool. Never serialized; the tool
// overlay draws hover feedback on top.
export default function NodeOverlay() {
  const active = useEditor((e) => e.ui.activeTool === 'node')
  const doc = useEditor((e) => e.doc)
  const selection = useEditor((e) => e.selection)
  const vp = useEditor((e) => e.ui.viewport)
  const prims = useMemo(() => (active ? nodeOverlay(doc, selection) : []), [active, doc, selection])
  if (!active || prims.length === 0) return null

  return (
    <svg className={s.layer} aria-hidden="true">
      {prims.map((p, i) => {
        if (p.kind === 'anchor') {
          const c = docToScreen(vp, p.p)
          return (
            <rect
              key={i}
              className={p.selected ? s.anchorSelected : s.anchor}
              x={c.x - ANCHOR_HALF}
              y={c.y - ANCHOR_HALF}
              width={ANCHOR_HALF * 2}
              height={ANCHOR_HALF * 2}
            />
          )
        }
        if (p.kind === 'handle') {
          const from = docToScreen(vp, p.from)
          const to = docToScreen(vp, p.to)
          return (
            <g key={i}>
              <line className={s.handleLine} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
              <circle className={s.handleDot} cx={to.x} cy={to.y} r={HANDLE_DOT_RADIUS} />
            </g>
          )
        }
        return null // segment outlines are drawn by SelectionOutline
      })}
    </svg>
  )
}
