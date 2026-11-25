import type { Rect } from './geometry/bounds'
import type { Guide, SnapLine } from './guides'
import type { Pt } from './model'

// Snap tolerance is a fixed number of screen pixels, so it converts to document units per zoom.
export const SNAP_TOLERANCE_PX = 6
export const snapToleranceDoc = (zoom: number, px = SNAP_TOLERANCE_PX): number => px / zoom

export type SnapContext = {
  enabled: boolean // false returns the point unchanged
  increment: number // grid increment, in doc units
  tolerance: number // doc units (screen px ÷ zoom)
  anchors: readonly { id: string; p: Pt }[] // existing anchors, including the ones being dragged
  excludeAnchorIds: ReadonlySet<string> // anchors to skip (e.g. the nodes being dragged)
  bounds: readonly Rect[] // shape bounds; contribute their edges and centers
  guides: readonly Guide[] // visible guides only; the caller filters by keylinesVisible
}

// What a snap hit, per axis. 'anchor' is a point target; 'line' is one axis of a straight target.
// 'grid' means no non-grid target was in tolerance on that axis.
export type SnapTarget =
  | { kind: 'grid' }
  | { kind: 'anchor'; p: Pt }
  | { kind: 'line'; source: SnapLine['source']; axis: 'x' | 'y'; value: number }

// targets is null on both axes when snapping is disabled (the point is returned unchanged).
export type SnapResult = { point: Pt; targets: { x: SnapTarget | null; y: SnapTarget | null } }

const snapToGrid = (v: number, increment: number): number =>
  Math.round(v / increment) * increment + 0 // + 0 turns -0 into 0

function boundsLines(bounds: readonly Rect[]): SnapLine[] {
  const lines: SnapLine[] = []
  for (const b of bounds) {
    lines.push(
      { axis: 'x', value: b.x, source: 'edge' },
      { axis: 'x', value: b.x + b.w, source: 'edge' },
      { axis: 'x', value: b.x + b.w / 2, source: 'center' },
      { axis: 'y', value: b.y, source: 'edge' },
      { axis: 'y', value: b.y + b.h, source: 'edge' },
      { axis: 'y', value: b.y + b.h / 2, source: 'center' },
    )
  }
  return lines
}

type AxisHit = { dist: number; value: number; target: SnapTarget }

// Each axis resolves on its own. On each axis, the nearest non-grid candidate within tolerance wins;
// if there is none, that axis snaps to the grid.
// - An anchor is a point. It qualifies when its 2D distance to the pointer is within tolerance,
//   then contributes its x to the x axis and its y to the y axis.
// - A line qualifies when its distance on its own axis is within tolerance, and contributes only to that axis.
// Ties keep the earlier candidate: anchors, then bounds, then guides.
export function snapPoint(pt: Pt, ctx: SnapContext): SnapResult {
  if (!ctx.enabled) return { point: pt, targets: { x: null, y: null } }

  const best: { x: AxisHit | null; y: AxisHit | null } = { x: null, y: null }
  const offer = (axis: 'x' | 'y', dist: number, value: number, target: SnapTarget): void => {
    const cur = best[axis]
    if (cur === null || dist < cur.dist) best[axis] = { dist, value, target }
  }

  for (const a of ctx.anchors) {
    if (ctx.excludeAnchorIds.has(a.id)) continue
    if (Math.hypot(a.p.x - pt.x, a.p.y - pt.y) > ctx.tolerance) continue
    const target: SnapTarget = { kind: 'anchor', p: a.p }
    offer('x', Math.abs(a.p.x - pt.x), a.p.x, target)
    offer('y', Math.abs(a.p.y - pt.y), a.p.y, target)
  }

  const lines = [...boundsLines(ctx.bounds), ...ctx.guides.flatMap((g) => g.snapLines)]
  for (const line of lines) {
    const d = Math.abs(pt[line.axis] - line.value)
    if (d > ctx.tolerance) continue
    offer(line.axis, d, line.value, {
      kind: 'line',
      source: line.source,
      axis: line.axis,
      value: line.value,
    })
  }

  const x = best.x
  const y = best.y
  return {
    point: {
      x: x ? x.value : snapToGrid(pt.x, ctx.increment),
      y: y ? y.value : snapToGrid(pt.y, ctx.increment),
    },
    targets: { x: x ? x.target : { kind: 'grid' }, y: y ? y.target : { kind: 'grid' } },
  }
}
