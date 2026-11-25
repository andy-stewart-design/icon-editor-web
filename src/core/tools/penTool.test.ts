import { describe, expect, it } from 'vitest'
import { segmentsOf } from '../geometry/segments'
import { serializeBody } from '../serialize'
import { createDefaultDoc, type PathShape } from '../model'
import { createEditorStore } from '../store'
import { createPenTool } from './penTool'
import type { SnapFn, Tool, ToolEvent } from './types'

// Identity snap: these tests exercise the pen state machine, not snapping.
const noSnap: SnapFn = (pt) => ({ point: pt, targets: { x: null, y: null } })
const ev = (x: number, y: number, o: Partial<ToolEvent> = {}): ToolEvent => ({
  pt: { x, y },
  zoom: 16,
  shift: false,
  alt: false,
  space: false,
  suspendSnap: false,
  snap: noSnap,
  ...o,
})

function setup() {
  const store = createEditorStore(createDefaultDoc())
  const tool: Tool = createPenTool(store)
  return { store, tool }
}

describe('pen tool (AC18, AC19)', () => {
  it('click, click-drag, click, then the first node closes a corner/symmetric/corner path in one entry', () => {
    const { store, tool } = setup()
    tool.pointerDown(ev(4, 4))
    tool.pointerUp(ev(4, 4))
    tool.pointerDown(ev(12, 4))
    tool.pointerMove(ev(14, 4))
    tool.pointerMove(ev(16, 6))
    tool.pointerUp(ev(16, 6))
    tool.pointerDown(ev(12, 12))
    tool.pointerUp(ev(12, 12))
    // Document is unchanged until the path is closed.
    expect(store.getState().doc.shapes).toHaveLength(0)
    tool.pointerDown(ev(4.2, 4.1)) // within the close tolerance of the first node
    tool.pointerUp(ev(4.2, 4.1))

    const { doc, history, selection } = store.getState()
    expect(doc.shapes).toHaveLength(1)
    const [shape] = doc.shapes
    expect(shape.style).toEqual({})
    const [sp] = shape.subpaths
    expect(sp.closed).toBe(true)
    expect(sp.nodes.map((n) => n.mode)).toEqual(['corner', 'symmetric', 'corner'])
    const sym = sp.nodes[1]
    expect(sym.p).toEqual({ x: 12, y: 4 })
    expect(sym.hOut).toEqual({ x: 16, y: 6 })
    expect(sym.hIn).toEqual({ x: 8, y: 2 })
    expect(sp.nodes[0].hOut).toBeUndefined()
    expect(history.past).toHaveLength(1)
    expect(selection.shapeIds).toEqual([shape.id])
  })

  it('one node + Enter creates nothing and leaves history untouched', () => {
    const { store, tool } = setup()
    tool.pointerDown(ev(4, 4))
    tool.pointerUp(ev(4, 4))
    tool.keyDown('Enter')
    expect(store.getState().doc.shapes).toHaveLength(0)
    expect(store.getState().history.past).toHaveLength(0)
  })

  it('a press on the first node with fewer than two nodes does not close', () => {
    const { store, tool } = setup()
    tool.pointerDown(ev(4, 4))
    tool.pointerUp(ev(4, 4))
    tool.pointerDown(ev(4, 4)) // on the first node, but only one node: no close, and no zero-length duplicate
    tool.pointerUp(ev(4, 4))
    tool.pointerDown(ev(12, 4))
    tool.pointerUp(ev(12, 4))
    tool.keyDown('Enter')
    const [shape] = store.getState().doc.shapes
    expect(shape.subpaths[0].closed).toBe(false)
    expect(shape.subpaths[0].nodes).toHaveLength(2)
  })

  it('Escape finishes an open path with the nodes placed so far and drops a press in progress', () => {
    const { store, tool } = setup()
    tool.pointerDown(ev(0, 0))
    tool.pointerUp(ev(0, 0))
    tool.pointerDown(ev(8, 0))
    tool.pointerUp(ev(8, 0))
    tool.pointerDown(ev(8, 8))
    tool.pointerMove(ev(12, 8)) // dragging the third node when Escape arrives
    tool.keyDown('Escape')
    tool.pointerUp(ev(12, 8))
    const { doc, history } = store.getState()
    expect(doc.shapes).toHaveLength(1)
    expect(doc.shapes[0].subpaths[0].closed).toBe(false)
    expect(doc.shapes[0].subpaths[0].nodes).toHaveLength(2)
    expect(history.past).toHaveLength(1)
  })

  it('deactivate commits an open path once, and a second call adds nothing', () => {
    const { store, tool } = setup()
    tool.pointerDown(ev(0, 0))
    tool.pointerUp(ev(0, 0))
    tool.pointerDown(ev(8, 0))
    tool.pointerUp(ev(8, 0))
    tool.deactivate?.()
    tool.deactivate?.()
    expect(store.getState().doc.shapes).toHaveLength(1)
    expect(store.getState().history.past).toHaveLength(1)
  })
})

const curve = 'M2 2C4 5 10 5 12 2'
const unrelated = 'M22 2L22 8'
const closed = 'M2 14L12 14Z'
const click = (tool: Tool, x: number, y: number, options?: Partial<ToolEvent>) => {
  const event = ev(x, y, options)
  tool.pointerDown(event)
  tool.pointerUp(event)
}

function seeded(mode: 'node' | 'shape' = 'node') {
  const a: PathShape = {
    id: 'a', type: 'path', style: { strokeWidth: 2 }, subpaths: [
      { id: 'curve', closed: false, nodes: [
        { id: 'head', p: { x: 2, y: 2 }, hOut: { x: 4, y: 5 }, mode: 'corner' },
        { id: 'tail', p: { x: 12, y: 2 }, hIn: { x: 10, y: 5 }, mode: 'corner' },
      ] },
      { id: 'unrelated', closed: false, nodes: [
        { id: 'otherHead', p: { x: 22, y: 2 }, mode: 'corner' },
        { id: 'otherTail', p: { x: 22, y: 8 }, mode: 'corner' },
      ] },
      { id: 'closed', closed: true, nodes: [
        { id: 'closedHead', p: { x: 2, y: 14 }, mode: 'corner' },
        { id: 'closedTail', p: { x: 12, y: 14 }, mode: 'corner' },
      ] },
    ],
  }
  const b: PathShape = { id: 'b', type: 'path', style: {}, subpaths: [{ id: 'b-path', closed: false, nodes: [
    { id: 'b0', p: { x: 2, y: 2 }, mode: 'corner' }, { id: 'b1', p: { x: 8, y: 8 }, mode: 'corner' },
  ] }] }
  const doc = { ...createDefaultDoc(), shapes: [a, b] }
  const store = createEditorStore(doc)
  const select = (...shapeIds: string[]) => store.setSelection({ shapeIds, nodes: [] })
  select(a.id)
  const tool = mode === 'shape' ? createPenTool(store) : createPenTool(store, { mode, getState: store.getState })
  return { store, tool, doc, a, b, select }
}

describe('Pen drawing contexts', () => {
  it('the default Shape factory creates a selected shape even directly over an existing endpoint', () => {
    const { store, tool, a, b } = seeded('shape')
    tool.hover?.(ev(2, 2))
    expect(tool.overlay()).toEqual([])
    click(tool, 2, 2)
    click(tool, 5, 9)
    tool.keyDown('Enter')
    const { doc, selection, history } = store.getState()
    expect(doc.shapes).toHaveLength(3)
    expect(doc.shapes[0]).toBe(a)
    expect(doc.shapes[1]).toBe(b)
    expect(selection.shapeIds).toEqual([doc.shapes[2].id])
    expect(history.past).toHaveLength(1)
    expect(serializeBody(doc)).toContain('<path d="M2 2L5 9"/>')
  })

  it.each(['head', 'tail'] as const)('extends the curved %s and preserves the original segment', (end) => {
    const { store, tool, a, b, doc } = seeded()
    const head = end === 'head'
    const x = head ? 2 : 12
    const start = ev(x + 0.15, 2, { snap: () => noSnap({ x: 22, y: 8 }) })
    tool.hover?.(start)
    expect(tool.overlay()).toContainEqual({ kind: 'penResume', p: { x, y: 2 } })
    tool.pointerDown(start)
    tool.pointerUp(ev(x, 6)) // dragging the old endpoint must not change its geometry
    tool.pointerDown(ev(7, 8))
    tool.pointerMove(ev(8, 10))
    const draft = tool.overlay().find((p) => p.kind === 'draft')
    expect(draft?.shape.subpaths[0].nodes).toHaveLength(2)
    tool.pointerUp(ev(8, 10))
    tool.keyDown('Enter')
    const after = store.getState().doc
    const [edited, other] = after.shapes
    expect(edited.id).toBe(a.id)
    expect(edited.style).toBe(a.style)
    expect(edited.subpaths[1]).toBe(a.subpaths[1])
    expect(edited.subpaths[2]).toBe(a.subpaths[2])
    expect(other).toBe(b)
    const index = head ? 1 : 0
    expect(segmentsOf(edited.subpaths[0])[index]).toEqual({ ...segmentsOf(a.subpaths[0])[0], index })
    const expected = head ? 'M7 8C6 6 2 2 2 2C4 5 10 5 12 2' : `${curve}C12 2 6 6 7 8`
    expect(serializeBody(after)).toContain(`<path d="${expected}${unrelated}${closed}" stroke-width="2"/>`)
    expect(store.getState().history.past).toHaveLength(1)
    store.undo()
    expect(store.getState().doc).toBe(doc)
    store.redo()
    expect(store.getState().doc).toBe(after)
  })

  it('appends a snapped contour with a curve to the pinned shape after selection changes', () => {
    const { store, tool, a, b, doc, select } = seeded()
    const snap: SnapFn = ({ x, y }) => noSnap({ x: Math.round(x), y: Math.round(y) })
    click(tool, 4.2, 8.1, { snap })
    select('b')
    tool.pointerDown(ev(9.2, 8.1, { snap }))
    tool.pointerUp(ev(11.1, 10.2, { snap }))
    tool.deactivate?.()
    tool.deactivate?.()
    const after = store.getState()
    expect(after.doc.shapes).toHaveLength(2)
    expect(after.doc.shapes[0].subpaths.slice(0, 3)).toEqual(a.subpaths)
    expect(after.doc.shapes[1]).toBe(b)
    expect(after.selection.shapeIds).toEqual(['a'])
    expect(serializeBody(after.doc)).toBe(`<path d="${curve}${unrelated}${closed}M4 8C4 8 7 6 9 8" stroke-width="2"/><path d="M2 2L8 8"/>`)
    expect(after.history.past).toHaveLength(1)
    store.undo()
    expect(store.getState().doc).toBe(doc)
    expect(store.getState().selection.shapeIds).toEqual(['b'])
    store.redo()
    expect(store.getState().doc).toBe(after.doc)
    expect(store.getState().selection.shapeIds).toEqual(['a'])
  })

  it('clears idle endpoint feedback for ineligible selection and refreshes after selection and geometry edits', () => {
    const { store, tool, doc, select } = seeded()
    tool.hover?.(ev(2, 2))
    expect(tool.overlay().filter((p) => p.kind === 'penEndpoint')).toHaveLength(4)
    for (const ids of [[], ['a', 'b']]) {
      select(...ids)
      tool.refreshHover?.()
      expect(tool.overlay()).toEqual([])
      click(tool, 2, 2)
      click(tool, 18, 8)
      tool.keyDown('Enter')
      expect(store.getState().doc).toBe(doc)
      expect(store.canUndo()).toBe(false)
      tool.hover?.(ev(2, 2))
    }
    select('b')
    tool.refreshHover?.()
    expect(tool.overlay().filter((p) => p.kind === 'penEndpoint')).toHaveLength(2)
    expect(tool.overlay()).toContainEqual({ kind: 'penResume', p: { x: 2, y: 2 } })
    store.updateDoc('Move endpoint', (d) => { d.shapes[1].subpaths[0].nodes[0].p.x = 3 })
    tool.refreshHover?.()
    expect(tool.overlay().some((p) => p.kind === 'penResume')).toBe(false)
  })

  it('uses the same stable overlap winner for hover and press, without joining another contour', () => {
    const { store, tool } = seeded()
    store.updateDoc('Overlap endpoints', (d) => { d.shapes[0].subpaths[1].nodes[0].p = { x: 12, y: 2 } })
    const original = store.getState().doc.shapes[0].subpaths[1]
    tool.hover?.(ev(12, 2))
    expect(tool.overlay()).toContainEqual({ kind: 'penResume', p: { x: 12, y: 2 } })
    click(tool, 12, 2)
    click(tool, 22, 8)
    tool.keyDown('Enter')
    const [shape] = store.getState().doc.shapes
    expect(shape.subpaths).toHaveLength(3)
    expect(shape.subpaths[0].nodes).toHaveLength(3)
    expect(shape.subpaths[1]).toBe(original)
  })

  it.each(['interior', 'closed', 'other shape'] as const)('starts a new contour, not a continuation, at a %s anchor', (kind) => {
    const { store, tool } = seeded()
    store.updateDoc('Seed interior', (d) => {
      d.shapes[0].subpaths[0].nodes.splice(1, 0, { id: 'interior', p: { x: 7, y: 2 }, mode: 'corner' })
    })
    const old = store.getState().doc.shapes[0].subpaths
    const pt = kind === 'interior' ? [7, 2] as const : kind === 'closed' ? [2, 14] as const : [8, 8] as const
    tool.hover?.(ev(pt[0], pt[1]))
    expect(tool.overlay().some((p) => p.kind === 'penResume')).toBe(false)
    click(tool, pt[0], pt[1])
    click(tool, 22, 8)
    click(tool, pt[0], pt[1])
    const after = store.getState().doc
    expect(after.shapes[0].subpaths.slice(0, 3)).toEqual(old)
    expect(serializeBody(after)).toContain(`M${pt.join(' ')}L22 8Z`)
    expect(store.getState().history.past).toHaveLength(2)
  })

  it.each([2, 12])('closes a resumed contour from x=%s without changing the original segment', (x) => {
    const { store, tool, a } = seeded()
    click(tool, x, 2)
    tool.pointerDown(ev(14 - x, 2))
    tool.pointerUp(ev(14 - x, 8)) // an existing endpoint cannot be restyled by a closing drag
    const { doc, history } = store.getState()
    const contour = doc.shapes[0].subpaths[0]
    expect(contour.nodes).toBe(a.subpaths[0].nodes)
    expect(segmentsOf(contour)[0]).toEqual(segmentsOf(a.subpaths[0])[0])
    expect(serializeBody(doc)).toContain(`${curve}Z${unrelated}${closed}`)
    expect(history.past).toHaveLength(1)
  })

  it.each(['Enter', 'Escape', 'deactivate'])('drops unplaced points after cancel and %s, and finishes only once', (finish) => {
    const { store, tool } = seeded()
    tool.pointerDown(ev(2, 2))
    tool.pointerCancel()
    tool.pointerUp(ev(2, 2))
    click(tool, 5, 8)
    click(tool, 10, 8)
    tool.pointerDown(ev(14, 8))
    tool.pointerCancel()
    tool.pointerUp(ev(14, 8))
    tool.pointerDown(ev(16, 8))
    tool.pointerMove(ev(16, 10))
    if (finish === 'deactivate') tool.deactivate?.()
    else tool.keyDown(finish)
    tool.pointerUp(ev(16, 10))
    tool.deactivate?.()
    expect(serializeBody(store.getState().doc)).toContain(`${closed}M5 8L10 8"`)
    expect(store.getState().history.past).toHaveLength(1)
  })

  it.each(['short', 'untouched', 'removed', 'changed'] as const)('does not dispatch for a %s draft or consume redo', (kind) => {
    const { store, a, select } = seeded()
    // In the stale cases undo invalidates the pinned target and leaves a real redo branch.
    if (kind === 'removed') {
      store.updateDoc('Remove A', (d) => { d.shapes.shift() })
      store.updateDoc('Restore A', (d) => { d.shapes.unshift(a) })
    } else if (kind === 'changed') {
      store.updateDoc('Move endpoint', (d) => { d.shapes[0].subpaths[0].nodes[1].p.x = 13 })
    } else {
      store.updateDoc('Restyle', (d) => { d.shapes[1].style.strokeWidth = 3 })
      store.undo()
    }
    let dispatches = 0
    const tool = createPenTool({ dispatch: (cmd) => { dispatches++; store.dispatch(cmd) } }, { mode: 'node', getState: store.getState })
    select('a')
    click(tool, kind === 'short' ? 5 : 2, 2)
    if (kind === 'removed' || kind === 'changed') {
      click(tool, 5, 8)
      store.undo()
    }
    select('b')
    const before = store.getState()
    expect(store.canRedo()).toBe(true)
    tool.keyDown('Enter')
    expect(dispatches).toBe(0)
    expect(store.getState()).toBe(before)
    store.redo()
    expect(store.getState().doc).toBe(before.history.future[0].after)
  })
})
