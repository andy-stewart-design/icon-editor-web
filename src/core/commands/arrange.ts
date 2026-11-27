import type { Command } from '../commands'
import { emptySelection, type Selection } from '../history'
import { newId } from '../ids'
import type { BoardContent, PathShape } from '../model'

// Deep copy with fresh ids for the shape, its subpaths and its nodes.
export function cloneWithNewIds(shape: PathShape): PathShape {
  return {
    ...shape,
    id: newId(),
    style: { ...shape.style },
    subpaths: shape.subpaths.map((sp) => ({
      ...sp,
      id: newId(),
      nodes: sp.nodes.map((n) => ({
        ...n,
        id: newId(),
        p: { ...n.p },
        ...(n.hIn && { hIn: { ...n.hIn } }),
        ...(n.hOut && { hOut: { ...n.hOut } }),
      })),
    })),
  }
}

// Each copy goes directly above its original, and the copies become the selection. Ids are made here, when the
// command is built, so the recipe is deterministic and selectionAfter can name them.
export function duplicateSelection(doc: BoardContent, sel: Selection): Command {
  const picked = new Set(sel.shapeIds)
  const copies = new Map<string, PathShape>()
  for (const s of doc.shapes) if (picked.has(s.id)) copies.set(s.id, cloneWithNewIds(s))
  return {
    label: 'Duplicate',
    recipe: (d) => {
      if (copies.size === 0) return
      d.shapes = d.shapes.flatMap((s) => {
        const copy = copies.get(s.id)
        return copy ? [s, copy] : [s]
      })
    },
    selectionAfter: { shapeIds: [...copies.values()].map((c) => c.id), nodes: [] },
  }
}

export function deleteSelection(sel: Selection): Command {
  const picked = new Set(sel.shapeIds)
  return {
    label: 'Delete',
    recipe: (d) => {
      if (!d.shapes.some((s) => picked.has(s.id))) return
      d.shapes = d.shapes.filter((s) => !picked.has(s.id))
    },
    selectionAfter: emptySelection,
  }
}

// One step forward: each selected shape swaps with the unselected shape above it, so the selection keeps its
// relative order. At the top nothing moves, and the doc is left unchanged.
export function bringForward(sel: Selection): Command {
  const picked = new Set(sel.shapeIds)
  return {
    label: 'Bring forward',
    recipe: (d) => {
      const a = [...d.shapes]
      let moved = false
      for (let i = a.length - 2; i >= 0; i--) {
        if (picked.has(a[i].id) && !picked.has(a[i + 1].id)) {
          ;[a[i], a[i + 1]] = [a[i + 1], a[i]]
          moved = true
        }
      }
      if (moved) d.shapes = a
    },
    selectionAfter: sel,
  }
}

export function sendBackward(sel: Selection): Command {
  const picked = new Set(sel.shapeIds)
  return {
    label: 'Send backward',
    recipe: (d) => {
      const a = [...d.shapes]
      let moved = false
      for (let i = 1; i < a.length; i++) {
        if (picked.has(a[i].id) && !picked.has(a[i - 1].id)) {
          ;[a[i], a[i - 1]] = [a[i - 1], a[i]]
          moved = true
        }
      }
      if (moved) d.shapes = a
    },
    selectionAfter: sel,
  }
}
