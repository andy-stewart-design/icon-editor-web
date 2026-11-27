import { useLayoutEffect, useRef } from 'react'
import {
  docToScreen,
  presentationAttributes,
  serializeBody,
  type BoardContent,
  type Pt,
} from '../../../core'
import { useEditor } from '../../../hooks/use-editor'
import s from './styles.module.css'

export default function ContentLayer({ doc, origin }: { doc: BoardContent; origin: Pt }) {
  const vp = useEditor((e) => e.ui.viewport)
  const ref = useRef<SVGSVGElement>(null)

  // Share paint and paths with export; the editor owns layout and overflow.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    for (const [name, value] of presentationAttributes(doc)) {
      el.setAttribute(name, value)
    }
    el.innerHTML = serializeBody(doc)
  }, [doc])

  const screen = docToScreen(vp, origin)
  const px = doc.size * vp.zoom

  return (
    <svg
      ref={ref}
      className={s.content}
      viewBox={`0 0 ${doc.size} ${doc.size}`}
      style={{ left: screen.x, top: screen.y, width: px, height: px }}
    />
  )
}
