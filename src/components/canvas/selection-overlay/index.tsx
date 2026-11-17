import { docToScreen, selectionBounds } from '../../../core'
import { useEditor } from '../../../hooks/use-editor'
import s from './styles.module.css'

// Axis-aligned bounds of the selected shapes, drawn in screen pixels so the 1 px border stays constant at any zoom.
// Never serialized. No handles yet (Step 2.5).
export default function SelectionOverlay() {
  const doc = useEditor((e) => e.doc)
  const ids = useEditor((e) => e.selection.shapeIds)
  const vp = useEditor((e) => e.ui.viewport)
  if (ids.length === 0) return null

  const picked = new Set(ids)
  const bounds = selectionBounds(doc.shapes.filter((sh) => picked.has(sh.id)))
  if (!bounds) return null

  const a = docToScreen(vp, { x: bounds.x, y: bounds.y })
  const b = docToScreen(vp, { x: bounds.x + bounds.w, y: bounds.y + bounds.h })
  return (
    <svg className={s.layer} aria-hidden="true">
      <rect className={s.bounds} x={a.x} y={a.y} width={b.x - a.x} height={b.y - a.y} />
    </svg>
  )
}
