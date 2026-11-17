import { Bezier } from 'bezier-js'
import type { PathNode, Pt, Subpath } from '../model'

// One segment of a subpath: from node `index` to the next node, wrapping to node 0 when the subpath is closed.
export type Segment = {
  index: number
  from: PathNode
  to: PathNode
  straight: boolean
  // Cubic control points. For a straight segment these are the two anchors.
  c1: Pt
  c2: Pt
}

// Mirrors the serializer rule: straight when both facing handles are absent,
// otherwise cubic with a missing handle treated as its anchor.
export function segmentBetween(index: number, from: PathNode, to: PathNode): Segment {
  const straight = from.hOut === undefined && to.hIn === undefined
  return {
    index,
    from,
    to,
    straight,
    c1: straight ? from.p : (from.hOut ?? from.p),
    c2: straight ? to.p : (to.hIn ?? to.p),
  }
}

export function segmentsOf(sp: Subpath): Segment[] {
  const { nodes, closed } = sp
  const n = nodes.length
  if (n < 2) return []
  const count = closed ? n : n - 1
  return Array.from({ length: count }, (_, i) => segmentBetween(i, nodes[i], nodes[(i + 1) % n]))
}

export function toBezier(seg: Segment): Bezier {
  return new Bezier(seg.from.p, seg.c1, seg.c2, seg.to.p)
}

export function evalSegment(seg: Segment, t: number): Pt {
  const p = toBezier(seg).compute(t)
  return { x: p.x, y: p.y }
}

// n + 1 evenly spaced parameter samples, including both endpoints.
export function sampleSegment(seg: Segment, n: number): Pt[] {
  const curve = toBezier(seg)
  return Array.from({ length: n + 1 }, (_, i) => {
    const p = curve.compute(i / n)
    return { x: p.x, y: p.y }
  })
}
