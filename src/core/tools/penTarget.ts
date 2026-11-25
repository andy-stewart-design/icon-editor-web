import type { PathNode, PathShape, Pt, Subpath } from '../model'
import { HIT_TOLERANCE_PX } from './selectTool'

type ContourEnd = 'head' | 'tail'
type PenEndpoint = { subpath: Subpath; end: ContourEnd; node: PathNode }

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
