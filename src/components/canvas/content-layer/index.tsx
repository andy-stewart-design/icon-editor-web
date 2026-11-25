import { useLayoutEffect, useRef } from 'react'
import { docToScreen, rootAttributes, serializeBody, type IconDoc } from '../../../core'
import { useEditor } from '../../../hooks/use-editor'
import s from './styles.module.css'

// These come from the layer's own geometry (viewBox, size) rather than the serializer's root attributes.
const OWN_ATTRIBUTES = new Set(['xmlns', 'width', 'height', 'viewBox'])

export default function ContentLayer({ doc }: { doc: IconDoc }) {
  const vp = useEditor((e) => e.ui.viewport)
  const ref = useRef<SVGSVGElement>(null)

  // Same markup as serializeDoc: root attributes on the element, path elements as its children.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    for (const [name, value] of rootAttributes(doc)) {
      if (!OWN_ATTRIBUTES.has(name)) el.setAttribute(name, value)
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
