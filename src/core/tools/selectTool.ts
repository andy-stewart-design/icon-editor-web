import { resizeFactors, resizeRecipe, rotateRecipe, rotationAngle, type HandleId } from '../commands/transform'
import { translateRecipe } from '../commands/selection'
import type { Recipe } from '../commands'
import type { Selection } from '../history'
import { selectionBounds, type Rect } from '../geometry/bounds'
import { distanceToShape, shapeIntersectsRect } from '../geometry/hit'
import type { IconDoc, Pt } from '../model'
import type { EditorState } from '../store'
import { snapIndicator } from './dragTool'
import { handleCursor, hitHandle, type HandleHit } from './handles'
import { buildSnapFn } from './snapFn'
import type { OverlayPrimitive, Tool, ToolEvent } from './types'

// Screen px of slop around the centreline, on top of half the stroke width.
export const HIT_TOLERANCE_PX = 6

// Screen px the pointer must travel from the press before a press on a shape counts as a drag. Until then the
// shape doesn't move, so a click never snaps it to the grid.
export const DRAG_THRESHOLD_PX = 3

// What the Select tool needs from the store. The editor store satisfies it structurally.
export type SelectHost = {
  getState: () => Pick<EditorState, 'doc' | 'selection' | 'ui'>
  setSelection: (selection: Selection) => void
  begin: (label: string) => void
  update: (recipe: Recipe) => void
  commit: (selectionAfter?: Selection) => void
  cancel: () => void
}

export type SelectTool = Tool & {
  // Hover tracking for when no gesture is active. The host calls it on plain pointer moves.
  hover: (e: ToolEvent) => void
}

// Topmost shape whose stroke covers pt. Reach is the tolerance in doc units (6 screen px ÷ zoom) plus half the
// stroke width, so a point just outside a 1.5 stroke still hits. Null when nothing is in reach.
export function hitTestShape(doc: IconDoc, pt: Pt, zoom: number): string | null {
  const tolerance = HIT_TOLERANCE_PX / zoom
  for (let i = doc.shapes.length - 1; i >= 0; i--) {
    const shape = doc.shapes[i]
    const reach = tolerance + (shape.style.strokeWidth ?? doc.strokeWidth) / 2
    if (distanceToShape(shape, pt) <= reach) return shape.id
  }
  return null
}

// Shapes whose geometry intersects the marquee, in z-order.
export function shapesInRect(doc: IconDoc, rect: Rect): string[] {
  return doc.shapes.filter((s) => shapeIntersectsRect(s, rect)).map((s) => s.id)
}

function rectBetween(a: Pt, b: Pt): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}

const unionIds = (base: readonly string[], more: readonly string[]): string[] => [
  ...base,
  ...more.filter((id) => !base.includes(id)),
]

type Move = {
  kind: 'move'
  start: Pt // pointer at press
  ref: Pt // top-left of the selection bounds at press; the reference point that snaps
  ids: string[] // shapes moved by the gesture
  pressed: string // shape under the pointer at press
  wasSelected: boolean // pressed shape was selected before this press
  shift: boolean
  dragged: boolean // pointer moved away from start at least once
  indicator: OverlayPrimitive[] // snap targets hit by the last update
}

// Dragging a resize handle. The bounds at press stay the reference, so each update rebuilds from the base doc.
type Resize = { kind: 'resize'; handle: HandleId; bounds: Rect; ids: string[]; indicator: OverlayPrimitive[] }

// Dragging the rotate handle. The angle is measured from the pointer at press around the bounds center.
type Rotate = { kind: 'rotate'; center: Pt; start: Pt; ids: string[] }

type Marquee = {
  kind: 'marquee'
  start: Pt
  rect: Rect
  base: string[] // selection ids kept under Shift
  selectionBefore: Selection
}

// Select tool. Click selects the topmost shape in reach, Shift-click toggles, and empty press clears (or marquees).
// Press-drag on a shape moves the selection as one history transaction. Esc during a move restores the
// pre-drag doc without a history entry.
export function createSelectTool(host: SelectHost): SelectTool {
  let mode: Move | Marquee | Resize | Rotate | null = null
  let hovered: string | null = null
  let hoverCursor = 'default' // cursor while no gesture is active: the handle arrow under the pointer, if any

  // The handle of the current selection under the pointer. A Shift-press on a shape toggles it instead, even when
  // a handle sits on the shape's own stroke.
  const handleUnder = (e: ToolEvent): { hit: HandleHit; bounds: Rect } | null => {
    const { doc, selection } = host.getState()
    const bounds = selectionBounds(doc.shapes.filter((s) => selection.shapeIds.includes(s.id)))
    if (!bounds || (e.shift && hitTestShape(doc, e.pt, e.zoom) !== null)) return null
    const hit = hitHandle(bounds, e.pt, e.zoom)
    return hit ? { hit, bounds } : null
  }

  // Moves the selection by the offset that puts the reference point on a snapped spot. The snap ignores the
  // moving shapes, so they don't stick to their own anchors.
  const moveTo = (m: Move, e: ToolEvent): void => {
    const snap = buildSnapFn(host.getState(), e.zoom, e.suspendSnap, new Set(m.ids))
    const dx = e.pt.x - m.start.x
    const dy = e.pt.y - m.start.y
    const s = snap({ x: m.ref.x + dx, y: m.ref.y + dy })
    host.update(translateRecipe(m.ids, s.point.x - m.ref.x, s.point.y - m.ref.y))
    m.indicator = snapIndicator(s.targets)
  }

  const noop: Recipe = () => {}

  // The dragged edge or corner snaps; the opposite side stays fixed.
  const resizeTo = (m: Resize, e: ToolEvent): void => {
    const snap = buildSnapFn(host.getState(), e.zoom, e.suspendSnap, new Set(m.ids))
    const s = snap(e.pt)
    const { sx, sy, anchor } = resizeFactors(m.bounds, m.handle, s.point, e.shift)
    host.update(sx === 1 && sy === 1 ? noop : resizeRecipe(m.ids, sx, sy, anchor))
    m.indicator = e.shift ? [] : snapIndicator(s.targets)
  }

  const rotateTo = (m: Rotate, e: ToolEvent): void => {
    const angle = rotationAngle(m.center, m.start, e.pt, e.shift)
    host.update(angle === 0 ? noop : rotateRecipe(m.ids, angle, m.center))
  }

  const marqueeTo = (m: Marquee, e: ToolEvent): void => {
    m.rect = rectBetween(m.start, e.pt)
    const hits = shapesInRect(host.getState().doc, m.rect)
    host.setSelection({ shapeIds: unionIds(m.base, hits), nodes: [] })
  }

  // A press only becomes a move once the pointer leaves the dead zone. After that the shape follows the full offset.
  const pressMove = (e: ToolEvent, m: Move): void => {
    if (!m.dragged && Math.hypot(e.pt.x - m.start.x, e.pt.y - m.start.y) * e.zoom >= DRAG_THRESHOLD_PX) m.dragged = true
    if (m.dragged) moveTo(m, e)
  }

  return {
    get cursor() {
      if (mode?.kind === 'resize') return handleCursor(mode.handle)
      if (mode?.kind === 'rotate') return 'grabbing'
      return hoverCursor
    },

    pointerDown(e) {
      const { doc, selection } = host.getState()
      hovered = null

      // Handles of the current selection come before shape hits.
      const under = handleUnder(e)
      const selBounds = under?.bounds ?? null
      const grabbed = under?.hit ?? null
      hoverCursor = handleCursor(grabbed)
      if (selBounds && grabbed) {
        const ids = [...selection.shapeIds]
        if (grabbed === 'rotate') {
          host.begin('Rotate')
          mode = { kind: 'rotate', center: { x: selBounds.x + selBounds.w / 2, y: selBounds.y + selBounds.h / 2 }, start: e.pt, ids }
        } else {
          host.begin('Resize')
          mode = { kind: 'resize', handle: grabbed, bounds: selBounds, ids, indicator: [] }
        }
        return
      }

      const pressed = hitTestShape(doc, e.pt, e.zoom)

      if (pressed === null) {
        mode = {
          kind: 'marquee',
          start: e.pt,
          rect: { x: e.pt.x, y: e.pt.y, w: 0, h: 0 },
          base: e.shift ? [...selection.shapeIds] : [],
          selectionBefore: selection,
        }
        if (!e.shift) host.setSelection({ shapeIds: [], nodes: [] })
        return
      }

      const wasSelected = selection.shapeIds.includes(pressed)
      // The transaction starts before the selection changes, so undo returns to the selection from before this press.
      host.begin('Move')
      let ids = selection.shapeIds
      if (e.shift && !wasSelected) ids = [...ids, pressed]
      else if (!e.shift && !wasSelected) ids = [pressed]
      if (ids !== selection.shapeIds) host.setSelection({ ...selection, shapeIds: ids })

      const bounds = selectionBounds(doc.shapes.filter((s) => ids.includes(s.id)))
      mode = {
        kind: 'move',
        start: e.pt,
        ref: bounds ? { x: bounds.x, y: bounds.y } : { x: e.pt.x, y: e.pt.y },
        ids: [...ids],
        pressed,
        wasSelected,
        shift: e.shift,
        dragged: false,
        indicator: [],
      }
      pressMove(e, mode)
    },

    pointerMove(e) {
      if (mode?.kind === 'resize') resizeTo(mode, e)
      else if (mode?.kind === 'rotate') rotateTo(mode, e)
      else if (mode?.kind === 'move') pressMove(e, mode)
      else if (mode?.kind === 'marquee') marqueeTo(mode, e)
      else hover(e)
    },

    pointerUp(e) {
      const m = mode
      if (!m) return
      hoverCursor = 'default'
      if (m.kind === 'marquee') {
        marqueeTo(m, e)
        mode = null
        return
      }
      if (m.kind === 'resize' || m.kind === 'rotate') {
        if (m.kind === 'resize') resizeTo(m, e)
        else rotateTo(m, e)
        mode = null
        host.commit()
        return
      }
      pressMove(e, m)
      mode = null
      // A press with no drag is a click. Shift-click on a selected shape removes it. A plain click on one shape
      // of a multi-selection narrows the selection to it. Otherwise the selection stays as it is.
      let after: Selection | undefined
      if (!m.dragged) {
        const { selection } = host.getState()
        if (m.shift && m.wasSelected) {
          after = { shapeIds: selection.shapeIds.filter((id) => id !== m.pressed), nodes: [] }
        } else if (!m.shift && m.wasSelected && selection.shapeIds.length > 1) {
          after = { shapeIds: [m.pressed], nodes: [] }
        }
      }
      host.commit(after)
    },

    pointerCancel() {
      cancelGesture()
    },

    keyDown(key) {
      if (key === 'Escape') cancelGesture()
    },

    overlay() {
      const out: OverlayPrimitive[] = []
      if (mode?.kind === 'marquee') out.push({ kind: 'marquee', rect: mode.rect })
      else if (mode?.kind === 'move' || mode?.kind === 'resize') out.push(...mode.indicator)
      else if (hovered !== null) out.push({ kind: 'hover', shapeId: hovered })
      return out
    },

    hover,
  }

  // Esc and pointer cancel. A move reverts the doc through cancel(), which drops the transaction without an entry.
  // A marquee restores the selection from before the press.
  function cancelGesture(): void {
    const m = mode
    mode = null
    hoverCursor = 'default'
    if (m?.kind === 'move' || m?.kind === 'resize' || m?.kind === 'rotate') host.cancel()
    else if (m?.kind === 'marquee') host.setSelection(m.selectionBefore)
  }

  function hover(e: ToolEvent): void {
    if (mode) return
    hoverCursor = handleCursor(handleUnder(e)?.hit ?? null)
    hovered = hitTestShape(host.getState().doc, e.pt, e.zoom)
  }
}
