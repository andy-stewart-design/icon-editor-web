import { newId } from '../ids'
import type { NodeMode, PathNode, PathShape, Pt } from '../model'

// Cubic handle length for a quarter circle, as a fraction of the radius.
export const KAPPA = 0.5522847
const EPS = 1e-9

// Node before ids are assigned. Absent handles mean "at the anchor".
type Raw = { p: Pt; hIn?: Pt; hOut?: Pt }

const near = (a: Pt, b: Pt): boolean => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS

function toNode(id: string, r: Raw, mode: NodeMode): PathNode {
  const node: PathNode = { id, p: r.p, mode }
  if (r.hIn) node.hIn = r.hIn
  if (r.hOut) node.hOut = r.hOut
  return node
}

// Builds a one-subpath path shape with an empty style. Every id is generated here with newId().
function pathOf(closed: boolean, raws: Raw[], mode: NodeMode): PathShape {
  const id = newId()
  const subId = newId()
  const nodes = raws.map((r) => toNode(newId(), r, mode))
  return { id, type: 'path', style: {}, subpaths: [{ id: subId, nodes, closed }] }
}

// Drops zero-length segments by merging coincident neighbours. The earlier node keeps its incoming handle,
// the later one contributes its outgoing handle, and the wrap-around pair is merged the same way.
function mergeCoincident(raws: Raw[]): Raw[] {
  const out: Raw[] = []
  for (const r of raws) {
    const last = out[out.length - 1]
    if (last && near(last.p, r.p)) {
      out[out.length - 1] = { p: last.p, hIn: last.hIn, hOut: r.hOut }
    } else {
      out.push(r)
    }
  }
  if (out.length > 1 && near(out[out.length - 1].p, out[0].p)) {
    const tail = out.pop() as Raw
    out[0] = { p: out[0].p, hIn: tail.hIn, hOut: out[0].hOut }
  }
  return out
}

// Null for a zero-length line, so a click without a drag creates nothing.
export function makeLine(a: Pt, b: Pt): PathShape | null {
  if (near(a, b)) return null
  return pathOf(false, [{ p: a }, { p: b }], 'corner')
}

// Null when the width or height is zero. Negative sizes are normalized. The radius is clamped to min(w, h) / 2.
// Radius 0 gives four corners. Otherwise each corner is a quarter-circle cubic, with merged nodes where
// a straight edge has collapsed to zero length.
export function makeRect(x: number, y: number, w: number, h: number, r = 0): PathShape | null {
  if (Math.abs(w) < EPS || Math.abs(h) < EPS) return null
  const x0 = Math.min(x, x + w)
  const x1 = Math.max(x, x + w)
  const y0 = Math.min(y, y + h)
  const y1 = Math.max(y, y + h)
  const rad = Math.min(Math.max(r, 0), (x1 - x0) / 2, (y1 - y0) / 2)

  let raws: Raw[]
  if (rad === 0) {
    raws = [
      { p: { x: x0, y: y0 } },
      { p: { x: x1, y: y0 } },
      { p: { x: x1, y: y1 } },
      { p: { x: x0, y: y1 } },
    ]
  } else {
    const k = KAPPA * rad
    // Clockwise in document space (y down), starting at the top edge after the top-left corner.
    raws = [
      { p: { x: x0 + rad, y: y0 }, hIn: { x: x0 + rad - k, y: y0 } },
      { p: { x: x1 - rad, y: y0 }, hOut: { x: x1 - rad + k, y: y0 } },
      { p: { x: x1, y: y0 + rad }, hIn: { x: x1, y: y0 + rad - k } },
      { p: { x: x1, y: y1 - rad }, hOut: { x: x1, y: y1 - rad + k } },
      { p: { x: x1 - rad, y: y1 }, hIn: { x: x1 - rad + k, y: y1 } },
      { p: { x: x0 + rad, y: y1 }, hOut: { x: x0 + rad - k, y: y1 } },
      { p: { x: x0, y: y1 - rad }, hIn: { x: x0, y: y1 - rad + k } },
      { p: { x: x0, y: y0 + rad }, hOut: { x: x0, y: y0 + rad - k } },
    ]
  }
  return pathOf(true, mergeCoincident(raws), 'corner')
}

// Null when either radius is zero. Four smooth nodes at the extreme points, with κ-scaled handles.
export function makeEllipse(cx: number, cy: number, rx: number, ry: number): PathShape | null {
  const ax = Math.abs(rx)
  const ay = Math.abs(ry)
  if (ax < EPS || ay < EPS) return null
  const kx = KAPPA * ax
  const ky = KAPPA * ay
  const raws: Raw[] = [
    { p: { x: cx, y: cy - ay }, hIn: { x: cx - kx, y: cy - ay }, hOut: { x: cx + kx, y: cy - ay } },
    { p: { x: cx + ax, y: cy }, hIn: { x: cx + ax, y: cy - ky }, hOut: { x: cx + ax, y: cy + ky } },
    { p: { x: cx, y: cy + ay }, hIn: { x: cx + kx, y: cy + ay }, hOut: { x: cx - kx, y: cy + ay } },
    { p: { x: cx - ax, y: cy }, hIn: { x: cx - ax, y: cy + ky }, hOut: { x: cx - ax, y: cy - ky } },
  ]
  return pathOf(true, raws, 'smooth')
}

// Unit vectors at multiples of 45°, exact at the axes and diagonals.
const DIRS: Pt[] = [
  { x: 1, y: 0 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: 0, y: 1 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -1, y: 0 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 0, y: -1 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
]

// Keeps the distance from the anchor and snaps the direction to the nearest multiple of 45°.
export function constrainAngle45(anchor: Pt, p: Pt): Pt {
  const dx = p.x - anchor.x
  const dy = p.y - anchor.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return { x: anchor.x, y: anchor.y }
  const step = Math.round(Math.atan2(dy, dx) / (Math.PI / 4))
  const dir = DIRS[((step % 8) + 8) % 8]
  return { x: anchor.x + len * dir.x, y: anchor.y + len * dir.y }
}
