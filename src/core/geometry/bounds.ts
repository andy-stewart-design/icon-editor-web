import type { PathShape, Pt, Subpath } from '../model'
import { segmentsOf, toBezier, type Segment } from './segments'

// Axis-aligned box in document units. w and h are non-negative.
export type Rect = { x: number; y: number; w: number; h: number }

const fromCorners = (minX: number, minY: number, maxX: number, maxY: number): Rect => ({
  x: minX,
  y: minY,
  w: maxX - minX,
  h: maxY - minY,
})

const pointRect = (p: Pt): Rect => ({ x: p.x, y: p.y, w: 0, h: 0 })

export function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b
  if (!b) return a
  return fromCorners(
    Math.min(a.x, b.x),
    Math.min(a.y, b.y),
    Math.max(a.x + a.w, b.x + b.w),
    Math.max(a.y + a.h, b.y + b.h),
  )
}

// Exact extrema from bezier-js (analytic derivative roots). Handles are control points and don't count.
export function segmentBounds(seg: Segment): Rect {
  const box = toBezier(seg).bbox()
  return fromCorners(box.x.min, box.y.min, box.x.max, box.y.max)
}

// Anchors are included so a single-node subpath still has bounds.
export function subpathBounds(sp: Subpath): Rect | null {
  let r: Rect | null = null
  for (const n of sp.nodes) r = unionRect(r, pointRect(n.p))
  for (const seg of segmentsOf(sp)) r = unionRect(r, segmentBounds(seg))
  return r
}

export function shapeBounds(shape: PathShape): Rect | null {
  return selectionBounds([shape])
}

// Bounds of the geometry only, never including stroke width. Null when nothing has geometry.
export function selectionBounds(shapes: PathShape[]): Rect | null {
  let r: Rect | null = null
  for (const shape of shapes) for (const sp of shape.subpaths) r = unionRect(r, subpathBounds(sp))
  return r
}
