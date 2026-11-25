import { segmentBetween, type Segment } from './geometry/segments'
import type { IconDoc, Subpath } from './model'

// Selection is UI state, not document data, so it lives beside history rather than inside the doc.
export type NodeRef = { shapeId: string; subpathId: string; nodeId: string }
// Direction matters: a two-anchor closed contour has both A→B and B→A.
export type SegmentRef = { shapeId: string; subpathId: string; fromId: string; toId: string }
export type Selection = { shapeIds: string[]; nodes: NodeRef[]; segment?: SegmentRef }

export function resolveSegment(doc: IconDoc, ref: SegmentRef): { subpath: Subpath; segment: Segment } | undefined {
  const subpath = doc.shapes.find((s) => s.id === ref.shapeId)?.subpaths.find((sp) => sp.id === ref.subpathId)
  if (!subpath || subpath.nodes.length < 2) return
  const { nodes, closed } = subpath
  const i = nodes.findIndex((n) => n.id === ref.fromId)
  if (i < 0 || (!closed && i === nodes.length - 1)) return
  const to = nodes[(i + 1) % nodes.length]
  if (to.id === ref.toId) return { subpath, segment: segmentBetween(i, nodes[i], to) }
}

export function withoutSegment(sel: Selection): Selection {
  return sel.segment ? { shapeIds: sel.shapeIds, nodes: sel.nodes } : sel
}


export const emptySelection: Selection = { shapeIds: [], nodes: [] }

// Each entry is an immutable doc snapshot pair, so undo and redo are reference swaps.
export type HistoryEntry = {
  label: string
  before: IconDoc
  after: IconDoc
  selectionBefore: Selection
  selectionAfter: Selection
}

export type HistoryState = { past: HistoryEntry[]; future: HistoryEntry[] }

export const HISTORY_LIMIT = 200
export const emptyHistory: HistoryState = { past: [], future: [] }

// Drops selection IDs that no longer exist in the doc (shapes, subpaths or nodes).
export function pruneSelection(sel: Selection, doc: IconDoc): Selection {
  const shapes = new Map(doc.shapes.map((s) => [s.id, s]))
  const hasNode = (ref: NodeRef): boolean => {
    const subpath = shapes.get(ref.shapeId)?.subpaths.find((sp) => sp.id === ref.subpathId)
    return subpath?.nodes.some((n) => n.id === ref.nodeId) ?? false
  }
  const next: Selection = {
    shapeIds: sel.shapeIds.filter((id) => shapes.has(id)),
    nodes: sel.nodes.filter(hasNode),
  }
  if (sel.segment && !sel.nodes.length && next.shapeIds.includes(sel.segment.shapeId) && resolveSegment(doc, sel.segment)) {
    next.segment = { ...sel.segment }
  }
  return next
}

// A new entry clears the redo stack and drops the oldest entry past HISTORY_LIMIT.
export function recordEntry(h: HistoryState, entry: HistoryEntry): HistoryState {
  const past = [...h.past, entry]
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT)
  return { past, future: [] }
}

export function stepBack(h: HistoryState): { history: HistoryState; entry: HistoryEntry } | null {
  const entry = h.past.at(-1)
  if (!entry) return null
  return { history: { past: h.past.slice(0, -1), future: [entry, ...h.future] }, entry }
}

export function stepForward(h: HistoryState): { history: HistoryState; entry: HistoryEntry } | null {
  const entry = h.future[0]
  if (!entry) return null
  return { history: { past: [...h.past, entry], future: h.future.slice(1) }, entry }
}
