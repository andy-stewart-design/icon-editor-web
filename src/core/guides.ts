import type { Rect } from './geometry/bounds'

// Keyline guides. Defined at the 24-unit base and scaled by size / 24. All are centered on the artboard.

export const GUIDE_BASE_SIZE = 24

export type GuideName = 'padding' | 'circle' | 'square' | 'portrait' | 'landscape'

// A straight target line. A vertical line has axis 'x' and value = its x coordinate.
export type SnapLine = {
  axis: 'x' | 'y'
  value: number
  source: 'edge' | 'center' | 'guide'
}

export type Guide =
  | { name: GuideName; kind: 'rect'; rect: Rect; snapLines: SnapLine[] }
  | { name: GuideName; kind: 'circle'; cx: number; cy: number; r: number; snapLines: SnapLine[] }

// Base-24 definitions. Rects give width/height; circles give diameter.
type GuideDef = { name: GuideName; kind: 'rect'; w: number; h: number } | { name: GuideName; kind: 'circle'; d: number }

export const GUIDE_DEFS: readonly GuideDef[] = [
  { name: 'padding', kind: 'rect', w: 20, h: 20 },
  { name: 'circle', kind: 'circle', d: 22 },
  { name: 'square', kind: 'rect', w: 20, h: 20 },
  { name: 'portrait', kind: 'rect', w: 16, h: 20 },
  { name: 'landscape', kind: 'rect', w: 20, h: 16 },
]

// Edges and center of a box, as the lines a snap can hit.
function boxLines(x: number, y: number, w: number, h: number): SnapLine[] {
  const cx = x + w / 2
  const cy = y + h / 2
  return [
    { axis: 'x', value: x, source: 'guide' },
    { axis: 'x', value: x + w, source: 'guide' },
    { axis: 'x', value: cx, source: 'guide' },
    { axis: 'y', value: y, source: 'guide' },
    { axis: 'y', value: y + h, source: 'guide' },
    { axis: 'y', value: cy, source: 'guide' },
  ]
}

export function guidesFor(size: number): Guide[] {
  const s = size / GUIDE_BASE_SIZE
  const c = size / 2
  return GUIDE_DEFS.map((def): Guide => {
    if (def.kind === 'circle') {
      const r = (def.d * s) / 2
      const snapLines = boxLines(c - r, c - r, 2 * r, 2 * r)
      return { name: def.name, kind: 'circle', cx: c, cy: c, r, snapLines }
    }
    const w = def.w * s
    const h = def.h * s
    const x = c - w / 2
    const y = c - h / 2
    return { name: def.name, kind: 'rect', rect: { x, y, w, h }, snapLines: boxLines(x, y, w, h) }
  })
}
