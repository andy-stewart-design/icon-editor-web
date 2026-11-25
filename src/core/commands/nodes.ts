import type { Command, Recipe } from '../commands'
import {
  breakAtNodes,
  deleteNodes,
  insertNodeAt,
  moveAnchor,
  moveHandle,
  retractHandles,
  setNodeMode,
} from '../geometry/nodes'
import type { NodeRef, Selection } from '../history'
import type { IconDoc, PathNode, PathShape, Pt, Subpath } from '../model'

// Node commands. Each one is a single history entry. Recipes act on the node refs in the selection; a ref that no
// longer exists is skipped. Recipes work on plain copies of the nodes (see plainNode), never on immer drafts, so the
// same recipe can run again from a transaction base during a drag.
// Selection rule: node commands keep selection.shapeIds as they are, and set selection.nodes as described per command.

export type NodePanelMode = 'straight' | 'free' | 'smooth' | 'symmetric'

// A node ref resolved against the doc.
export type ResolvedNode = { ref: NodeRef; shape: PathShape; subpath: Subpath; node: PathNode }

// Panel state for the selected nodes. x and y are 'mixed' when the selected nodes differ on that axis.
// mode is the derived display mode of each node (see nodePanelMode), or 'mixed' when they differ.
export type NodePanelState = {
  count: number
  x: number | 'mixed'
  y: number | 'mixed'
  mode: NodePanelMode | 'mixed'
}

const EPS = 1e-6

const plainPt = (p: Pt): Pt => ({ x: p.x, y: p.y })

// Deep copy of a node, so pure geometry functions and immer drafts never mix.
export function plainNode(n: PathNode): PathNode {
  const out: PathNode = { id: n.id, p: plainPt(n.p), mode: n.mode }
  if (n.hIn) out.hIn = plainPt(n.hIn)
  if (n.hOut) out.hOut = plainPt(n.hOut)
  return out
}

const plainSubpath = (sp: Subpath): Subpath => ({
  id: sp.id,
  closed: sp.closed,
  nodes: sp.nodes.map(plainNode),
})

const plainShape = (s: PathShape): PathShape => ({
  id: s.id,
  type: s.type,
  style: { ...s.style },
  subpaths: s.subpaths.map(plainSubpath),
})

// Structural equality for plain JSON-like values, independent of key order.
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  const ka = Object.keys(ra)
  if (ka.length !== Object.keys(rb).length) return false
  return ka.every((k) => sameValue(ra[k], rb[k]))
}

// Groups the refs by shape and subpath, then applies f to each subpath that holds one of them. f gets a plain copy
// and returns the new subpath. A subpath is replaced only when its content changed, so a no-op edit keeps the doc
// reference and records no history entry.
function editSubpaths(refs: readonly NodeRef[], f: (sp: Subpath, nodeIds: ReadonlySet<string>) => Subpath): Recipe {
  const wanted = new Map<string, Set<string>>()
  for (const r of refs) {
    const key = `${r.shapeId}\u0000${r.subpathId}`
    const set = wanted.get(key) ?? new Set<string>()
    set.add(r.nodeId)
    wanted.set(key, set)
  }
  return (doc: IconDoc) => {
    for (const shape of doc.shapes) {
      shape.subpaths.forEach((sp, i) => {
        const ids = wanted.get(`${shape.id}\u0000${sp.id}`)
        if (!ids) return
        const before = plainSubpath(sp)
        const after = f(before, ids)
        if (!sameValue(before, after)) shape.subpaths[i] = after
      })
    }
  }
}

// Sets the anchor and handles of each listed node to the given anchor. Handles follow (see moveAnchor).
function moveNodesWith(sp: Subpath, ids: ReadonlySet<string>, target: (n: PathNode) => Pt): Subpath {
  return { ...sp, nodes: sp.nodes.map((n) => (ids.has(n.id) ? moveAnchor(n, target(n)) : n)) }
}

// Translates each listed node by (dx, dy) relative to the doc the recipe is applied to. Handles move with the anchor.
export function moveNodesRecipe(refs: readonly NodeRef[], dx: number, dy: number): Recipe {
  if (dx === 0 && dy === 0) return () => {}
  return editSubpaths(refs, (sp, ids) => moveNodesWith(sp, ids, (n) => ({ x: n.p.x + dx, y: n.p.y + dy })))
}

// Moves one handle of a node to pt. The node's mode is applied to the opposite handle (see moveHandle).
export function setNodeHandleRecipe(ref: NodeRef, which: 'in' | 'out', pt: Pt): Recipe {
  return editSubpaths([ref], (sp, ids) => ({
    ...sp,
    nodes: sp.nodes.map((n) => (ids.has(n.id) ? moveHandle(n, which, pt) : n)),
  }))
}

// Translates the selected nodes by (dx, dy). One entry. Used by nudging in node mode.
export function translateNodes(sel: Selection, dx: number, dy: number, label = 'Move nodes'): Command {
  return { label, recipe: moveNodesRecipe(sel.nodes, dx, dy), selectionAfter: sel }
}

// Sets the X and/or Y of every selected node to the given value. An omitted axis keeps each node's own value, so
// with several nodes selected, X = 5 puts all of them at x = 5 and leaves their Y values alone. Handles follow.
export function setNodePosition(sel: Selection, pos: { x?: number; y?: number }): Command {
  return {
    label: 'Set node position',
    recipe: editSubpaths(sel.nodes, (sp, ids) =>
      moveNodesWith(sp, ids, (n) => ({ x: pos.x ?? n.p.x, y: pos.y ?? n.p.y })),
    ),
    selectionAfter: sel,
  }
}

// Sets the panel mode of every selected node. The panel's four modes map to stored modes like this:
// - straight: mode corner with both handles removed.
// - free: mode corner. A node showing as straight (no real handles) gets handles first, the same ones smooth would
//   create, so Free does something visible; a node that already has handles keeps them untouched.
// - smooth and symmetric: setNodeMode, which creates handles on a handle-less node and aligns existing ones.
export function setSelectedNodesMode(sel: Selection, mode: NodePanelMode): Command {
  return {
    label: 'Set node mode',
    recipe: editSubpaths(sel.nodes, (sp, ids) => {
      let out = sp
      for (const id of ids) {
        if (mode === 'smooth' || mode === 'symmetric') {
          out = setNodeMode(out, id, mode)
        } else {
          if (mode === 'free') {
            const cur = out.nodes.find((n) => n.id === id)
            if (cur && nodePanelMode(cur) === 'straight') {
              out = setNodeMode({ ...out, nodes: out.nodes.map((n) => (n.id === id ? retractHandles(n) : n)) }, id, 'smooth')
            }
          }
          out = {
            ...out,
            nodes: out.nodes.map((n) =>
              n.id !== id ? n : mode === 'straight' ? { ...retractHandles(n), mode: 'corner' } : { ...n, mode: 'corner' },
            ),
          }
        }
      }
      return out
    }),
    selectionAfter: sel,
  }
}

// Inserts a node on segment segIndex of the subpath at parameter t, shape preserved (see insertNodeAt). The new node
// is selected (selectionAfter.nodes). An invalid segment or t leaves the doc unchanged and selects nothing new.
export function insertNode(
  doc: IconDoc,
  sel: Selection,
  at: { shapeId: string; subpathId: string; segIndex: number; t: number },
): Command {
  const shape = doc.shapes.find((s) => s.id === at.shapeId)
  const sp = shape?.subpaths.find((x) => x.id === at.subpathId)
  // Computed here, not in the recipe, so the new node's id is known when the command is built.
  const next = sp ? insertNodeAt(sp, at.segIndex, at.t) : undefined
  const known = new Set(sp?.nodes.map((n) => n.id))
  const added = next?.nodes.find((n) => !known.has(n.id))
  return {
    label: 'Insert node',
    recipe: (d) => {
      if (!added || !next) return
      const target = d.shapes.find((s) => s.id === at.shapeId)
      const idx = target?.subpaths.findIndex((x) => x.id === at.subpathId) ?? -1
      if (!target || idx < 0) return
      target.subpaths[idx] = plainSubpath(next)
    },
    selectionAfter: added
      ? { shapeIds: sel.shapeIds, nodes: [{ shapeId: at.shapeId, subpathId: at.subpathId, nodeId: added.id }] }
      : sel,
  }
}

// Deletes the selected nodes in one of two ways. 'break' (plain Delete) leaves the path open where the nodes were
// (see breakAtNodes). 'join' (Shift+Delete) reconnects the neighbours (see deleteNodes). A subpath with fewer than
// two nodes left is removed, and a shape with no subpaths left is removed from the doc. Removed shapes drop out of
// selection.shapeIds through dispatch's pruning, and selection.nodes is cleared.
export type DeleteNodesMode = 'break' | 'join'

export function deleteSelectedNodes(sel: Selection, mode: DeleteNodesMode): Command {
  const byShape = new Map<string, Set<string>>()
  for (const r of sel.nodes) {
    const set = byShape.get(r.shapeId) ?? new Set<string>()
    set.add(r.nodeId)
    byShape.set(r.shapeId, set)
  }
  const apply = mode === 'break' ? breakAtNodes : deleteNodes
  return {
    label: 'Delete nodes',
    recipe: (d) => {
      let changed = false
      const next: PathShape[] = []
      for (const shape of d.shapes) {
        const ids = byShape.get(shape.id)
        if (!ids) {
          next.push(shape)
          continue
        }
        const before = plainShape(shape)
        const after = apply(before, ids)
        if (after === before) {
          next.push(shape)
          continue
        }
        changed = true
        if (after) next.push(after)
      }
      if (changed) d.shapes = next
    },
    selectionAfter: { shapeIds: sel.shapeIds, nodes: [] },
  }
}

// Resolves the selected node refs against the doc. Refs that no longer exist are dropped.
export function selectedNodes(doc: IconDoc, sel: Selection): ResolvedNode[] {
  const out: ResolvedNode[] = []
  for (const ref of sel.nodes) {
    const shape = doc.shapes.find((s) => s.id === ref.shapeId)
    const subpath = shape?.subpaths.find((sp) => sp.id === ref.subpathId)
    const node = subpath?.nodes.find((n) => n.id === ref.nodeId)
    if (shape && subpath && node) out.push({ ref, shape, subpath, node })
  }
  return out
}

// Display mode of one node. A corner node with no non-zero handle reads as straight, a corner node with any
// non-zero handle as free, and smooth and symmetric nodes as stored.
export function nodePanelMode(node: PathNode): NodePanelMode {
  if (node.mode !== 'corner') return node.mode
  const bent = [node.hIn, node.hOut].some((h) => h !== undefined && Math.hypot(h.x - node.p.x, h.y - node.p.y) > 0)
  return bent ? 'free' : 'straight'
}

// Panel state for the selection, or null when no selected node exists in the doc.
export function nodePanelState(doc: IconDoc, sel: Selection): NodePanelState | null {
  const picked = selectedNodes(doc, sel)
  if (picked.length === 0) return null
  const axis = (vals: number[]): number | 'mixed' => (vals.every((v) => Math.abs(v - vals[0]) < EPS) ? vals[0] : 'mixed')
  const modes = picked.map((r) => nodePanelMode(r.node))
  return {
    count: picked.length,
    x: axis(picked.map((r) => r.node.p.x)),
    y: axis(picked.map((r) => r.node.p.y)),
    mode: modes.every((m) => m === modes[0]) ? modes[0] : 'mixed',
  }
}

// Build the edit only while the pinned geometry is current. The store uses immutable snapshots;
// comparing the subpaths reference allows unrelated changes (including style) to survive.
export function drawContour(doc: IconDoc, pinned: PathShape, next: Subpath, previous?: Subpath): Command | null {
  const target = doc.shapes.find((s) => s.id === pinned.id)
  if (!target || target.subpaths !== pinned.subpaths || next === previous) return null
  const index = previous ? target.subpaths.indexOf(previous) : -1
  if (previous && index < 0) return null
  return {
    label: 'Draw contour',
    recipe: (draft) => {
      const shape = draft.shapes.find((s) => s.id === pinned.id)
      if (!shape) return
      if (index < 0) shape.subpaths.push(next)
      else shape.subpaths[index] = next
    },
    selectionAfter: { shapeIds: [pinned.id], nodes: [] },
  }
}
