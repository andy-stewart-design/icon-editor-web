import { translateRecipe } from '../commands/selection'
import type { Recipe } from '../commands'
import type { Selection } from '../history'
import { selectionBounds, type Rect } from '../geometry/bounds'
import { distanceToShape, shapeIntersectsRect } from '../geometry/hit'
import type { IconDoc, Pt } from '../model'
import type { EditorState } from '../store'
import { snapIndicator } from './dragTool'
import { buildSnapFn } from './snapFn'
import type { OverlayPrimitive, Tool, ToolEvent } from './types'

// Screen px of slop around the centreline, on top of half the stroke width.
export const HIT_TOLERANCE_PX = 6

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
  let mode: Move | Marquee | null = null
  let hovered: string | null = null

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

  const marqueeTo = (m: Marquee, e: ToolEvent): void => {
    m.rect = rectBetween(m.start, e.pt)
    const hits = shapesInRect(host.getState().doc, m.rect)
    host.setSelection({ shapeIds: unionIds(m.base, hits), nodes: [] })
  }

  const pressMove = (e: ToolEvent, m: Move): void => {
    if (e.pt.x !== m.start.x || e.pt.y !== m.start.y) m.dragged = true
    moveTo(m, e)
  }

  return {
    cursor: 'default',

    pointerDown(e) {
      const { doc, selection } = host.getState()
      const pressed = hitTestShape(doc, e.pt, e.zoom)
      hovered = null

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
      if (mode?.kind === 'move') pressMove(e, mode)
      else if (mode?.kind === 'marquee') marqueeTo(mode, e)
      else hover(e)
    },

    pointerUp(e) {
      const m = mode
      if (!m) return
      if (m.kind === 'marquee') {
        marqueeTo(m, e)
        mode = null
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
      else if (mode?.kind === 'move') out.push(...mode.indicator)
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
    if (m?.kind === 'move') host.cancel()
    else if (m?.kind === 'marquee') host.setSelection(m.selectionBefore)
  }

  function hover(e: ToolEvent): void {
    if (mode) return
    hovered = hitTestShape(host.getState().doc, e.pt, e.zoom)
  }
}
