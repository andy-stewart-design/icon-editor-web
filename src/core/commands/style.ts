import type { Command, Recipe } from '../commands'
import { selectionBounds, type Rect } from '../geometry/bounds'
import { scaleAbout, translate } from '../geometry/transform'
import type { Selection } from '../history'
import type { IconDoc, Linecap, Linejoin, PathShape, Style } from '../model'
import { isValidBoundsCoord, isValidBoundsSize } from '../validation'

// Per-shape style overrides. Each field is either absent (inherit the doc default) or set on the shape.
export type StyleField = 'strokeWidth' | 'linecap' | 'linejoin'
export type StyleValue<F extends StyleField> = Exclude<Style[F], undefined>

// Writes one style field on every listed shape. Shapes whose value already matches are left alone, so a no-op
// yields an unchanged doc.
function setStyleField<F extends StyleField>(ids: readonly string[], field: F, value: StyleValue<F>): Recipe {
  const set = new Set(ids)
  return (doc) => {
    for (const s of doc.shapes) {
      if (set.has(s.id) && s.style[field] !== value) s.style[field] = value
    }
  }
}

// Deletes the key rather than setting it to undefined. The serializer checks `!== undefined`, so both emit no
// attribute, but an absent key matches the stored shape and keeps the JSON clean.
function resetStyleField(ids: readonly string[], field: StyleField): Recipe {
  const set = new Set(ids)
  return (doc) => {
    for (const s of doc.shapes) {
      if (set.has(s.id) && field in s.style) delete s.style[field]
    }
  }
}

function overrideCommand<F extends StyleField>(sel: Selection, field: F, value: StyleValue<F>, label: string): Command {
  return { label, recipe: setStyleField(sel.shapeIds, field, value), selectionAfter: sel }
}

function resetCommand(sel: Selection, field: StyleField, label: string): Command {
  return { label, recipe: resetStyleField(sel.shapeIds, field), selectionAfter: sel }
}

// Override commands apply to every selected shape. The selection is kept.
export const setStrokeWidthOverride = (sel: Selection, width: number): Command =>
  overrideCommand(sel, 'strokeWidth', width, 'Stroke width override')
export const setLinecapOverride = (sel: Selection, cap: Linecap): Command =>
  overrideCommand(sel, 'linecap', cap, 'Linecap override')
export const setLinejoinOverride = (sel: Selection, join: Linejoin): Command =>
  overrideCommand(sel, 'linejoin', join, 'Linejoin override')

export const resetStrokeWidth = (sel: Selection): Command => resetCommand(sel, 'strokeWidth', 'Reset stroke width')
export const resetLinecap = (sel: Selection): Command => resetCommand(sel, 'linecap', 'Reset linecap')
export const resetLinejoin = (sel: Selection): Command => resetCommand(sel, 'linejoin', 'Reset linejoin')

// What the panel shows for one field across the selection.
// none: nothing selected. same: every selected shape has the same effective value; overridden is true only when
// every one of them sets its own. mixed: effective values differ.
export type FieldState<V> = { kind: 'none' } | { kind: 'same'; value: V; overridden: boolean } | { kind: 'mixed' }

// Selected shapes in doc order. Stale ids in the selection are skipped.
function selectedShapes(doc: IconDoc, sel: Selection): PathShape[] {
  const ids = new Set(sel.shapeIds)
  return doc.shapes.filter((s) => ids.has(s.id))
}

// The effective value falls back to the doc default when a shape has no override.
export function selectionField<F extends StyleField>(
  doc: IconDoc,
  sel: Selection,
  field: F,
): FieldState<StyleValue<F>> {
  const shapes = selectedShapes(doc, sel)
  if (shapes.length === 0) return { kind: 'none' }
  const effective = (s: PathShape): StyleValue<F> => (s.style[field] ?? doc[field]) as StyleValue<F>
  const first = effective(shapes[0])
  if (!shapes.every((s) => effective(s) === first)) return { kind: 'mixed' }
  return { kind: 'same', value: first, overridden: shapes.every((s) => s.style[field] !== undefined) }
}

// True when any selected shape sets an override for the field. The panel uses this to enable Reset.
export function selectionHasOverride(doc: IconDoc, sel: Selection, field: StyleField): boolean {
  return selectedShapes(doc, sel).some((s) => s.style[field] !== undefined)
}

// Current combined geometry bounds of the selection, or null when nothing selected has geometry.
export function selectionRect(doc: IconDoc, sel: Selection): Rect | null {
  const b = selectionBounds(selectedShapes(doc, sel))
  return b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null
}

// Moves and scales the selection so its combined bounds become (x, y, w, h). Scaling is about the current bounds
// origin, then translation. A dimension that is currently 0 (a horizontal line has h = 0) keeps scale 1, and a
// requested size for that axis is ignored. Stroke widths are never touched. Invalid targets make the command a no-op.
export function setSelectionBounds(sel: Selection, x: number, y: number, w: number, h: number): Command {
  return {
    label: 'Set bounds',
    recipe: (doc) => {
      if (!isValidBoundsCoord(x) || !isValidBoundsCoord(y)) return
      const ids = new Set(sel.shapeIds)
      const b = selectionBounds(doc.shapes.filter((s) => ids.has(s.id)))
      if (!b) return
      const scalesX = b.w > 0
      const scalesY = b.h > 0
      if ((scalesX && !isValidBoundsSize(w)) || (scalesY && !isValidBoundsSize(h))) return
      const sx = scalesX ? w / b.w : 1
      const sy = scalesY ? h / b.h : 1
      const dx = x - b.x
      const dy = y - b.y
      if (sx === 1 && sy === 1 && dx === 0 && dy === 0) return
      // Scaling about the min corner keeps that corner fixed, so the translation lands the box exactly on (x, y).
      const origin = { x: b.x, y: b.y }
      doc.shapes = doc.shapes.map((s) => (ids.has(s.id) ? translate(scaleAbout(s, sx, sy, origin), dx, dy) : s))
    },
    selectionAfter: sel,
  }
}
