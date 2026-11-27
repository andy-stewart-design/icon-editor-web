import type { BoardContent, PathNode, PathShape, Pt } from '../model'

// Applies f to every anchor and handle. Absent handles stay absent. Node modes and style are kept.
export function mapPoints(shape: PathShape, f: (p: Pt) => Pt): PathShape {
  const mapNode = (n: PathNode): PathNode => {
    const out: PathNode = { id: n.id, p: f(n.p), mode: n.mode }
    if (n.hIn) out.hIn = f(n.hIn)
    if (n.hOut) out.hOut = f(n.hOut)
    return out
  }
  return {
    ...shape,
    subpaths: shape.subpaths.map((sp) => ({ ...sp, nodes: sp.nodes.map(mapNode) })),
  }
}

export function translate(shape: PathShape, dx: number, dy: number): PathShape {
  return mapPoints(shape, (p) => ({ x: p.x + dx, y: p.y + dy }))
}

export function scaleAbout(shape: PathShape, sx: number, sy: number, origin: Pt): PathShape {
  return mapPoints(shape, (p) => ({
    x: origin.x + (p.x - origin.x) * sx,
    y: origin.y + (p.y - origin.y) * sy,
  }))
}

// Angle in radians, positive is clockwise in document space (y down).
export function rotateAbout(shape: PathShape, angle: number, origin: Pt): PathShape {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return mapPoints(shape, (p) => {
    const dx = p.x - origin.x
    const dy = p.y - origin.y
    return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c }
  })
}

// Mirrors across the vertical line x = axisX.
export function flipH(shape: PathShape, axisX: number): PathShape {
  return mapPoints(shape, (p) => ({ x: 2 * axisX - p.x, y: p.y }))
}

// Mirrors across the horizontal line y = axisY.
export function flipV(shape: PathShape, axisY: number): PathShape {
  return mapPoints(shape, (p) => ({ x: p.x, y: 2 * axisY - p.y }))
}

// Artboard resize with "scale with artboard": coordinates scale by newSize / size about the origin.
// Stroke widths and styles are untouched; the doc's stroke width is never scaled.
export function scaleDoc<T extends Pick<BoardContent, 'size' | 'shapes'>>(
  doc: T,
  newSize: number,
): T {
  if (newSize === doc.size) return doc
  const k = newSize / doc.size
  const origin = { x: 0, y: 0 }
  return {
    ...doc,
    size: newSize,
    shapes: doc.shapes.map((s) => scaleAbout(s, k, k, origin)),
  }
}
