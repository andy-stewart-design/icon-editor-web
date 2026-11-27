import { contentOfFirstBoard, workspaceWithShapes } from '../test-fixtures/artboard-workspace'
import { describe, expect, it } from 'vitest'
import { deleteSelectedNodes, translateNodes } from '../commands/nodes'
import { evalSegment, segmentsOf } from '../geometry/segments'
import { newId } from '../ids'
import type { NodeRef, Selection } from '../history'
import { type IconDoc, type PathNode, type PathShape, type Pt } from '../model'
import { createEditorStore } from '../store'
import { createNodeTool, hitNode, nodeOverlay, selectionOutline } from './nodeTool'
import type { ToolEvent } from './types'

const ZOOM = 16
const noSnap = (pt: Pt) => ({ point: pt, targets: { x: null, y: null } })
const ev = (x: number, y: number, o: Partial<ToolEvent> = {}): ToolEvent => ({
  pt: { x, y },
  zoom: ZOOM,
  shift: false,
  alt: false,
  space: false,
  suspendSnap: false,
  snap: noSnap,
  ...o,
})

const n = (p: Pt, extra: Partial<PathNode> = {}): PathNode => ({
  id: newId(),
  p,
  mode: 'corner',
  ...extra,
})
const shape = (nodes: PathNode[], closed = false): PathShape => ({
  id: newId(),
  type: 'path',
  style: {},
  subpaths: [{ id: newId(), closed, nodes }],
})
const refOf = (s: PathShape, node: PathNode): NodeRef => ({
  shapeId: s.id,
  subpathId: s.subpaths[0].id,
  nodeId: node.id,
})
const docWith = (shapes: PathShape[]): IconDoc => workspaceWithShapes(shapes)

// Editor with snapping off, so pointer positions are exact, and a node tool on top of it.
function setup(shapes: PathShape[], sel: Selection) {
  const store = createEditorStore(docWith(shapes))
  store.setUi({ snapEnabled: false, mode: 'node' })
  store.setSelection(sel)
  const tool = createNodeTool(store)
  return { store, tool }
}

const nodeOf = (store: ReturnType<typeof createEditorStore>, s: PathShape, id: string) =>
  store
    .getState()
    .doc.boards[0].shapes.find((x) => x.id === s.id)!
    .subpaths[0].nodes.find((x) => x.id === id)!

// Open cubic from (2, 20) to (22, 20) with both handles pulling up to y = 4.
function curveShape(): PathShape {
  const a = n({ x: 2, y: 20 }, { hOut: { x: 8, y: 4 } })
  const b = n({ x: 22, y: 20 }, { hIn: { x: 16, y: 4 } })
  return shape([a, b])
}

describe('node tool: segment selection and insertion', () => {
  it('one entry, curve unchanged within 0.01, new node selected', () => {
    const s = curveShape()
    const { store, tool } = setup([s], { shapeIds: [s.id], nodes: [] })
    const seg = segmentsOf(s.subpaths[0])[0]
    const mid = evalSegment(seg, 0.5)

    const before = store.getState()
    tool.pointerDown(ev(mid.x, mid.y))
    tool.pointerUp(ev(mid.x, mid.y))

    const picked = store.getState()
    expect(picked.doc).toBe(before.doc)
    expect(picked.history).toBe(before.history)
    expect(picked.selection).toEqual({
      shapeIds: [s.id],
      nodes: [],
      segment: {
        shapeId: s.id,
        subpathId: s.subpaths[0].id,
        fromId: seg.from.id,
        toId: seg.to.id,
      },
    })
    tool.hover(ev(25, 25))
    expect(
      nodeOverlay(contentOfFirstBoard(picked.doc), picked.selection).some(
        (p) => p.kind === 'segmentSelected',
      ),
    ).toBe(true)
    tool.doubleClick(ev(mid.x, mid.y))

    const after = store.getState()
    expect(store.getState().history.past).toHaveLength(1)
    const nodes = after.doc.boards[0].shapes[0].subpaths[0].nodes
    expect(nodes).toHaveLength(3)
    expect(after.selection.nodes).toHaveLength(1)
    expect(after.selection.nodes[0].nodeId).toBe(nodes[1].id)

    // Every sampled point of the original curve lies on the new curve (checked against dense samples of both halves).
    const newSegs = segmentsOf(after.doc.boards[0].shapes[0].subpaths[0])
    const dense = newSegs.flatMap((sg) =>
      Array.from({ length: 4001 }, (_, k) => evalSegment(sg, k / 4000)),
    )
    for (let i = 0; i <= 64; i++) {
      const p = evalSegment(seg, i / 64)
      const d = Math.min(...dense.map((q) => Math.hypot(q.x - p.x, q.y - p.y)))
      expect(d).toBeLessThan(0.01)
    }
  })
})

describe('node tool: handle drag (AC21)', () => {
  it('symmetric mirrors the opposite handle; smooth keeps its length; one entry per drag', () => {
    const endA = n({ x: 2, y: 12 })
    const sym = n(
      { x: 12, y: 12 },
      { mode: 'symmetric', hIn: { x: 9, y: 12 }, hOut: { x: 15, y: 12 } },
    )
    const endB = n({ x: 22, y: 12 })
    const s = shape([endA, sym, endB])
    const { store, tool } = setup([s], { shapeIds: [s.id], nodes: [refOf(s, sym)] })

    tool.pointerDown(ev(15, 12))
    tool.pointerMove(ev(15, 6))
    tool.pointerUp(ev(15, 6))
    const out = nodeOf(store, s, sym.id)
    expect(out.hOut).toEqual({ x: 15, y: 6 })
    expect(out.hIn!.x).toBeCloseTo(9)
    expect(out.hIn!.y).toBeCloseTo(18)
    expect(store.getState().history.past).toHaveLength(1)
    expect(store.getState().history.past[0].label).toBe('Move handle')
  })

  it('cycles an outgoing drag using the live opposite, updates the scene, and undoes as one gesture', () => {
    const node = n(
      { x: 12, y: 12 },
      {
        mode: 'symmetric',
        hIn: { x: 9, y: 12 },
        hOut: { x: 15, y: 12 },
      },
    )
    const s = shape([n({ x: 2, y: 12 }), node, n({ x: 22, y: 12 })])
    const selection = { shapeIds: [s.id], nodes: [refOf(s, node)] }
    const { store, tool } = setup([s], selection)
    const state = store.getState
    const current = () => nodeOf(store, s, node.id)
    const before = state().doc
    tool.pointerDown(ev(15, 12))
    expect(tool.cycleHandleMode?.()).toBe(false)
    tool.pointerMove(ev(18, 12))
    expect(tool.cycleHandleMode?.()).toBe(true)
    expect(current()).toMatchObject({ mode: 'smooth', hIn: { x: 6, y: 12 } })
    tool.pointerMove(ev(12, 16))
    expect(current().hIn).toEqual({ x: 12, y: 6 })
    tool.cycleHandleMode?.()
    tool.pointerMove(ev(15, 12))
    expect(current()).toMatchObject({ mode: 'corner', hIn: { x: 12, y: 6 } })
    tool.cycleHandleMode?.()
    expect(current()).toMatchObject({ mode: 'symmetric', hIn: { x: 9, y: 12 } })
    expect(nodeOverlay(contentOfFirstBoard(state().doc), state().selection)).toContainEqual({
      kind: 'handle',
      from: node.p,
      to: { x: 9, y: 12 },
    })
    expect(state().history.past).toHaveLength(0)
    tool.pointerUp(ev(15, 12))
    expect(state().doc).toBe(before) // Back at the original geometry and mode: no entry.
    expect(state().history.past).toHaveLength(0)
    tool.pointerDown(ev(15, 12))
    tool.pointerMove(ev(18, 12))
    tool.cycleHandleMode?.()
    tool.pointerUp(ev(18, 12))
    expect(state().history.past).toHaveLength(1)
    expect(state().selection).toEqual(selection)
    store.undo()
    expect(state().doc).toEqual(before)
    expect(state().selection).toEqual(selection)
  })

  it.each([undefined, { x: 12, y: 12 }])(
    'cancels an incoming Free drag with opposite %j',
    (hOut) => {
      const node = n({ x: 12, y: 12 }, { hIn: { x: 9, y: 12 }, ...(hOut && { hOut }) })
      const s = shape([n({ x: 2, y: 12 }), node, n({ x: 22, y: 12 })])
      const selection = { shapeIds: [s.id], nodes: [refOf(s, node)] }
      const { store, tool } = setup([s], selection)
      const before = store.getState().doc
      tool.pointerDown(ev(9, 12))
      tool.pointerMove(ev(12, 8))
      expect(nodeOf(store, s, node.id).hOut).toEqual(hOut)
      expect(tool.cycleHandleMode?.()).toBe(true)
      expect(nodeOf(store, s, node.id)).toMatchObject({ mode: 'symmetric', hOut: { x: 12, y: 16 } })
      tool.keyDown('Escape')
      expect(store.getState().doc).toBe(before)
      expect(store.getState().selection).toEqual(selection)
      expect(store.getState().history.past).toHaveLength(0)
      expect(tool.cycleHandleMode?.()).toBe(false)
    },
  )

  it('smooth keeps the opposite handle length and direction-opposed', () => {
    const endA = n({ x: 2, y: 12 })
    const smooth = n(
      { x: 12, y: 12 },
      { mode: 'smooth', hIn: { x: 9, y: 12 }, hOut: { x: 18, y: 12 } },
    )
    const endB = n({ x: 22, y: 12 })
    const s = shape([endA, smooth, endB])
    const { store, tool } = setup([s], { shapeIds: [s.id], nodes: [refOf(s, smooth)] })

    tool.pointerDown(ev(18, 12))
    tool.pointerMove(ev(15, 6))
    tool.pointerUp(ev(15, 6))
    const out = nodeOf(store, s, smooth.id)
    expect(out.hOut).toEqual({ x: 15, y: 6 })
    // The opposite handle keeps its length of 3 and points the other way.
    expect(Math.hypot(out.hIn!.x - 12, out.hIn!.y - 12)).toBeCloseTo(3)
    expect(out.hIn!.x).toBeCloseTo(12 - ((15 - 12) / Math.hypot(3, 6)) * 3)
    expect(out.hIn!.y).toBeCloseTo(12 + (6 / Math.hypot(3, 6)) * 3)
    expect(store.getState().history.past).toHaveLength(1)
  })
})

describe('node tool: selection and gestures', () => {
  // Three corner nodes on an open path, all anchors at y = 12.
  const threeNodes = () => {
    const a = n({ x: 2, y: 12 })
    const b = n({ x: 12, y: 12 })
    const c = n({ x: 22, y: 12 })
    return { s: shape([a, b, c]), a, b, c }
  }

  it('a click on an anchor with no drag selects it, moves nothing, and adds no entry', () => {
    const { s, b } = threeNodes()
    const { store, tool } = setup([s], { shapeIds: [s.id], nodes: [] })
    const doc0 = store.getState().doc
    tool.pointerDown(ev(12, 12))
    tool.pointerUp(ev(12, 12))
    expect(store.getState().selection.nodes).toEqual([refOf(s, b)])
    expect(store.getState().doc).toBe(doc0)
    expect(store.getState().history.past).toHaveLength(0)
  })

  it('dragging a selected group moves all nodes as one entry', () => {
    const { s, a, c } = threeNodes()
    const { store, tool } = setup([s], { shapeIds: [s.id], nodes: [refOf(s, a), refOf(s, c)] })

    tool.pointerDown(ev(2, 12))
    tool.pointerMove(ev(5, 12))
    tool.pointerUp(ev(5, 12))
    expect(nodeOf(store, s, a.id).p).toEqual({ x: 5, y: 12 })
    expect(nodeOf(store, s, c.id).p).toEqual({ x: 25, y: 12 })
    expect(store.getState().history.past).toHaveLength(1)
  })

  it('Esc mid-drag restores the doc reference with no entry and the press-time selection', () => {
    const { s, a, c } = threeNodes()
    const { store, tool } = setup([s], { shapeIds: [s.id], nodes: [refOf(s, a), refOf(s, c)] })
    const doc0 = store.getState().doc
    const sel0 = store.getState().selection

    tool.pointerDown(ev(2, 12))
    tool.pointerMove(ev(8, 12))
    expect(nodeOf(store, s, a.id).p.x).toBe(8)
    tool.keyDown('Escape')
    expect(store.getState().doc).toBe(doc0)
    expect(store.getState().history.past).toHaveLength(0)
    expect(store.getState().selection).toEqual(sel0)
    expect(store.getState().tx).toBeNull()
  })

  it('marquee over empty space selects the anchors inside it, with no entry', () => {
    const { s, a, b, c } = threeNodes()
    const { store, tool } = setup([s], { shapeIds: [s.id], nodes: [] })
    tool.pointerDown(ev(0, 0))
    tool.pointerMove(ev(24, 24))
    expect(tool.overlay()).toEqual([{ kind: 'marquee', rect: { x: 0, y: 0, w: 24, h: 24 } }])
    tool.pointerUp(ev(24, 24))
    expect(store.getState().selection.nodes).toEqual([refOf(s, a), refOf(s, b), refOf(s, c)])
    expect(store.getState().history.past).toHaveLength(0)
  })

  it('a plain empty press clears node selection, and Esc with no gesture does too', () => {
    const { s, a } = threeNodes()
    const { store, tool } = setup([s], { shapeIds: [s.id], nodes: [refOf(s, a)] })
    tool.pointerDown(ev(40, 40))
    tool.pointerUp(ev(40, 40))
    expect(store.getState().selection.nodes).toEqual([])
    store.setSelection({ shapeIds: [s.id], nodes: [refOf(s, a)] })
    tool.keyDown('Escape')
    expect(store.getState().selection.nodes).toEqual([])
  })
})

describe('node tool: snapping while dragging', () => {
  it("snaps the dragged anchor to the grid, not to its own shape's bounds", () => {
    const a = n({ x: 2, y: 4 })
    const b = n({ x: 10, y: 4 })
    const s = shape([a, b])
    const store = createEditorStore(docWith([s])) // snapping on, increment 0.5
    store.setSelection({ shapeIds: [s.id], nodes: [refOf(s, b)] })
    const tool = createNodeTool(store)

    tool.pointerDown(ev(10, 4))
    tool.pointerMove(ev(12.2, 9.1))
    tool.pointerUp(ev(12.2, 9.1))
    // b is the rightmost and lowest point, so its own bounds edges sit exactly under the pointer; they must not win.
    expect(nodeOf(store, s, b.id).p).toEqual({ x: 12, y: 9 })
  })
})

describe('node deletion (AC22)', () => {
  it('deleting down to one node removes the shape; one undo restores it', () => {
    const a = n({ x: 2, y: 12 })
    const b = n({ x: 12, y: 12 })
    const c = n({ x: 22, y: 12 })
    const s = shape([a, b, c])
    const store = createEditorStore(docWith([s]))
    store.setSelection({ shapeIds: [s.id], nodes: [refOf(s, a), refOf(s, b)] })

    store.dispatch(deleteSelectedNodes(store.getState().selection, 'break'))
    expect(store.getState().doc.boards[0].shapes).toHaveLength(0)
    expect(store.getState().selection.shapeIds).toEqual([])
    expect(store.getState().history.past).toHaveLength(1)

    store.undo()
    expect(store.getState().doc.boards[0].shapes[0].subpaths[0].nodes).toHaveLength(3)
    // Undo returns to the selection from before the delete.
    expect(store.getState().selection.nodes).toEqual([refOf(s, a), refOf(s, b)])
  })
})

describe('node tool hit testing and overlay', () => {
  it('handles of selected nodes win over anchors, and unselected nodes show no handles', () => {
    const a = n({ x: 2, y: 12 })
    const b = n({ x: 12, y: 12 }, { hOut: { x: 16, y: 12 } })
    const s = shape([a, b])
    const doc = docWith([s])
    const sel = { shapeIds: [s.id], nodes: [] }
    expect(
      hitNode(contentOfFirstBoard(doc), { ...sel, nodes: [refOf(s, b)] }, { x: 16, y: 12 }, ZOOM)
        ?.kind,
    ).toBe('handle')
    // Not selected: the handle is not hit, and nothing is in reach there.
    expect(hitNode(contentOfFirstBoard(doc), sel, { x: 16, y: 12 }, ZOOM)).toBeNull()

    const overlay = nodeOverlay(contentOfFirstBoard(doc), { ...sel, nodes: [refOf(s, b)] })
    expect(overlay.filter((p) => p.kind === 'anchor')).toHaveLength(2)
    expect(overlay.filter((p) => p.kind === 'handle')).toEqual([
      { kind: 'handle', from: { x: 12, y: 12 }, to: { x: 16, y: 12 } },
    ])
  })

  it('emits one segment outline per segment of selected shapes, closing segment included, and none for unselected shapes', () => {
    const open = shape([n({ x: 0, y: 0 }), n({ x: 10, y: 0 }), n({ x: 10, y: 10 })])
    const closed = shape(
      [n({ x: 0, y: 0 }), n({ x: 10, y: 0 }), n({ x: 10, y: 10 }), n({ x: 0, y: 10 })],
      true,
    )
    const other = shape([n({ x: 50, y: 50 }), n({ x: 60, y: 50 })])
    const doc = docWith([open, closed, other])
    const outlines = (ids: string[]) =>
      nodeOverlay(contentOfFirstBoard(doc), { shapeIds: ids, nodes: [] }).filter(
        (p) => p.kind === 'segmentOutline',
      )
    expect(outlines([open.id])).toHaveLength(2)
    expect(outlines([closed.id])).toHaveLength(4)
    expect(outlines([other.id, open.id])).toHaveLength(3)
    expect(outlines([])).toHaveLength(0)
  })

  it('selectionOutline returns only the segment outlines that nodeOverlay starts with', () => {
    const open = shape([n({ x: 0, y: 0 }), n({ x: 10, y: 0 }), n({ x: 10, y: 10 })])
    const doc = docWith([open])
    const sel = { shapeIds: [open.id], nodes: [] }
    expect(selectionOutline(contentOfFirstBoard(doc), sel)).toHaveLength(2)
    expect(nodeOverlay(contentOfFirstBoard(doc), sel).slice(0, 2)).toEqual(
      selectionOutline(contentOfFirstBoard(doc), sel),
    )
  })
})

describe('node tool hover refresh after a doc change without pointer movement', () => {
  // Straight segment from a (2, 20) to b (22, 20). The pointer sits on it at (12, 20).
  function straight() {
    const a = n({ x: 2, y: 20 })
    const b = n({ x: 22, y: 20 })
    const s = shape([a, b])
    return { s, a, b }
  }

  it('resets the segment hover highlight and cursor when the segment moves away', () => {
    const { s, a, b } = straight()
    const { store, tool } = setup([s], { shapeIds: [s.id], nodes: [refOf(s, b)] })
    tool.hover(ev(12, 20))
    expect(tool.overlay().some((p) => p.kind === 'segmentHover')).toBe(true)
    expect(tool.cursor).toBe('pointer')

    store.dispatch(translateNodes(store.getState().selection, 0, 20))
    tool.refreshHover()
    expect(tool.overlay().some((p) => p.kind === 'segmentHover')).toBe(false)
    expect(tool.cursor).toBe('default')
    expect(nodeOf(store, s, b.id).p).toEqual({ x: 22, y: 40 })
    expect(nodeOf(store, s, a.id).p).toEqual({ x: 2, y: 20 })
  })

  it('updates the segment highlight to the new geometry while the pointer is still on the segment', () => {
    const { s, a } = straight()
    const { store, tool } = setup([s], {
      shapeIds: [s.id],
      nodes: [{ shapeId: s.id, subpathId: s.subpaths[0].id, nodeId: a.id }],
    })
    tool.hover(ev(12, 20))

    store.dispatch(translateNodes(store.getState().selection, -2, 0))
    tool.refreshHover()
    const hl = tool.overlay().find((p) => p.kind === 'segmentHover')
    expect(hl).toBeDefined()
    const seg = segmentsOf(store.getState().doc.boards[0].shapes[0].subpaths[0])[0]
    expect(hl).toEqual({
      kind: 'segmentHover',
      from: seg.from.p,
      c1: seg.c1,
      c2: seg.c2,
      to: seg.to.p,
    })
    expect(hl).toMatchObject({ from: { x: 0, y: 20 }, to: { x: 22, y: 20 } })
  })

  it('does nothing before any hover position is known', () => {
    const { s, b } = straight()
    const { store, tool } = setup([s], {
      shapeIds: [s.id],
      nodes: [{ shapeId: s.id, subpathId: s.subpaths[0].id, nodeId: b.id }],
    })
    store.dispatch(translateNodes(store.getState().selection, 0, 20))
    tool.refreshHover()
    expect(tool.overlay()).toEqual([])
  })
})
