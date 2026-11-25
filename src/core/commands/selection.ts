import type { Command, Recipe } from '../commands'
import type { Selection } from '../history'
import type { IconDoc } from '../model'

// Selects every shape. Recipe is a no-op, so dispatch records no history entry and only the selection changes.
export function selectAll(doc: IconDoc): Command {
  return {
    label: 'Select all',
    recipe: () => {},
    selectionAfter: { shapeIds: doc.shapes.map((s) => s.id), nodes: [] },
  }
}

// Moves every anchor and handle of the listed shapes by (dx, dy). A zero offset leaves the doc reference unchanged.
export function translateRecipe(shapeIds: readonly string[], dx: number, dy: number): Recipe {
  const ids = new Set(shapeIds)
  return (doc) => {
    if (dx === 0 && dy === 0) return
    for (const shape of doc.shapes) {
      if (!ids.has(shape.id)) continue
      for (const sp of shape.subpaths) {
        for (const n of sp.nodes) {
          n.p = { x: n.p.x + dx, y: n.p.y + dy }
          if (n.hIn) n.hIn = { x: n.hIn.x + dx, y: n.hIn.y + dy }
          if (n.hOut) n.hOut = { x: n.hOut.x + dx, y: n.hOut.y + dy }
        }
      }
    }
  }
}

// Translates the selected shapes. The selection itself is kept.
export function translateSelection(
  sel: Selection,
  dx: number,
  dy: number,
  label = 'Move',
): Command {
  return { label, recipe: translateRecipe(sel.shapeIds, dx, dy), selectionAfter: sel }
}

export type NudgeDir = 'left' | 'right' | 'up' | 'down'

// Nudge step in doc units. Uses the snap increment even when snapping is off; Shift is always 1 unit.
export function nudgeAmount(increment: number, shift: boolean): number {
  return shift ? 1 : increment
}

const DIR: Record<NudgeDir, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
}

// One arrow press is one command, so each press is its own history entry.
export function nudgeSelection(
  sel: Selection,
  dir: NudgeDir,
  increment: number,
  shift: boolean,
): Command {
  const step = nudgeAmount(increment, shift)
  const [ux, uy] = DIR[dir]
  return translateSelection(sel, ux * step, uy * step, 'Nudge')
}
