import { docToScreen, shapeAttributes, type IconDoc, type OverlayPrimitive, type PathShape } from '../../../core'
import { useEditor } from '../../../hooks/use-editor'
import s from './styles.module.css'

const SNAP_RING_RADIUS = 4 // screen px

// Draft markup matches the content layer: the document's stroke width, caps and joins apply unless the shape overrides them.
function DraftPath({ shape, doc }: { shape: PathShape; doc: IconDoc }) {
  const d = shapeAttributes(shape).find(([k]) => k === 'd')?.[1] ?? ''
  return (
    <path
      className={s.draft}
      d={d}
      strokeWidth={shape.style.strokeWidth ?? doc.strokeWidth}
      strokeLinecap={shape.style.linecap ?? doc.linecap}
      strokeLinejoin={shape.style.linejoin ?? doc.linejoin}
    />
  )
}

// Tool feedback, drawn above the content and never serialized. Like the keyline layer, the SVG covers the canvas
// and positions come from the viewport. Draft geometry lives in a zoomed group (document units), while snap
// markers are placed in screen pixels so they keep a constant size at any zoom.
export default function ToolOverlay({ primitives }: { primitives: OverlayPrimitive[] }) {
  const doc = useEditor((e) => e.doc)
  const vp = useEditor((e) => e.ui.viewport)
  if (primitives.length === 0) return null

  const origin = docToScreen(vp, { x: 0, y: 0 })
  const far = docToScreen(vp, { x: doc.size, y: doc.size })

  return (
    <svg className={s.layer} aria-hidden="true">
      {primitives.map((p, i) => {
        if (p.kind === 'draft') {
          return (
            <g key={i} transform={`translate(${origin.x} ${origin.y}) scale(${vp.zoom})`}>
              <DraftPath shape={p.shape} doc={doc} />
            </g>
          )
        }
        if (p.kind === 'snapPoint') {
          const c = docToScreen(vp, p.p)
          return <circle key={i} className={s.snapPoint} cx={c.x} cy={c.y} r={SNAP_RING_RADIUS} />
        }
        if (p.axis === 'x') {
          const x = origin.x + p.value * vp.zoom
          return <line key={i} className={s.snapLine} x1={x} y1={origin.y} x2={x} y2={far.y} />
        }
        const y = origin.y + p.value * vp.zoom
        return <line key={i} className={s.snapLine} x1={origin.x} y1={y} x2={far.x} y2={y} />
      })}
    </svg>
  )
}
