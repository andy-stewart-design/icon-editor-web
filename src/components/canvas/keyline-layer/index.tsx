import { docToScreen, guidesFor, type Guide, type Viewport } from '../../../core'
import { useEditor } from '../../../hooks/use-editor'
import s from './styles.module.css'

// Guides are drawn in screen pixels from doc coordinates, so their 1 px strokes stay constant at any zoom.
function GuideShape({ guide, vp }: { guide: Guide; vp: Viewport }) {
  const o = docToScreen(vp, { x: 0, y: 0 })
  const className = s[guide.name]
  if (guide.kind === 'circle') {
    const c = docToScreen(vp, { x: guide.cx, y: guide.cy })
    return <circle className={className} cx={c.x} cy={c.y} r={guide.r * vp.zoom} />
  }
  const { x, y, w, h } = guide.rect
  return (
    <rect
      className={className}
      x={o.x + x * vp.zoom}
      y={o.y + y * vp.zoom}
      width={w * vp.zoom}
      height={h * vp.zoom}
    />
  )
}

// Keyline overlay: sits above the grid and below the content, and is never serialized.
export default function KeylineLayer() {
  const show = useEditor((e) => e.ui.showKeylines)
  const size = useEditor((e) => e.doc.size)
  const vp = useEditor((e) => e.ui.viewport)
  if (!show) return null

  return (
    <svg className={s.layer} aria-hidden="true">
      {guidesFor(size).map((guide) => (
        <GuideShape key={guide.name} guide={guide} vp={vp} />
      ))}
    </svg>
  )
}
