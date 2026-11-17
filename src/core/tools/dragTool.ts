import type { Command } from '../commands'
import type { PathShape, Pt } from '../model'
import type { SnapResult } from '../snap'
import type { OverlayPrimitive, Tool, ToolEvent, ToolHost } from './types'

export type DragSpec = {
  host: ToolHost
  label: string // undo label of the committed shape
  constrain: (anchor: Pt, p: Pt, e: ToolEvent) => Pt // applied after snapping; identity when no modifier applies
  shape: (anchor: Pt, end: Pt, e: ToolEvent) => PathShape | null // null = degenerate, nothing is created
}

// Creates the shape in one command that also selects it.
export function addShapeCommand(label: string, shape: PathShape): Command {
  return {
    label,
    recipe: (doc) => {
      doc.shapes.push(shape)
    },
    selectionAfter: { shapeIds: [shape.id], nodes: [] },
  }
}

// Snap indicator for the hit targets. Anchors become points, straight targets become axis lines.
export function snapIndicator(targets: SnapResult['targets']): OverlayPrimitive[] {
  const out: OverlayPrimitive[] = []
  for (const t of [targets.x, targets.y]) {
    if (!t) continue
    if (t.kind === 'anchor') {
      const dup = out.some((o) => o.kind === 'snapPoint' && o.p.x === t.p.x && o.p.y === t.p.y)
      if (!dup) out.push({ kind: 'snapPoint', p: t.p })
    } else if (t.kind === 'line') {
      out.push({ kind: 'snapLine', axis: t.axis, value: t.value })
    }
  }
  return out
}

// One press. `anchor` is the snapped start point (the center while Alt is held), and `vec` is the raw offset from it to
// the snapped pointer, before any Shift or Alt handling. While Space is held the shape moves: `vec` stays frozen, and
// `move` holds the pointer and anchor at the moment Space went down, which the pointer delta is measured from.
type Press = {
  anchor: Pt
  vec: Pt
  move: { pointer: Pt; anchor: Pt } | null
}

// Shared press / drag / release state machine for the Line, Rectangle and Ellipse tools.
// Every update rebuilds the draft from scratch from the press state and the live modifiers, so Shift, Alt and Space
// compose in any combination and can change at any point of the drag.
// Holding Space moves the shape being drawn instead of resizing it: the raw size is frozen and the start point shifts by
// the pointer delta (and snaps). Shift and Alt still apply to the frozen size. Releasing Space resumes resizing from
// the moved start point.
export function createDragTool(spec: DragSpec): Tool {
  let press: Press | null = null
  let draft: PathShape | null = null
  let targets: SnapResult['targets'] | null = null

  const reset = (): void => {
    press = null
    draft = null
    targets = null
  }

  const build = (e: ToolEvent, anchor: Pt, raw: Pt): Pt => {
    const end = spec.constrain(anchor, raw, e)
    draft = spec.shape(anchor, end, e)
    return end
  }

  const resize = (e: ToolEvent, p: Press): void => {
    const s = e.snap(e.pt)
    p.vec = { x: s.point.x - p.anchor.x, y: s.point.y - p.anchor.y }
    const end = build(e, p.anchor, s.point)
    // A modifier that moved the point off the snapped spot makes the target indicator misleading, so drop it.
    targets = end.x === s.point.x && end.y === s.point.y ? s.targets : null
  }

  const moveShape = (e: ToolEvent, p: Press): void => {
    if (!p.move) p.move = { pointer: e.pt, anchor: p.anchor }
    const { pointer, anchor } = p.move
    const s = e.snap({ x: anchor.x + (e.pt.x - pointer.x), y: anchor.y + (e.pt.y - pointer.y) })
    p.anchor = s.point
    targets = s.targets
    build(e, p.anchor, { x: p.anchor.x + p.vec.x, y: p.anchor.y + p.vec.y })
  }

  const update = (e: ToolEvent): void => {
    const p = press
    if (!p) return
    if (e.space) {
      moveShape(e, p)
    } else {
      p.move = null
      resize(e, p)
    }
  }

  return {
    cursor: 'crosshair',
    pointerDown(e) {
      const s = e.snap(e.pt)
      press = { anchor: s.point, vec: { x: 0, y: 0 }, move: null }
      draft = null
      targets = s.targets
    },
    pointerMove(e) {
      update(e)
    },
    pointerUp(e) {
      if (!press) return
      update(e)
      const shape = draft
      reset()
      if (shape) spec.host.dispatch(addShapeCommand(spec.label, shape))
    },
    pointerCancel: reset,
    keyDown(key) {
      if (key === 'Escape') reset()
    },
    overlay() {
      const out: OverlayPrimitive[] = []
      if (draft) out.push({ kind: 'draft', shape: draft })
      if (press && targets) out.push(...snapIndicator(targets))
      return out
    },
  }
}

// Equal sides from the anchor, extended in the direction the pointer is in (zero counts as positive).
export function squareFrom(anchor: Pt, p: Pt): Pt {
  const dx = p.x - anchor.x
  const dy = p.y - anchor.y
  const m = Math.max(Math.abs(dx), Math.abs(dy))
  return { x: anchor.x + (dx < 0 ? -m : m), y: anchor.y + (dy < 0 ? -m : m) }
}
