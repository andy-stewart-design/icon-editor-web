import { describe, expect, it } from 'vitest'
import { createDefaultDoc } from '../model'
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
