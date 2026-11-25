import { nearestSegment } from '../geometry/nodes'
import type { PathNode, PathShape, Pt, Subpath } from '../model'
import { HIT_TOLERANCE_PX } from './selectTool'

type ContourEnd = 'head' | 'tail'
type PenEndpoint = { subpath: Subpath; end: ContourEnd; node: PathNode }

// Handles are absolute control points; traversing from the head swaps their roles,
// not their coordinates. The model stores independent (Free) handles as corner mode.
export function withContinuationHandle(node: PathNode, end: ContourEnd, handle: Pt): PathNode {
  const side = end === 'head' ? 'hIn' : 'hOut'
  const previous = node[side]
  if (node.mode === 'corner' && previous?.x === handle.x && previous.y === handle.y) return node
  return { ...node, mode: 'corner', [side]: handle }
}

// The caller supplies its one eligible shape and the raw (unsnapped) pointer.
// Nearest wins; exact ties keep subpath order, then head before tail.
export function resolvePenEndpoint(shape: PathShape, pt: Pt, zoom: number): PenEndpoint | null {
  if (!Number.isFinite(zoom) || zoom <= 0) return null
  const tolerance = HIT_TOLERANCE_PX / zoom
  let best: PenEndpoint | null = null
  let nearest = Infinity
  for (const subpath of shape.subpaths) {
    if (subpath.closed || subpath.nodes.length === 0) continue
    const consider = (end: ContourEnd, node: PathNode): void => {
      const distance = Math.hypot(pt.x - node.p.x, pt.y - node.p.y)
      if (distance <= tolerance && distance < nearest) {
        best = { subpath, end, node }
        nearest = distance
      }
    }
    consider('head', subpath.nodes[0])
    if (subpath.nodes.length > 1) consider('tail', subpath.nodes[subpath.nodes.length - 1])
  }
  return best
}

// Idle Node Pen uses the raw pointer for both the cue and the press. Anchors
// that cannot resume consume the hit rather than starting a disconnected contour.
export function idlePenTarget(shape: PathShape, pt: Pt, zoom: number, strokeWidth: number) {
  const endpoint = resolvePenEndpoint(shape, pt, zoom)
  if (endpoint) return { kind: 'resume', endpoint } as const
  const tolerance = HIT_TOLERANCE_PX / zoom
  if (
    shape.subpaths.some((sp) =>
      sp.nodes.some((n) => Math.hypot(pt.x - n.p.x, pt.y - n.p.y) <= tolerance),
    )
  )
    return { kind: 'blocked' } as const
  const hit = nearestSegment(shape, pt)
  if (!hit || hit.distance > tolerance + (shape.style.strokeWidth ?? strokeWidth) / 2)
    return { kind: 'empty' } as const
  if (!(hit.t > 0 && hit.t < 1)) return { kind: 'blocked' } as const
  return { kind: 'insert', hit } as const
}

// Placed nodes are in drawing order, excluding both existing endpoints.
// For closure, wrapping the assembled node list connects to the original opposite endpoint.
export function extendPenContour(
  contour: Subpath,
  end: ContourEnd,
  placed: readonly PathNode[],
  close: boolean,
): Subpath {
  if (contour.closed || contour.nodes.length === 0) return contour
  const closed = close && contour.nodes.length + placed.length >= 2
  if (placed.length === 0) return closed ? { ...contour, closed } : contour
  const nodes =
    end === 'tail'
      ? [...contour.nodes, ...placed]
      : [
          ...placed.toReversed().map(({ hIn, hOut, ...node }) => ({
            ...node,
            hIn: hOut,
            hOut: hIn,
          })),
          ...contour.nodes,
        ]
  return { ...contour, nodes, closed }
}
