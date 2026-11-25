import {
  insertNode,
  moveNodesRecipe,
  selectedNodes,
  setNodeHandleRecipe,
} from '../commands/nodes'
import type { Recipe } from '../commands'
import type { Rect } from '../geometry/bounds'
import { nearestSegment } from '../geometry/nodes'
import { segmentBetween, segmentsOf } from '../geometry/segments'
import { resolveSegment, type NodeRef, type SegmentRef, type Selection } from '../history'
import type { IconDoc, PathShape, Pt } from '../model'
import type { EditorState } from '../store'
import { snapIndicator } from './dragTool'
import { DRAG_THRESHOLD_PX, HIT_TOLERANCE_PX, hitTestShape } from './selectTool'
import { buildSnapFn } from './snapFn'
import type { OverlayPrimitive, Tool, ToolEvent } from './types'

// What the Node tool needs from the store. The editor store satisfies it structurally.
export type NodeHost = {
  getState: () => Pick<EditorState, 'doc' | 'selection' | 'ui'>
  setSelection: (selection: Selection) => void
  dispatch: (command: { label: string; recipe: Recipe; selectionAfter?: Selection }) => void
  begin: (label: string) => void
  update: (recipe: Recipe) => void
  commit: (selectionAfter?: Selection) => void
  cancel: () => void
}

export type NodeTool = Tool & {
  doubleClick: (e: ToolEvent) => void
  // Hover tracking for when no gesture is active. The host calls it on plain pointer moves.
  hover: (e: ToolEvent) => void
  refreshHover: () => void
}

// What a press landed on. Handles and anchors belong to selected nodes or to the anchors of selected shapes. A segment
// belongs to a selected shape. `curve` is the segment as a cubic, for the hover highlight.
export type NodeHit =
  | { kind: 'handle'; ref: NodeRef; which: 'in' | 'out'; p: Pt }
  | { kind: 'anchor'; ref: NodeRef; p: Pt }
  | {
      kind: 'segment'
      ref: SegmentRef
      segIndex: number
      t: number
      point: Pt
      curve: { from: Pt; c1: Pt; c2: Pt; to: Pt }
    }

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)
const keyOf = (r: NodeRef): string => `${r.shapeId}\u0000${r.subpathId}\u0000${r.nodeId}`
const sameRef = (a: NodeRef, b: NodeRef): boolean => keyOf(a) === keyOf(b)

// The node under pt, in priority order: handles of selected nodes, then anchors of selected shapes, then segments of
// selected shapes. Within a class the nearest wins. Null when nothing is in reach.
// A handle counts only when it is longer than the tolerance. A shorter handle sits on its anchor, so the anchor wins.
// Reach is HIT_TOLERANCE_PX converted to doc units by zoom. Segments add half the stroke width, as selectTool does.
export function hitNode(doc: IconDoc, sel: Selection, pt: Pt, zoom: number): NodeHit | null {
  const tol = HIT_TOLERANCE_PX / zoom
  const shapes = doc.shapes.filter((s) => sel.shapeIds.includes(s.id))
  const selected = new Set(sel.nodes.map(keyOf))

  let handle: { hit: NodeHit; d: number } | null = null
  let anchor: { hit: NodeHit; d: number } | null = null
  for (const shape of shapes) {
    for (const sp of shape.subpaths) {
      for (const n of sp.nodes) {
        const ref: NodeRef = { shapeId: shape.id, subpathId: sp.id, nodeId: n.id }
        const d = dist(n.p, pt)
        if (d <= tol && (!anchor || d < anchor.d)) anchor = { hit: { kind: 'anchor', ref, p: n.p }, d }
        if (!selected.has(keyOf(ref))) continue
        for (const which of ['in', 'out'] as const) {
          const h = which === 'in' ? n.hIn : n.hOut
          if (!h || dist(h, n.p) <= tol) continue
          const hd = dist(h, pt)
          if (hd <= tol && (!handle || hd < handle.d)) handle = { hit: { kind: 'handle', ref, which, p: h }, d: hd }
        }
      }
    }
  }
  if (handle) return handle.hit
  if (anchor) return anchor.hit

  let best: { shape: PathShape; subpathIndex: number; segIndex: number; t: number; point: Pt; d: number } | null = null
  for (const shape of shapes) {
    const near = nearestSegment(shape, pt)
    if (!near) continue
    const reach = tol + (shape.style.strokeWidth ?? doc.strokeWidth) / 2
    if (near.distance > reach || (best && near.distance >= best.d)) continue
    best = { shape, subpathIndex: near.subpathIndex, segIndex: near.segIndex, t: near.t, point: near.point, d: near.distance }
  }
  if (!best) return null
  const sp = best.shape.subpaths[best.subpathIndex]
  const n = sp.nodes.length
  const seg = segmentBetween(best.segIndex, sp.nodes[best.segIndex], sp.nodes[(best.segIndex + 1) % n])
  return {
    kind: 'segment',
    ref: { shapeId: best.shape.id, subpathId: sp.id, fromId: seg.from.id, toId: seg.to.id },
    segIndex: best.segIndex,
    t: best.t,
    point: best.point,
    curve: { from: seg.from.p, c1: seg.c1, c2: seg.c2, to: seg.to.p },
  }
}

// Anchors of the selected shapes inside the rect (inclusive), as node refs.
function anchorsInRect(doc: IconDoc, shapeIds: readonly string[], r: Rect): NodeRef[] {
  const out: NodeRef[] = []
  for (const shape of doc.shapes) {
    if (!shapeIds.includes(shape.id)) continue
    for (const sp of shape.subpaths) {
      for (const n of sp.nodes) {
        if (n.p.x >= r.x && n.p.x <= r.x + r.w && n.p.y >= r.y && n.p.y <= r.y + r.h)
          out.push({ shapeId: shape.id, subpathId: sp.id, nodeId: n.id })
      }
    }
  }
  return out
}

function rectBetween(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}

// Neutral outline of every segment of the selected shapes. The Select tool draws it too, so it lives apart from the node
// display. Segments come from segmentsOf, the same source nearestSegment uses for hit testing, so outlines match hit targets.
export function selectionOutline(doc: IconDoc, sel: Selection): OverlayPrimitive[] {
  const out: OverlayPrimitive[] = []
  for (const shape of doc.shapes) {
    if (!sel.shapeIds.includes(shape.id)) continue
    for (const sp of shape.subpaths) {
      for (const seg of segmentsOf(sp)) out.push({ kind: 'segmentOutline', from: seg.from.p, c1: seg.c1, c2: seg.c2, to: seg.to.p })
    }
  }
  return out
}

// Static node display for the canvas, drawn at constant screen size by the UI. It starts with the segment outlines of the
// selected shapes, then every anchor of the selected shapes (selected nodes flagged) and the non-zero handles of the
// selected nodes, as handle lines. Outlines come first so anchors and handles draw over them.
export function nodeOverlay(doc: IconDoc, sel: Selection): OverlayPrimitive[] {
  const out: OverlayPrimitive[] = [...selectionOutline(doc, sel)]
  const picked = sel.segment && resolveSegment(doc, sel.segment)?.segment
  if (picked) out.push({ kind: 'segmentSelected', from: picked.from.p, c1: picked.c1, c2: picked.c2, to: picked.to.p })
  const selected = new Set(sel.nodes.map(keyOf))
  for (const shape of doc.shapes) {
    if (!sel.shapeIds.includes(shape.id)) continue
    for (const sp of shape.subpaths) {
      for (const n of sp.nodes) {
        const ref: NodeRef = { shapeId: shape.id, subpathId: sp.id, nodeId: n.id }
        out.push({ kind: 'anchor', p: n.p, selected: selected.has(keyOf(ref)) })
      }
    }
  }
  for (const r of selectedNodes(doc, sel)) {
    if (!sel.shapeIds.includes(r.ref.shapeId)) continue
    const { p, hIn, hOut } = r.node
    if (hIn && dist(hIn, p) > 0) out.push({ kind: 'handle', from: p, to: hIn })
    if (hOut && dist(hOut, p) > 0) out.push({ kind: 'handle', from: p, to: hOut })
  }
  return out
}

type Gesture =
  | { kind: 'segment'; start: Pt; dragged: boolean; ref: SegmentRef }
  | {
      kind: 'nodes' // press on an anchor: drags every selected node
      ref: Pt // pressed anchor at press; the reference point that snaps
      start: Pt
      refs: NodeRef[] // the selection's nodes once the press is applied
      pressed: NodeRef
      wasSelected: boolean
      shift: boolean
      dragged: boolean
      indicator: OverlayPrimitive[]
      before: Selection
    }
  | {
      kind: 'handle' // press on a handle: drags that handle
      ref: NodeRef
      which: 'in' | 'out'
      start: Pt
      dragged: boolean
      indicator: OverlayPrimitive[]
      before: Selection
    }
  | { kind: 'marquee'; start: Pt; rect: Rect; base: NodeRef[]; before: Selection }

// Node edit tool. Works on the nodes of the selected shapes (selection.shapeIds).
// - Press on an anchor selects it (Shift toggles; an already-selected node keeps the multi-selection so the group drags).
//   Dragging past DRAG_THRESHOLD_PX moves every selected node by the same delta. The pressed node's anchor is the snap
//   reference. Snap targets exclude the moving anchors. The gesture is one history entry.
// - Press on a handle of a selected node and drag: moveHandle with the snapped pointer, one entry. Node modes apply.
// - Click a segment to select it; double-click to insert and select an anchor at the projected t.
// - Press on the stroke of an unselected shape: selects that shape and clears the node selection (Shift adds the shape).
//   Selection only, no entry.
// - Press on empty space: marquee selects the anchors inside the rect (Shift adds). A plain press clears the node
//   selection first. Selection only, no entry.
// A press with no drag never changes the doc. Esc during a drag cancels it (host.cancel, no entry) and restores the
// selection from before the press. Esc with no gesture clears the node selection. Delete is not handled here: the
// shortcut layer dispatches deleteSelectedNodes.
export function createNodeTool(host: NodeHost): NodeTool {
  let gesture: Gesture | null = null
  let hoverPrim: OverlayPrimitive | null = null
  let hoverCursor = 'default'
  // Last pointer position seen by hover(), in doc space with the zoom it was measured at. Cleared when a press starts
  // and when the tool is deactivated, so a refresh never uses a point from before the press.
  let lastHover: { pt: Pt; zoom: number } | null = null

  const setHover = (hit: NodeHit | null, doc: IconDoc, pt: Pt, zoom: number, sel: Selection): void => {
    hoverPrim = null
    hoverCursor = 'default'
    if (hit?.kind === 'anchor') {
      hoverPrim = { kind: 'nodeHover', p: hit.p }
      hoverCursor = 'pointer'
    } else if (hit?.kind === 'handle') {
      hoverPrim = { kind: 'nodeHover', p: hit.p }
      hoverCursor = 'pointer'
    } else if (hit?.kind === 'segment') {
      hoverPrim = { kind: 'segmentHover', ...hit.curve }
      hoverCursor = 'pointer'
    } else {
      // Unselected shapes are the only shape hits that matter here: a press selects them.
      const others = { ...doc, shapes: doc.shapes.filter((s) => !sel.shapeIds.includes(s.id)) }
      const id = hitTestShape(others, pt, zoom)
      if (id !== null) hoverPrim = { kind: 'hover', shapeId: id }
    }
  }

  // The anchor moves by the delta from the press. The delta is the snapped reference point minus the press
  // reference, so the same delta moves every selected node.
  const moveNodes = (g: Extract<Gesture, { kind: 'nodes' }>, e: ToolEvent): void => {
    const snap = buildSnapFn(
      host.getState(),
      e.zoom,
      e.suspendSnap,
      new Set(),
      new Set(g.refs.map((r) => r.nodeId)),
      new Set(g.refs.map((r) => r.shapeId)),
    )
    const s = snap({ x: g.ref.x + (e.pt.x - g.start.x), y: g.ref.y + (e.pt.y - g.start.y) })
    host.update(moveNodesRecipe(g.refs, s.point.x - g.ref.x, s.point.y - g.ref.y))
    g.indicator = snapIndicator(s.targets)
  }

  const moveHandleTo = (g: Extract<Gesture, { kind: 'handle' }>, e: ToolEvent): void => {
    const snap = buildSnapFn(host.getState(), e.zoom, e.suspendSnap, new Set(), new Set([g.ref.nodeId]), new Set([g.ref.shapeId]))
    const s = snap(e.pt)
    host.update(setNodeHandleRecipe(g.ref, g.which, s.point))
    g.indicator = snapIndicator(s.targets)
  }

  // A press only becomes a drag once the pointer leaves the dead zone. After that the full offset applies.
  const passedThreshold = (g: { start: Pt; dragged: boolean }, e: ToolEvent): boolean => {
    if (!g.dragged && Math.hypot(e.pt.x - g.start.x, e.pt.y - g.start.y) * e.zoom >= DRAG_THRESHOLD_PX) g.dragged = true
    return g.dragged
  }

  const marqueeTo = (g: Extract<Gesture, { kind: 'marquee' }>, e: ToolEvent): void => {
    g.rect = rectBetween(g.start, e.pt)
    const { doc, selection } = host.getState()
    const hits = anchorsInRect(doc, g.before.shapeIds, g.rect)
    const nodes = [...g.base]
    for (const h of hits) if (!nodes.some((n) => sameRef(n, h))) nodes.push(h)
    host.setSelection({ shapeIds: selection.shapeIds, nodes })
  }

  // Esc and pointer cancel. Drag gestures revert the doc through cancel() (no entry) and restore the press-time selection.
  const cancelGesture = (): void => {
    const g = gesture
    gesture = null
    hoverCursor = 'default'
    if (!g || g.kind === 'segment') return
    if (g.kind !== 'marquee') host.cancel()
    host.setSelection(g.before)
  }

  return {
    get cursor() {
      return gesture ? 'move' : hoverCursor
    },

    doubleClick(e) {
      if (gesture || e.shift || e.alt || e.space || e.suspendSnap) return
      const { doc, selection } = host.getState()
      const hit = hitNode(doc, selection, e.pt, e.zoom)
      if (hit?.kind !== 'segment') return
      host.dispatch(insertNode(doc, selection, { ...hit.ref, segIndex: hit.segIndex, t: hit.t }))
    },

    pointerDown(e) {
      const { doc, selection } = host.getState()
      hoverPrim = null
      const hit = hitNode(doc, selection, e.pt, e.zoom)
      lastHover = null

      if (hit?.kind === 'handle') {
        host.begin('Move handle')
        gesture = { kind: 'handle', ref: hit.ref, which: hit.which, start: e.pt, dragged: false, indicator: [], before: selection }
        return
      }

      if (hit?.kind === 'anchor') {
        const wasSelected = selection.nodes.some((r) => sameRef(r, hit.ref))
        // Begin before the selection changes, so undo returns to the press-time selection.
        host.begin('Move nodes')
        let nodes = selection.nodes
        if (e.shift && !wasSelected) nodes = [...nodes, hit.ref]
        else if (!e.shift && !wasSelected) nodes = [hit.ref]
        if (nodes !== selection.nodes) host.setSelection({ shapeIds: selection.shapeIds, nodes })
        gesture = {
          kind: 'nodes',
          ref: hit.p,
          start: e.pt,
          refs: [...nodes],
          pressed: hit.ref,
          wasSelected,
          shift: e.shift,
          dragged: false,
          indicator: [],
          before: selection,
        }
        hoverCursor = 'move'
        return
      }

      if (hit?.kind === 'segment') {
        if (!e.shift && !e.alt && !e.suspendSnap && !e.space) {
          gesture = { kind: 'segment', start: e.pt, dragged: false, ref: hit.ref }
        }
        return
      }

      const other = hitTestShape({ ...doc, shapes: doc.shapes.filter((s) => !selection.shapeIds.includes(s.id)) }, e.pt, e.zoom)
      if (other !== null) {
        if (e.shift) host.setSelection({ shapeIds: [...selection.shapeIds, other], nodes: selection.nodes })
        else host.setSelection({ shapeIds: [other], nodes: [] })
        return
      }

      gesture = {
        kind: 'marquee',
        start: e.pt,
        rect: { x: e.pt.x, y: e.pt.y, w: 0, h: 0 },
        base: e.shift ? [...selection.nodes] : [],
        before: selection,
      }
      if (!e.shift || selection.segment) host.setSelection({ shapeIds: selection.shapeIds, nodes: [] })
    },

    pointerMove(e) {
      const g = gesture
      if (!g) {
        hover(e)
        return
      }
      if (g.kind === 'marquee') marqueeTo(g, e)
      else if (g.kind === 'segment') passedThreshold(g, e)
      else if (passedThreshold(g, e)) {
        if (g.kind === 'nodes') moveNodes(g, e)
        else moveHandleTo(g, e)
      }
    },

    pointerUp(e) {
      const g = gesture
      if (!g) return
      hoverCursor = 'default'
      if (g.kind === 'segment') {
        gesture = null
        const { doc, selection } = host.getState()
        if (!passedThreshold(g, e) && selection.shapeIds.includes(g.ref.shapeId) && resolveSegment(doc, g.ref)) {
          host.setSelection({ shapeIds: [g.ref.shapeId], nodes: [], segment: g.ref })
        }
        return
      }
      if (g.kind === 'marquee') {
        marqueeTo(g, e)
        gesture = null
        return
      }
      if (passedThreshold(g, e)) {
        if (g.kind === 'nodes') moveNodes(g, e)
        else moveHandleTo(g, e)
      }
      gesture = null
      if (g.kind === 'handle' || g.dragged) {
        host.commit()
        return
      }
      // A press with no drag is a click. Shift-click on a selected node removes it. A plain click on one node of a
      // multi-selection narrows the selection to it. Otherwise the selection stays as it is. No entry is created.
      const { selection } = host.getState()
      let after: Selection | undefined
      if (g.shift && g.wasSelected)
        after = { shapeIds: selection.shapeIds, nodes: selection.nodes.filter((r) => !sameRef(r, g.pressed)) }
      else if (!g.shift && g.wasSelected && selection.nodes.length > 1)
        after = { shapeIds: selection.shapeIds, nodes: [g.pressed] }
      host.commit(after)
    },

    pointerCancel() {
      cancelGesture()
    },

    keyDown(key) {
      if (key !== 'Escape') return
      if (gesture) {
        cancelGesture()
        return
      }
      const { selection } = host.getState()
      if (selection.nodes.length > 0 || selection.segment) host.setSelection({ shapeIds: selection.shapeIds, nodes: [] })
    },

    overlay() {
      const out: OverlayPrimitive[] = []
      const g = gesture
      if (g?.kind === 'marquee') out.push({ kind: 'marquee', rect: g.rect })
      else if (g && g.kind !== 'segment') out.push(...g.indicator)
      else if (hoverPrim) out.push(hoverPrim)
      return out
    },

    hover,

    refreshHover() {
      if (gesture || !lastHover) return
      applyHover(lastHover.pt, lastHover.zoom)
    },

    deactivate() {
      lastHover = null
      hoverPrim = null
      hoverCursor = 'default'
    },
  }

  function hover(e: ToolEvent): void {
    if (gesture) return
    lastHover = { pt: e.pt, zoom: e.zoom }
    applyHover(e.pt, e.zoom)
  }

  // Hover feedback for a point against the current doc and selection. Shared by pointer moves and refreshes.
  function applyHover(pt: Pt, zoom: number): void {
    const { doc, selection } = host.getState()
    setHover(hitNode(doc, selection, pt, zoom), doc, pt, zoom, selection)
  }
}
