import { useMemo } from 'react'
import { docToScreen, selectionOutline, type BoardContent } from '../../../core'
import { useEditor, useBoardViewport } from '../../../hooks/use-editor'
import s from './styles.module.css'

// Thin neutral outline along every segment of the selected shapes, so a selection reads in Select mode too. The Node tool
// shows the same outline, with its anchors and handles on top. Drawn below the Select tool's bounds and handles and
// never takes pointer events, so hit testing and drag behavior are unchanged. Never serialized.
export default function SelectionOutline({ doc }: { doc: BoardContent }) {
  const showOutline = useEditor((e) => e.ui.activeTool === 'select' || e.ui.mode === 'node')
  const selection = useEditor((e) => e.selection)
  const vp = useBoardViewport()
  const shown = showOutline && selection.shapeIds.length > 0
  const prims = useMemo(
    () => (shown ? selectionOutline(doc, selection) : []),
    [shown, doc, selection],
  )
  if (prims.length === 0) return null

  return (
    <svg className={s.layer} aria-hidden="true">
      {prims.map((p, i) => {
        if (p.kind !== 'segmentOutline') return null
        const a = docToScreen(vp, p.from)
        const c1 = docToScreen(vp, p.c1)
        const c2 = docToScreen(vp, p.c2)
        const b = docToScreen(vp, p.to)
        return (
          <path
            key={i}
            className={s.segmentOutline}
            d={`M${a.x} ${a.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`}
          />
        )
      })}
    </svg>
  )
}
