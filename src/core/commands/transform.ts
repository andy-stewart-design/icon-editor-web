import type { Command, Recipe } from '../commands'
import { selectionBounds, type Rect } from '../geometry/bounds'
import { flipH, flipV, rotateAbout, scaleAbout } from '../geometry/transform'
import type { Selection } from '../history'
import type { IconDoc, PathShape, Pt } from '../model'

// Replaces each listed shape with f(shape). Coordinates are rewritten, so no transform or angle is ever stored,
// and stroke width is untouched. Recipes read only the doc they are given, so a drag can call them repeatedly
// from the transaction base without drift.
function mapShapes(
  ids: readonly string[],
  f: (shapes: PathShape[]) => (s: PathShape) => PathShape,
): Recipe {
  const set = new Set(ids)
  return (doc: IconDoc) => {
    const picked = doc.shapes.filter((s) => set.has(s.id))
    if (picked.length === 0) return
    const g = f(picked)
    doc.shapes = doc.shapes.map((s) => (set.has(s.id) ? g(s) : s))
  }
}

export type HandleId = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export type ResizeFactors = { sx: number; sy: number; anchor: Pt }

const MIN_SCALE = 1e-3

// Keeps a scale away from zero so a drag through the anchor never collapses the shape.
const safe = (k: number): number => (Math.abs(k) < MIN_SCALE ? (k < 0 ? -MIN_SCALE : MIN_SCALE) : k)

// Scale factors for dragging `handle` of `bounds` to `pt`. The anchor is the opposite edge or corner, which stays
// fixed. An edge handle changes one axis only. With keepAspect both axes scale by the same magnitude; for an edge
// handle the other axis then scales about the center of the bounds. With fromCenter (Alt) the anchor is the center
// of the bounds instead, so the shape grows or shrinks symmetrically about it.
export function resizeFactors(
  bounds: Rect,
  handle: HandleId,
  pt: Pt,
  keepAspect = false,
  fromCenter = false,
): ResizeFactors {
  const left = handle.includes('w')
  const right = handle.includes('e')
  const top = handle.includes('n')
  const bottom = handle.includes('s')
  const anchor: Pt = fromCenter
    ? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
    : {
        x: left ? bounds.x + bounds.w : right ? bounds.x : bounds.x + bounds.w / 2,
        y: top ? bounds.y + bounds.h : bottom ? bounds.y : bounds.y + bounds.h / 2,
      }
  // Distance from the anchor to the dragged edge at press: the full side, or half of it from the center.
  const reachW = fromCenter ? bounds.w / 2 : bounds.w
  const reachH = fromCenter ? bounds.h / 2 : bounds.h
  let sx = 1
  let sy = 1
  if ((left || right) && bounds.w > 0) sx = safe((pt.x - anchor.x) / (right ? reachW : -reachW))
  if ((top || bottom) && bounds.h > 0) sy = safe((pt.y - anchor.y) / (bottom ? reachH : -reachH))
  if (keepAspect) {
    const horizontal = left || right
    const vertical = top || bottom
    const m =
      horizontal && vertical ? Math.max(Math.abs(sx), Math.abs(sy)) : Math.abs(horizontal ? sx : sy)
    if (horizontal) sx = (sx < 0 ? -1 : 1) * m
    if (vertical) sy = (sy < 0 ? -1 : 1) * m
    if (!horizontal) sx = m
    if (!vertical) sy = m
  }
  return { sx, sy, anchor }
}

// Rotation, in radians, that takes the direction center→from to center→to. Shift rounds it to 15° steps.
export function rotationAngle(center: Pt, from: Pt, to: Pt, step15 = false): number {
  const a =
    Math.atan2(to.y - center.y, to.x - center.x) - Math.atan2(from.y - center.y, from.x - center.x)
  if (!step15) return a
  const step = Math.PI / 12
  return Math.round(a / step) * step
}

export function resizeRecipe(ids: readonly string[], sx: number, sy: number, anchor: Pt): Recipe {
  return mapShapes(ids, () => (s) => scaleAbout(s, sx, sy, anchor))
}

export function rotateRecipe(ids: readonly string[], angle: number, center: Pt): Recipe {
  return mapShapes(ids, () => (s) => rotateAbout(s, angle, center))
}

// Mirrors about the center of the selection's bounds.
export function flipRecipe(ids: readonly string[], axis: 'h' | 'v'): Recipe {
  return mapShapes(ids, (picked) => {
    const b = selectionBounds(picked)
    const c = b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: 0, y: 0 }
    return (s) => (axis === 'h' ? flipH(s, c.x) : flipV(s, c.y))
  })
}

export function resizeSelection(sel: Selection, sx: number, sy: number, anchor: Pt): Command {
  return {
    label: 'Resize',
    recipe: resizeRecipe(sel.shapeIds, sx, sy, anchor),
    selectionAfter: sel,
  }
}

export function rotateSelection(sel: Selection, angle: number, center: Pt): Command {
  return { label: 'Rotate', recipe: rotateRecipe(sel.shapeIds, angle, center), selectionAfter: sel }
}

export function flipSelection(sel: Selection, axis: 'h' | 'v'): Command {
  return {
    label: axis === 'h' ? 'Flip horizontal' : 'Flip vertical',
    recipe: flipRecipe(sel.shapeIds, axis),
    selectionAfter: sel,
  }
}
