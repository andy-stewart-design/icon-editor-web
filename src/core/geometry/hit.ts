import type { PathShape, Pt } from '../model'
import type { Rect } from './bounds'
import { sampleSegment, segmentsOf, toBezier, type Segment } from './segments'

const SAMPLES_PER_SEGMENT = 32

function distToLine(a: Pt, b: Pt, p: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y)
}

// Straight segments are exact. Curves use bezier-js projection (LUT plus local refinement).
export function distanceToSegment(seg: Segment, p: Pt): number {
  if (seg.straight) return distToLine(seg.from.p, seg.to.p, p)
  const q = toBezier(seg).project(p)
  return Math.hypot(q.x - p.x, q.y - p.y)
}

// Distance from p to the shape's centreline. Fill is none, so the interior doesn't count.
// Infinity when the shape has no geometry.
export function distanceToShape(shape: PathShape, p: Pt): number {
  let best = Infinity
  for (const sp of shape.subpaths) {
    for (const n of sp.nodes) best = Math.min(best, Math.hypot(n.p.x - p.x, n.p.y - p.y))
    for (const seg of segmentsOf(sp)) best = Math.min(best, distanceToSegment(seg, p))
  }
  return best
}

// Liang–Barsky clipping of segment a–b against the rect. Endpoints inside the rect count as intersecting.
export function segmentIntersectsRect(a: Pt, b: Pt, r: Rect): boolean {
  const x0 = r.x
  const x1 = r.x + r.w
  const y0 = r.y
  const y1 = r.y + r.h
  const dx = b.x - a.x
  const dy = b.y - a.y
  const edges: [number, number][] = [
    [-dx, a.x - x0],
    [dx, x1 - a.x],
    [-dy, a.y - y0],
    [dy, y1 - a.y],
  ]
  let t0 = 0
  let t1 = 1
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      t0 = Math.max(t0, t)
    } else {
      if (t < t0) return false
      t1 = Math.min(t1, t)
    }
  }
  return true
}

// Marquee test: true when any part of the centreline meets the rect. Curves are sampled to a polyline.
export function shapeIntersectsRect(shape: PathShape, r: Rect): boolean {
  for (const sp of shape.subpaths) {
    // A lone node has no segments, so test it as a degenerate segment.
    for (const n of sp.nodes) if (segmentIntersectsRect(n.p, n.p, r)) return true
    for (const seg of segmentsOf(sp)) {
      const pts = sampleSegment(seg, SAMPLES_PER_SEGMENT)
      for (let i = 0; i + 1 < pts.length; i++) {
        if (segmentIntersectsRect(pts[i], pts[i + 1], r)) return true
      }
    }
  }
  return false
}
