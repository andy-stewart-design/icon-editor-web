import { useLayoutEffect, useRef } from 'react'
import { docToScreen, presentationAttributes, serializeBody, type IconDoc } from '../../../core'
import { useEditor } from '../../../hooks/use-editor'
import s from './styles.module.css'

export default function ContentLayer({ doc }: { doc: IconDoc }) {
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

  const origin = docToScreen(vp, { x: 0, y: 0 })
  const px = doc.size * vp.zoom

  return (
    <svg
      ref={ref}
      className={s.content}
      viewBox={`0 0 ${doc.size} ${doc.size}`}
      style={{ left: origin.x, top: origin.y, width: px, height: px }}
    />
  )
}
