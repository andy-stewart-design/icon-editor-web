import { describe, expect, it } from 'vitest'
import { newId } from '../ids'
import type { NodeRef } from '../history'
import { createDefaultDoc, type IconDoc, type PathNode, type PathShape, type Pt } from '../model'
import { createEditorStore } from '../store'
import { nodePanelState, setNodePosition, setSelectedNodesMode } from './nodes'

const n = (p: Pt, extra: Partial<PathNode> = {}): PathNode => ({ id: newId(), p, mode: 'corner', ...extra })
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
const docWith = (shapes: PathShape[]): IconDoc => ({ ...createDefaultDoc(), shapes })
const nodesOf = (doc: IconDoc, s: PathShape) => doc.shapes.find((x) => x.id === s.id)!.subpaths[0].nodes

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
    store.dispatch(setNodePosition({ shapeIds: [s.id], nodes: [refOf(s, a), refOf(s, b)] }, { x: 5 }))
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
    expect(nodesOf(store.getState().doc, s)[0]).toEqual({ id: a.id, p: { x: 2, y: 4 }, mode: 'corner', hOut: { x: 5, y: 4 } })
    store.dispatch(setSelectedNodesMode(sel, 'straight'))
    expect(nodesOf(store.getState().doc, s)[0]).toEqual({ id: a.id, p: { x: 2, y: 4 }, mode: 'corner' })
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
    const cross = (smooth.hIn!.x - smooth.p.x) * (smooth.hOut!.y - smooth.p.y) - (smooth.hIn!.y - smooth.p.y) * (smooth.hOut!.x - smooth.p.x)
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
    expect(nodePanelState(store.getState().doc, sel)?.mode).toBe('free')
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
    expect(nodePanelState(docWith([s]), { shapeIds: [s.id], nodes: [] })).toBeNull()
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

    expect(nodePanelState(doc, sel(straight))).toEqual({ count: 1, x: 1, y: 1, mode: 'straight' })
    expect(nodePanelState(doc, sel(zeroHandle))?.mode).toBe('straight')
    expect(nodePanelState(doc, sel(free))?.mode).toBe('free')
    expect(nodePanelState(doc, sel(smooth))?.mode).toBe('smooth')
    expect(nodePanelState(doc, sel(sym))?.mode).toBe('symmetric')
    expect(nodePanelState(doc, sel(straight, free))).toEqual({ count: 2, x: 'mixed', y: 1, mode: 'mixed' })
    expect(nodePanelState(doc, sel(straight, zeroHandle))).toEqual({ count: 2, x: 'mixed', y: 1, mode: 'straight' })
  })
})
