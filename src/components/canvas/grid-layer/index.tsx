import {
  boardViewport,
  docToScreen,
  type Artboard,
  gridSpacingVisible,
  type Viewport,
} from '../../../core'
import { useEditor } from '../../../hooks/use-editor'
import s from './styles.module.css'

// Centers a screen coordinate on a device-independent pixel so a 1 px stroke stays crisp.
const crisp = (v: number): number => Math.round(v) + 0.5

// Build only visible grid lines, including on oversized artboards from legacy records.
function gridPath(vp: Viewport, size: number, offset: number, width: number, height: number) {
  const o = docToScreen(vp, { x: 0, y: 0 })
  const far = docToScreen(vp, { x: size, y: size })
  let d = ''
  const append = (origin: number, extent: number, draw: (position: number) => string) => {
    const start = Math.max(0, Math.ceil(-origin / vp.zoom - offset))
    const end = Math.min(size - offset, (extent - origin) / vp.zoom - offset + 1)
    for (let i = start; i < end && i < Number.MAX_SAFE_INTEGER; i++) {
      if (i + offset > 0) d += draw(crisp(origin + (i + offset) * vp.zoom))
    }
  }
  append(o.x, width, (x) => `M${x} ${crisp(Math.max(o.y, 0))}V${crisp(Math.min(far.y, height))}`)
  append(o.y, height, (y) => `M${crisp(Math.max(o.x, 0))} ${y}H${crisp(Math.min(far.x, width))}`)
  return d
}

export default function GridLayer({
  board,
  active = false,
}: {
  board: Artboard
  active?: boolean
}) {
  const { size, origin } = board
  const vp = boardViewport(
    useEditor((e) => e.ui.viewport),
    origin,
  )
  const { width, height } = useEditor((e) => e.ui.canvasSize)
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
      <rect
        className={active ? `${s.artboard} ${s.active}` : s.artboard}
        x={left}
        y={top}
        width={Math.max(0, right - left)}
        height={Math.max(0, bottom - top)}
      />
      {active && showGrid && gridSpacingVisible(vp.zoom, 1) && (
        <path className={s.grid} d={gridPath(vp, size, 1, width, height)} />
      )}
      {active && showSubgrid && gridSpacingVisible(vp.zoom, 0.5) && (
        <path className={s.subgrid} d={gridPath(vp, size, 0.5, width, height)} />
      )}
    </svg>
  )
}
