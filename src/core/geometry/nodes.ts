import { newId } from '../ids'
import type { NodeMode, PathNode, PathShape, Pt, Subpath } from '../model'
import { segmentBetween, segmentsOf, toBezier } from './segments'

// Pure node and curve editing operations. Every function returns new objects and never mutates its inputs.
//
// Conventions:
// - Handles are absolute. An absent handle sits on its anchor.
// - Segment index i joins nodes[i] to nodes[(i + 1) % n] on closed subpaths (see segmentsOf).
// - Node modes: corner (handles independent); smooth (opposite handle collinear, own length kept);
//   symmetric (opposite handle collinear and equal length).

export type NearestSegment = {
  subpathIndex: number
  segIndex: number
  t: number
  point: Pt
  distance: number
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
const scale = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k })
const len = (a: Pt): number => Math.hypot(a.x, a.y)
const dist = (a: Pt, b: Pt): number => len(sub(a, b))

// Returns a copy of the node with the given handle set, or removed when pt is undefined.
function withHandle(node: PathNode, key: 'hIn' | 'hOut', pt: Pt | undefined): PathNode {
  const out: PathNode = { ...node }
  if (pt === undefined) delete out[key]
  else out[key] = pt
  return out
}

// Nearest point on the segment from a to b, with t in [0, 1]. Straight when neither handle is set,
// otherwise a cubic (missing handles at their anchor), projected with bezier-js.
export function projectToSegment(a: PathNode, b: PathNode, pt: Pt): { t: number; point: Pt; distance: number } {
  const seg = segmentBetween(0, a, b)
  if (seg.straight) {
    const d = sub(b.p, a.p)
    const l2 = d.x * d.x + d.y * d.y
    const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((pt.x - a.p.x) * d.x + (pt.y - a.p.y) * d.y) / l2))
    const point = add(a.p, scale(d, t))
    return { t, point, distance: dist(point, pt) }
  }
  const q = toBezier(seg).project(pt)
  const point = { x: q.x, y: q.y }
  return { t: q.t ?? 0, point, distance: dist(point, pt) }
}

// Nearest segment across all subpaths of a shape, including closing segments. Null when the shape has no segments.
export function nearestSegment(shape: PathShape, pt: Pt): NearestSegment | null {
  let best: NearestSegment | null = null
  shape.subpaths.forEach((sp, subpathIndex) => {
    for (const seg of segmentsOf(sp)) {
      const hit = projectToSegment(seg.from, seg.to, pt)
      if (!best || hit.distance < best.distance) {
        best = { subpathIndex, segIndex: seg.index, t: hit.t, point: hit.point, distance: hit.distance }
      }
    }
  })
  return best
}

// Splits segment segIndex at parameter t (0 < t < 1) with de Casteljau, so the curve keeps its shape.
// The inserted node is smooth on a curve and corner on a straight segment. On a closed subpath,
// segIndex = nodes.length - 1 is the closing segment and the new node is appended at the end.
// Invalid segIndex or t returns the input subpath unchanged.
export function insertNodeAt(subpath: Subpath, segIndex: number, t: number): Subpath {
  const { nodes, closed } = subpath
  const n = nodes.length
  const segCount = closed ? n : n - 1
  if (!Number.isInteger(segIndex) || segIndex < 0 || segIndex >= segCount) return subpath
  if (!(t > 0 && t < 1)) return subpath

  const from = nodes[segIndex]
  const toIdx = (segIndex + 1) % n
  const to = nodes[toIdx]
  const seg = segmentBetween(segIndex, from, to)

  let mid: PathNode
  let fromNext = from
  let toNext = to
  if (seg.straight) {
    // No handles to adjust; neighbours keep their (absent) handles.
    mid = { id: newId(), p: add(from.p, scale(sub(to.p, from.p), t)), mode: 'corner' }
  } else {
    // Cubic: split with bezier-js. left = [p0, l1, l2, m], right = [m, r1, r2, p3].
    const { left, right } = toBezier(seg).split(t)
    const [, l1, l2, m] = left.points
    const [, r1, r2] = right.points
    mid = {
      id: newId(),
      p: { x: m.x, y: m.y },
      hIn: { x: l2.x, y: l2.y },
      hOut: { x: r1.x, y: r1.y },
      mode: 'smooth',
    }
    // An absent handle stays absent: the split of a missing handle is exactly the anchor.
    if (from.hOut !== undefined) fromNext = withHandle(from, 'hOut', { x: l1.x, y: l1.y })
    if (to.hIn !== undefined) toNext = withHandle(to, 'hIn', { x: r2.x, y: r2.y })
  }

  const next = nodes.slice()
  next[segIndex] = fromNext
  next[toIdx] = toNext
  if (closed && segIndex === n - 1) next.push(mid)
  else next.splice(segIndex + 1, 0, mid)
  return { ...subpath, nodes: next }
}

// Removes the nodes whose ids are in nodeIds. Remaining nodes keep their handles, so the new segment
// between two surviving neighbours uses the previous node's hOut and the next node's hIn.
// A subpath with fewer than 2 nodes left is removed (closed subpaths follow the same rule, and stay closed).
// Returns null when no subpath survives. Returns the same shape when nothing matches.
export function deleteNodes(shape: PathShape, nodeIds: ReadonlySet<string>): PathShape | null {
  const touched = shape.subpaths.some((sp) => sp.nodes.some((n) => nodeIds.has(n.id)))
  if (!touched) return shape
  const subpaths = shape.subpaths
    .map((sp) => ({ ...sp, nodes: sp.nodes.filter((n) => !nodeIds.has(n.id)) }))
    .filter((sp) => sp.nodes.length >= 2)
  if (subpaths.length === 0) return null
  return { ...shape, subpaths }
}

// Removes the nodes in nodeIds and leaves the path open where they were (the default Delete). Each subpath that
// loses a node is cut into runs of surviving nodes, and each run of two or more nodes becomes an open subpath:
// - Closed subpath: the runs follow the order after the removed nodes, so the old neighbours become the two ends.
//   One removed node gives one open piece. Several removed runs give several pieces.
// - Open subpath: runs are the stretches between removed nodes, so an interior removal splits it in two.
// The first piece of a subpath keeps its id, later pieces get new ids. Ends drop the handle that pointed off the
// path (first node hIn, last node hOut), because a dangling handle on an open end would still show and bend nothing.
// Other handles are kept. Pieces under two nodes are dropped. Returns null when no subpath survives, and the same
// shape when nothing matches. Does not mutate its input.
export function breakAtNodes(shape: PathShape, nodeIds: ReadonlySet<string>): PathShape | null {
  const touched = shape.subpaths.some((sp) => sp.nodes.some((n) => nodeIds.has(n.id)))
  if (!touched) return shape
  const subpaths: Subpath[] = []
  for (const sp of shape.subpaths) {
    if (!sp.nodes.some((n) => nodeIds.has(n.id))) {
      subpaths.push(sp)
      continue
    }
    let keptId = false
    for (const run of survivingRuns(sp, nodeIds)) {
      if (run.length < 2) continue
      const nodes = run.map((n) => ({ ...n }))
      delete nodes[0].hIn
      delete nodes[nodes.length - 1].hOut
      // The first piece that survives takes the original id, so a dropped run never takes it.
      subpaths.push({ id: keptId ? newId() : sp.id, closed: false, nodes })
      keptId = true
    }
  }
  if (subpaths.length === 0) return null
  return { ...shape, subpaths }
}

// Cut one edge without moving any control point on the surviving edges.
export function cutSegmentAt(sp: Subpath, index: number): Subpath[] {
  const { nodes, closed } = sp
  if (nodes.length < 2 || !Number.isInteger(index) || index < 0 || index >= nodes.length - (closed ? 0 : 1)) {
    return [sp]
  }
  const left = nodes.slice(0, index + 1)
  const right = nodes.slice(index + 1)
  const runs = closed ? [[...right, ...left]] : [left, right]
  return runs.filter((run) => run.length >= 2).map((run, i) => {
    run[0] = withHandle(run[0], 'hIn', undefined)
    const last = run.length - 1
    run[last] = withHandle(run[last], 'hOut', undefined)
    return { id: i === 0 ? sp.id : newId(), closed: false, nodes: run }
  })
}

// Maximal runs of surviving nodes, in path order. A closed subpath is scanned starting just after a removed node,
// so a run that crosses the array's end is not split and the first run comes right after the removal.
function survivingRuns(sp: Subpath, nodeIds: ReadonlySet<string>): PathNode[][] {
  const n = sp.nodes.length
  const runs: PathNode[][] = []
  let cur: PathNode[] = []
  // Open subpaths start at index 0. Closed ones start at the first removed node, so the scan ends just before it.
  const start = sp.closed ? sp.nodes.findIndex((node) => nodeIds.has(node.id)) : 0
  for (let k = 0; k < n; k++) {
    const node = sp.nodes[(start + k) % n]
    if (nodeIds.has(node.id)) {
      if (cur.length > 0) runs.push(cur)
      cur = []
    } else {
      cur.push(node)
    }
  }
  if (cur.length > 0) runs.push(cur)
  return runs
}

// Moves one handle to pt and applies the node's mode to the opposite handle.
// corner: only the dragged handle moves.
// smooth: the opposite handle points the other way, keeps its own length. Left absent if absent or zero-length.
//         A zero-length dragged handle (pt at anchor) has no direction, so the opposite handle is unchanged.
// symmetric: the opposite handle is the mirror of pt through the anchor (same length, opposite direction).
export function moveHandle(node: PathNode, which: 'in' | 'out', pt: Pt): PathNode {
  const key = which === 'in' ? 'hIn' : 'hOut'
  const otherKey = which === 'in' ? 'hOut' : 'hIn'
  let out = withHandle(node, key, pt)
  if (node.mode === 'corner') return out

  const other = node[otherKey]
  const offset = sub(pt, node.p)
  if (node.mode === 'symmetric') {
    out = withHandle(out, otherKey, sub(node.p, offset))
  } else if (other !== undefined && len(sub(other, node.p)) > 0 && len(offset) > 0) {
    const otherLen = len(sub(other, node.p))
    const dir = scale(offset, -1 / len(offset))
    out = withHandle(out, otherKey, add(node.p, scale(dir, otherLen)))
  }
  return out
}

// Unit outward directions of each side (hOut from the anchor, and anchor-to-hIn), with lengths.
// A side that is absent or zero-length counts as missing.
function sides(node: PathNode): { a: Pt | null; b: Pt | null; la: number; lb: number } {
  const va = node.hOut ? sub(node.hOut, node.p) : { x: 0, y: 0 }
  const vb = node.hIn ? sub(node.p, node.hIn) : { x: 0, y: 0 }
  const la = len(va)
  const lb = len(vb)
  return {
    a: la > 0 ? scale(va, 1 / la) : null,
    b: lb > 0 ? scale(vb, 1 / lb) : null,
    la,
    lb,
  }
}

// Averaged direction of the two sides: normalize(a + b). For collinear handles (a = b) this is that direction.
// When the sides cancel (cusp) or one side is missing, falls back to the one that exists.
function averagedDirection(a: Pt | null, b: Pt | null): Pt | null {
  if (a && b) {
    const s = add(a, b)
    const l = len(s)
    if (l > 1e-12) return scale(s, 1 / l)
    return a
  }
  return a ?? b
}

// Re-imposes smooth or symmetric constraints on one node by aligning both handles to the averaged direction.
// smooth: each side keeps its own length; a missing side stays missing.
// symmetric: both sides get the average of the non-zero lengths (a missing side is created as the mirror).
// Corner nodes are returned unchanged in their handles. Nothing is done when the node has no non-zero handle.
function alignNode(node: PathNode): PathNode {
  if (node.mode === 'corner') return node
  const { a, b, la, lb } = sides(node)
  const d = averagedDirection(a, b)
  if (!d) return node

  if (node.mode === 'smooth') {
    let out = node
    if (la > 0) out = withHandle(out, 'hOut', add(node.p, scale(d, la)))
    if (lb > 0) out = withHandle(out, 'hIn', sub(node.p, scale(d, lb)))
    return out
  }
  // symmetric
  const count = (la > 0 ? 1 : 0) + (lb > 0 ? 1 : 0)
  const L = (la + lb) / count
  return withHandle(withHandle(node, 'hOut', add(node.p, scale(d, L))), 'hIn', sub(node.p, scale(d, L)))
}

// Switches a node's mode on a node that already has handles. Corner only changes the mode. Smooth and
// symmetric align both handles to the averaged direction (see alignNode). With one handle only, its
// direction is used; smooth then leaves the missing side absent, and symmetric creates the mirror.
// Does not create handles on a handle-less node (setNodeMode does that).
export function applyNodeMode(node: PathNode, mode: NodeMode): PathNode {
  const next: PathNode = { ...node, mode }
  return alignNode(next)
}

// True when the node has at least one non-zero-length handle.
function hasHandle(node: PathNode): boolean {
  return (
    (node.hOut !== undefined && len(sub(node.hOut, node.p)) > 0) ||
    (node.hIn !== undefined && len(sub(node.p, node.hIn)) > 0)
  )
}

// Builds a handle-less node in the given mode, creating handles from its neighbours (see setNodeMode).
// A neighbour is undefined when absent (open endpoint).
function createHandles(node: PathNode, mode: NodeMode, prev: PathNode | undefined, next: PathNode | undefined): PathNode {
  const out: PathNode = { id: node.id, p: node.p, mode }
  const p = node.p
  const dN = next ? dist(p, next.p) : 0
  const dP = prev ? dist(p, prev.p) : 0

  if (prev && next) {
    const d = sub(next.p, prev.p)
    const l = len(d)
    if (l === 0 || dN === 0 || dP === 0) return out
    const u = scale(d, 1 / l)
    if (mode === 'symmetric') {
      const L = (dN + dP) / 6 // average of dN/3 and dP/3
      out.hOut = add(p, scale(u, L))
      out.hIn = sub(p, scale(u, L))
    } else {
      out.hOut = add(p, scale(u, dN / 3))
      out.hIn = sub(p, scale(u, dP / 3))
    }
  } else if (next) {
    // First node of an open subpath: only the segment to next can be bent, so only hOut is created.
    if (dN === 0) return out
    out.hOut = add(p, scale(sub(next.p, p), 1 / 3)) // unit * dN/3 = vector / 3
  } else if (prev) {
    // Last node of an open subpath: only the segment from prev can be bent, so only hIn is created.
    if (dP === 0) return out
    out.hIn = add(p, scale(sub(prev.p, p), 1 / 3))
  }
  return out
}

// Switches the mode of node nodeId in a subpath and returns a new subpath (unknown nodeId: input returned).
// - Node with at least one non-zero handle: applyNodeMode (existing behaviour).
// - corner: only the mode changes.
// - Handle-less node switched to smooth or symmetric: handles are created along the neighbour direction.
//   Direction = unit(next - prev), wrapping around on closed subpaths. hOut = p + dir*dist(p,next)/3 and
//   hIn = p - dir*dist(p,prev)/3. Symmetric uses the average of the two lengths on both sides.
//   Open endpoints get only the handle on the side that bends their single segment: first node hOut toward
//   next, last node hIn toward prev, length dist/3. No mirror is created on the outer side.
//   Nothing but the mode changes for a lone node, a zero-length neighbour distance, or a zero direction
//   (e.g. a closed 2-node subpath, where prev and next are the same node).
export function setNodeMode(subpath: Subpath, nodeId: string, mode: NodeMode): Subpath {
  const { nodes, closed } = subpath
  const i = nodes.findIndex((n) => n.id === nodeId)
  if (i < 0) return subpath
  const n = nodes.length
  const node = nodes[i]

  let updated: PathNode
  if (mode === 'corner' || hasHandle(node)) {
    updated = applyNodeMode(node, mode)
  } else {
    let prev: PathNode | undefined
    let next: PathNode | undefined
    if (closed) {
      if (n > 1) {
        prev = nodes[(i - 1 + n) % n]
        next = nodes[(i + 1) % n]
      }
    } else {
      prev = i > 0 ? nodes[i - 1] : undefined
      next = i < n - 1 ? nodes[i + 1] : undefined
    }
    updated = createHandles(node, mode, prev, next)
  }

  const out = nodes.slice()
  out[i] = updated
  return { ...subpath, nodes: out }
}

// Removes both handles (keys absent, not undefined). Mode and anchor are kept.
export function retractHandles(node: PathNode): PathNode {
  return { id: node.id, p: node.p, mode: node.mode }
}

// Moves the anchor by the same delta as its handles, so handles follow it.
export function moveAnchor(node: PathNode, pt: Pt): PathNode {
  const d = sub(pt, node.p)
  const out: PathNode = { ...node, p: { x: pt.x, y: pt.y } }
  if (node.hIn) out.hIn = add(node.hIn, d)
  if (node.hOut) out.hOut = add(node.hOut, d)
  return out
}

// Re-imposes node-mode constraints on every smooth and symmetric node (e.g. after a non-uniform scale).
// Idempotent. Corner nodes are untouched.
export function enforceNodeModes(shape: PathShape): PathShape {
  return {
    ...shape,
    subpaths: shape.subpaths.map((sp) => ({ ...sp, nodes: sp.nodes.map(alignNode) })),
  }
}
