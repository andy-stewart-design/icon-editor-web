import { docToScreen, shapeAttributes, type IconDoc, type OverlayPrimitive, type PathShape } from '../../../core'
import { useEditor } from '../../../hooks/use-editor'
import s from './styles.module.css'

const SNAP_RING_RADIUS = 4 // screen px
const HOVER_EXTRA_PX = 4 // screen px added to the shape's stroke width so the hover halo reads around it
const ANCHOR_HALF = 3 // half the side of a node square, screen px
const HANDLE_DOT_RADIUS = 3 // screen px
const CLOSE_RING_RADIUS = 7 // screen px
const HOVER_RING_HALF = 6 // half the side of the node hover ring, screen px

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

// Hover halo: the shape's own outline, drawn wider in document units so it extends a fixed few screen px beyond the stroke.
function HoverPath({ shape, doc, zoom }: { shape: PathShape; doc: IconDoc; zoom: number }) {
  const d = shapeAttributes(shape).find(([k]) => k === 'd')?.[1] ?? ''
  return (
    <path
      className={s.hover}
      d={d}
      strokeWidth={(shape.style.strokeWidth ?? doc.strokeWidth) + HOVER_EXTRA_PX / zoom}
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
        if (p.kind === 'closeTarget') {
          const c = docToScreen(vp, p.p)
          return <circle key={i} className={s.closeTarget} cx={c.x} cy={c.y} r={CLOSE_RING_RADIUS} />
        }
        if (p.kind === 'snapLine') {
          if (p.axis === 'x') {
            const x = origin.x + p.value * vp.zoom
            return <line key={i} className={s.snapLine} x1={x} y1={origin.y} x2={x} y2={far.y} />
          }
          const y = origin.y + p.value * vp.zoom
          return <line key={i} className={s.snapLine} x1={origin.x} y1={y} x2={far.x} y2={y} />
        }
        if (p.kind === 'hover') {
          const shape = doc.shapes.find((sh) => sh.id === p.shapeId)
          if (!shape) return null
          return (
            <g key={i} transform={`translate(${origin.x} ${origin.y}) scale(${vp.zoom})`}>
              <HoverPath shape={shape} doc={doc} zoom={vp.zoom} />
            </g>
          )
        }
        if (p.kind === 'nodeHover') {
          const c = docToScreen(vp, p.p)
          return <rect key={i} className={s.nodeHover} x={c.x - HOVER_RING_HALF} y={c.y - HOVER_RING_HALF} width={HOVER_RING_HALF * 2} height={HOVER_RING_HALF * 2} />
        }
        if (p.kind === 'segmentHover') {
          const a = docToScreen(vp, p.from)
          const c1 = docToScreen(vp, p.c1)
          const c2 = docToScreen(vp, p.c2)
          const b = docToScreen(vp, p.to)
          return (
            <path
              key={i}
              className={s.segmentHover}
              d={`M${a.x} ${a.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`}
            />
          )
        }
        // Node-tool anchors and handles are drawn by the node overlay, which renders the static display.
        if (p.kind !== 'marquee') return null
        // Marquee corners are mapped to screen space so the border stays 1px at any zoom.
        const a = docToScreen(vp, { x: p.rect.x, y: p.rect.y })
        const b = docToScreen(vp, { x: p.rect.x + p.rect.w, y: p.rect.y + p.rect.h })
        return (
          <rect
            key={i}
            className={s.marquee}
            x={Math.min(a.x, b.x)}
            y={Math.min(a.y, b.y)}
            width={Math.abs(b.x - a.x)}
            height={Math.abs(b.y - a.y)}
          />
        )
      })}
    </svg>
  )
}
