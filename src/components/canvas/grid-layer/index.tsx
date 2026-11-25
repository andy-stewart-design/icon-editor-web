import { docToScreen, gridSpacingVisible, type Viewport } from '../../../core'
import { useEditor } from '../../../hooks/use-editor'
import s from './styles.module.css'

// Centers a screen coordinate on a device-independent pixel so a 1 px stroke stays crisp.
const crisp = (v: number): number => Math.round(v) + 0.5

// One path of interior lines at doc positions offset, offset + 1, ... (0 and size are the artboard edges).
function gridPath(vp: Viewport, size: number, offset: number): string {
  const o = docToScreen(vp, { x: 0, y: 0 })
  const far = docToScreen(vp, { x: size, y: size })
  let d = ''
  for (let p = offset; p < size; p += 1) {
    if (p <= 0) continue
    d += `M${crisp(o.x + p * vp.zoom)} ${crisp(o.y)}V${crisp(far.y)}M${crisp(o.x)} ${crisp(o.y + p * vp.zoom)}H${crisp(far.x)}`
  }
  return d
}

export default function GridLayer() {
  const size = useEditor((e) => e.doc.size)
  const vp = useEditor((e) => e.ui.viewport)
  const showGrid = useEditor((e) => e.ui.showGrid)
  const showSubgrid = useEditor((e) => e.ui.showSubgrid)

  const o = docToScreen(vp, { x: 0, y: 0 })
  const far = docToScreen(vp, { x: size, y: size })
  // Border sits inside the artboard's pixels: left/top on the first pixel, right/bottom on the last.
  const left = Math.round(o.x) + 0.5
  const top = Math.round(o.y) + 0.5
  const right = Math.round(far.x) - 0.5
  const bottom = Math.round(far.y) - 0.5

  return (
    <svg className={s.layer} aria-hidden="true">
      <rect className={s.artboard} x={left} y={top} width={right - left} height={bottom - top} />
      {showGrid && gridSpacingVisible(vp.zoom, 1) && (
        <path className={s.grid} d={gridPath(vp, size, 1)} />
      )}
      {showSubgrid && gridSpacingVisible(vp.zoom, 0.5) && (
        <path className={s.subgrid} d={gridPath(vp, size, 0.5)} />
      )}
    </svg>
  )
}
