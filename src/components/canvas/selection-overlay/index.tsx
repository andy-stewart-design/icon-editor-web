import {
  docToScreen,
  handlePoints,
  HANDLE_SIZE_PX,
  rotateHandlePoint,
  selectionBounds,
} from '../../../core'
import { useEditor } from '../../../hooks/use-editor'
import s from './styles.module.css'

// Bounds of the selected shapes with eight resize handles and a rotate handle, drawn in screen pixels so everything
// keeps a constant size at any zoom. Never serialized. Dragging is handled by the select tool, not here.
export default function SelectionOverlay() {
  const doc = useEditor((e) => e.doc)
  const ids = useEditor((e) => e.selection.shapeIds)
  const vp = useEditor((e) => e.ui.viewport)
  const showHandles = useEditor((e) => e.ui.activeTool === 'select')
  if (ids.length === 0) return null

  const picked = new Set(ids)
  const bounds = selectionBounds(doc.shapes.filter((sh) => picked.has(sh.id)))
  if (!bounds) return null

  const a = docToScreen(vp, { x: bounds.x, y: bounds.y })
  const b = docToScreen(vp, { x: bounds.x + bounds.w, y: bounds.y + bounds.h })
  const top = docToScreen(vp, { x: bounds.x + bounds.w / 2, y: bounds.y })
  const rot = docToScreen(vp, rotateHandlePoint(bounds, vp.zoom))
  const half = HANDLE_SIZE_PX / 2
  return (
    <svg className={s.layer} aria-hidden="true">
      <rect className={s.bounds} x={a.x} y={a.y} width={b.x - a.x} height={b.y - a.y} />
      {showHandles && (
        <>
          <line className={s.stem} x1={top.x} y1={top.y} x2={rot.x} y2={rot.y} />
          <circle className={s.handle} cx={rot.x} cy={rot.y} r={half} />
          {handlePoints(bounds).map(({ id, p }) => {
            const c = docToScreen(vp, p)
            return (
              <rect key={id} className={s.handle} x={c.x - half} y={c.y - half} width={HANDLE_SIZE_PX} height={HANDLE_SIZE_PX} />
            )
          })}
        </>
      )}
    </svg>
  )
}
