import { contentOfFirstBoard, workspaceWithShapes } from '../test-fixtures/artboard-workspace'
import { describe, expect, it } from 'vitest'
import { newId } from '../ids'
import { resolveSegment, type NodeRef } from '../history'
import { type IconDoc, type PathNode, type PathShape, type Pt } from '../model'
import { createEditorStore } from '../store'
import {
  cutSelectedSegment,
  deleteSelectedNodes,
  nodePanelState,
  setNodePosition,
  setSelectedNodesMode,
} from './nodes'

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
const nodesOf = (doc: IconDoc, s: PathShape) =>
  doc.boards[0].shapes.find((x) => x.id === s.id)!.subpaths[0].nodes

describe('node position (AC31)', () => {
  it('X = 5 moves the anchor and its handles follow by the same delta', () => {
    const a = n({ x: 2, y: 2 }, { hOut: { x: 4, y: 2 } })
    const b = n({ x: 10, y: 10 })
    const s = shape([a, b])
    const store = createEditorStore(docWith([s]))
    store.dispatch(setNodePosition({ shapeIds: [s.id], nodes: [refOf(s, a)] }, { x: 5 }))
    const out = nodesOf(store.getState().doc, s)[0]
    expect(out.p).toEqual({ x: 5, y: 2 })
    expect(out.hOut).toEqual({ x: 7, y: 2 })
    expect(store.getState().history.past).toHaveLength(1)
  })

  it('with several nodes, the value applies to each and the other axis is kept per node', () => {
    const a = n({ x: 2, y: 2 })
    const b = n({ x: 10, y: 6 })
    const s = shape([a, b])
    const store = createEditorStore(docWith([s]))
    store.dispatch(
      setNodePosition({ shapeIds: [s.id], nodes: [refOf(s, a), refOf(s, b)] }, { x: 5 }),
    )
    expect(nodesOf(store.getState().doc, s).map((x) => x.p)).toEqual([
      { x: 5, y: 2 },
      { x: 5, y: 6 },
    ])
  })
})

describe('node mode commands', () => {
  // A corner node with a bent handle, and a handle-less corner in the middle of an open path.
  const build = () => {
    const a = n({ x: 2, y: 4 }, { hOut: { x: 5, y: 4 } })
    const m = n({ x: 12, y: 12 })
    const b = n({ x: 20, y: 4 })
    return { s: shape([a, m, b]), a, m, b }
  }

  it('straight removes both handles of a corner node; free keeps them', () => {
    const { s, a } = build()
    const store = createEditorStore(docWith([s]))
    const sel = { shapeIds: [s.id], nodes: [refOf(s, a)] }
    store.dispatch(setSelectedNodesMode(sel, 'free'))
    expect(nodesOf(store.getState().doc, s)[0]).toEqual({
      id: a.id,
      p: { x: 2, y: 4 },
      mode: 'corner',
      hOut: { x: 5, y: 4 },
    })
    store.dispatch(setSelectedNodesMode(sel, 'straight'))
    expect(nodesOf(store.getState().doc, s)[0]).toEqual({
      id: a.id,
      p: { x: 2, y: 4 },
      mode: 'corner',
    })
  })

  it('symmetric creates equal-length mirrored handles on a handle-less node; smooth creates collinear ones', () => {
    const { s, m } = build()
    const store = createEditorStore(docWith([s]))
    store.dispatch(setSelectedNodesMode({ shapeIds: [s.id], nodes: [refOf(s, m)] }, 'symmetric'))
    const sym = nodesOf(store.getState().doc, s)[1]
    expect(sym.mode).toBe('symmetric')
    const lenIn = Math.hypot(sym.hIn!.x - sym.p.x, sym.hIn!.y - sym.p.y)
    const lenOut = Math.hypot(sym.hOut!.x - sym.p.x, sym.hOut!.y - sym.p.y)
    expect(lenIn).toBeGreaterThan(0)
    expect(lenOut).toBeCloseTo(lenIn)
    expect(sym.hIn!.x + sym.hOut!.x).toBeCloseTo(2 * sym.p.x)
    expect(sym.hIn!.y + sym.hOut!.y).toBeCloseTo(2 * sym.p.y)

    store.dispatch(setSelectedNodesMode({ shapeIds: [s.id], nodes: [refOf(s, m)] }, 'smooth'))
    const smooth = nodesOf(store.getState().doc, s)[1]
    expect(smooth.mode).toBe('smooth')
    expect(smooth.hIn).toBeDefined()
    expect(smooth.hOut).toBeDefined()
    const cross =
      (smooth.hIn!.x - smooth.p.x) * (smooth.hOut!.y - smooth.p.y) -
      (smooth.hIn!.y - smooth.p.y) * (smooth.hOut!.x - smooth.p.x)
    expect(Math.abs(cross)).toBeLessThan(1e-9)
  })

  it('free on a straight node creates handles but keeps the node free (corner)', () => {
    const { s, m } = build()
    const store = createEditorStore(docWith([s]))
    const sel = { shapeIds: [s.id], nodes: [refOf(s, m)] }
    store.dispatch(setSelectedNodesMode(sel, 'free'))
    const node = nodesOf(store.getState().doc, s)[1]
    expect(node.mode).toBe('corner')
    expect(node.hIn).toBeDefined()
    expect(node.hOut).toBeDefined()
    expect(nodePanelState(contentOfFirstBoard(store.getState().doc), sel)?.mode).toBe('free')
    expect(store.getState().history.past).toHaveLength(1)
  })

  it('a mode change that changes nothing keeps the doc reference (no entry)', () => {
    const { s, a } = build()
    const store = createEditorStore(docWith([s]))
    const before = store.getState().doc
    store.dispatch(setSelectedNodesMode({ shapeIds: [s.id], nodes: [refOf(s, a)] }, 'free'))
    expect(store.getState().doc).toBe(before)
    expect(store.getState().history.past).toHaveLength(0)
  })
})

describe('node panel state', () => {
  it('returns null with no resolved node selected', () => {
    const s = shape([n({ x: 1, y: 1 }), n({ x: 5, y: 5 })])
    expect(
      nodePanelState(contentOfFirstBoard(docWith([s])), { shapeIds: [s.id], nodes: [] }),
    ).toBeNull()
  })

  it('derives straight, free, smooth and symmetric; reports mixed values', () => {
    const straight = n({ x: 1, y: 1 })
    const zeroHandle = n({ x: 3, y: 1 }, { hIn: { x: 3, y: 1 } }) // zero-length handle counts as absent
    const free = n({ x: 5, y: 1 }, { hOut: { x: 6, y: 3 } })
    const smooth = n({ x: 7, y: 1 }, { mode: 'smooth', hIn: { x: 6, y: 1 }, hOut: { x: 8, y: 1 } })
    const sym = n({ x: 9, y: 1 }, { mode: 'symmetric', hIn: { x: 8, y: 1 }, hOut: { x: 10, y: 1 } })
    const s = shape([straight, zeroHandle, free, smooth, sym])
    const doc = docWith([s])
    const sel = (...ns: PathNode[]) => ({ shapeIds: [s.id], nodes: ns.map((x) => refOf(s, x)) })

    expect(nodePanelState(contentOfFirstBoard(doc), sel(straight))).toEqual({
      count: 1,
      x: 1,
      y: 1,
      mode: 'straight',
    })
    expect(nodePanelState(contentOfFirstBoard(doc), sel(zeroHandle))?.mode).toBe('straight')
    expect(nodePanelState(contentOfFirstBoard(doc), sel(free))?.mode).toBe('free')
    expect(nodePanelState(contentOfFirstBoard(doc), sel(smooth))?.mode).toBe('smooth')
    expect(nodePanelState(contentOfFirstBoard(doc), sel(sym))?.mode).toBe('symmetric')
    expect(nodePanelState(contentOfFirstBoard(doc), sel(straight, free))).toEqual({
      count: 2,
      x: 'mixed',
      y: 1,
      mode: 'mixed',
    })
    expect(nodePanelState(contentOfFirstBoard(doc), sel(straight, zeroHandle))).toEqual({
      count: 2,
      x: 'mixed',
      y: 1,
      mode: 'straight',
    })
  })
})

describe('deleteSelectedNodes (AC22, R13)', () => {
  const closed4 = (): PathShape =>
    shape([n({ x: 0, y: 0 }), n({ x: 10, y: 0 }), n({ x: 10, y: 10 }), n({ x: 0, y: 10 })], true)

  it("'break' leaves the path open; one history entry; one undo restores the doc exactly", () => {
    const s = closed4()
    const store = createEditorStore(docWith([s]))
    const before = JSON.stringify(store.getState().doc)
    const sp = s.subpaths[0]
    store.setSelection({
      shapeIds: [s.id],
      nodes: [{ shapeId: s.id, subpathId: sp.id, nodeId: sp.nodes[1].id }],
    })

    store.dispatch(deleteSelectedNodes(store.getState().selection, 'break'))
    const after = store.getState().doc.boards[0].shapes[0].subpaths
    expect(after).toHaveLength(1)
    expect(after[0].closed).toBe(false)
    expect(after[0].nodes).toHaveLength(3)
    expect(store.getState().history.past).toHaveLength(1)

    store.undo()
    expect(JSON.stringify(store.getState().doc)).toBe(before)
    expect(store.getState().history.past).toHaveLength(0)
  })

  it("'join' keeps the path closed (Shift+Delete behaviour)", () => {
    const s = closed4()
    const store = createEditorStore(docWith([s]))
    const sp = s.subpaths[0]
    store.setSelection({
      shapeIds: [s.id],
      nodes: [{ shapeId: s.id, subpathId: sp.id, nodeId: sp.nodes[1].id }],
    })
    store.dispatch(deleteSelectedNodes(store.getState().selection, 'join'))
    const out = store.getState().doc.boards[0].shapes[0].subpaths[0]
    expect(out.closed).toBe(true)
    expect(out.nodes).toHaveLength(3)
  })
})

describe('cut selected segment', () => {
  it('resolves the closing edge, opens it in one entry and restores selection with undo only in Node Select', () => {
    const [a, b] = [n({ x: 2, y: 5 }), n({ x: 10, y: 5 })]
    const s = shape([a, b], true)
    const other = shape([a, b])
    const doc = docWith([s, other])
    const store = createEditorStore(doc)
    store.setUi({ mode: 'node' })
    const segment = { shapeId: s.id, subpathId: s.subpaths[0].id, fromId: b.id, toId: a.id }
    const selection = { shapeIds: [s.id], nodes: [], segment }
    store.setSelection(selection)
    expect(resolveSegment(contentOfFirstBoard(doc), segment)?.segment.index).toBe(1)
    store.dispatch(cutSelectedSegment(store.getState().selection))
    const after = store.getState()
    expect(after.history.past).toHaveLength(1)
    expect(after.doc.boards[0].shapes[1]).toBe(other)
    expect(after.doc.boards[0].shapes[0].subpaths[0].closed).toBe(false)
    expect(after.selection).toEqual({ shapeIds: [s.id], nodes: [] })
    expect(resolveSegment(contentOfFirstBoard(after.doc), segment)).toBeUndefined()
    store.undo()
    expect(store.getState().doc).toBe(doc)
    expect(store.getState().selection).toEqual(selection)
    store.setUi({ activeTool: 'pen' })
    expect(store.getState().selection.segment).toBeUndefined()
    store.redo()
    expect(store.getState().doc).toBe(after.doc)
    store.undo()
    expect(store.getState().selection.segment).toBeUndefined()
  })

  it('prunes a ref when both endpoints survive but are no longer adjacent', () => {
    const a = n({ x: 2, y: 5 }),
      b = n({ x: 10, y: 5 }),
      mid = n({ x: 6, y: 5 })
    const s = shape([a, b])
    const store = createEditorStore(docWith([s]))
    store.setUi({ mode: 'node' })
    const selection = {
      shapeIds: [s.id],
      nodes: [],
      segment: {
        shapeId: s.id,
        subpathId: s.subpaths[0].id,
        fromId: a.id,
        toId: b.id,
      },
    }
    store.setSelection(selection)
    store.updateDoc('Insert between endpoints', (doc) => {
      doc.shapes[0].subpaths[0].nodes.splice(1, 0, mid)
    })
    const after = store.getState()
    expect(after.selection.segment).toBeUndefined()
    store.dispatch(cutSelectedSegment(selection))
    expect(store.getState().doc).toBe(after.doc)
    expect(store.getState().history).toBe(after.history)
    store.undo()
    expect(store.getState().selection).toEqual(selection)
  })

  it('removes the owner only if the last contour is cut, including selection pruning', () => {
    const s = shape([n({ x: 2, y: 5 }), n({ x: 10, y: 5 })])
    const extra = shape([n({ x: 2, y: 10 }), n({ x: 10, y: 10 })]).subpaths[0]
    s.subpaths.push(extra)
    const store = createEditorStore(docWith([s]))
    store.setUi({ mode: 'node' })
    for (const sp of s.subpaths) {
      store.setSelection({
        shapeIds: [s.id],
        nodes: [],
        segment: {
          shapeId: s.id,
          subpathId: sp.id,
          fromId: sp.nodes[0].id,
          toId: sp.nodes[1].id,
        },
      })
      store.dispatch(cutSelectedSegment(store.getState().selection))
      if (sp !== extra) expect(store.getState().doc.boards[0].shapes[0].subpaths[0]).toBe(extra)
    }
    expect(store.getState().doc.boards[0].shapes).toEqual([])
    expect(store.getState().selection.shapeIds).toEqual([])
    expect(store.getState().history.past).toHaveLength(2)
  })
})
