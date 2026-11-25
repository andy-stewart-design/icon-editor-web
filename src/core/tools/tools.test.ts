import { describe, expect, it } from 'vitest'
import { createDefaultDoc, type PathShape } from '../model'
import { createEditorStore, isNodeSelect, toolContext } from '../store'
import { createEllipseTool } from './ellipseTool'
import { createLineTool } from './lineTool'
import { createRectTool } from './rectTool'
import type { SnapFn, Tool, ToolEvent, ToolHost } from './types'

// Identity snap: these tests exercise the tool pipeline, not snapping.
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
// Bounding box of a path's anchors, as [minX, minY, maxX, maxY].
const bbox = (shape: PathShape) => {
  const pts = shape.subpaths.flatMap((sp) => sp.nodes.map((n) => n.p))
  return [
    Math.min(...pts.map((p) => p.x)),
    Math.min(...pts.map((p) => p.y)),
    Math.max(...pts.map((p) => p.x)),
    Math.max(...pts.map((p) => p.y)),
  ]
}
// Bounding box of the draft the tool is showing.
const draftBox = (tool: Tool) => {
  const draft = tool.overlay().find((o) => o.kind === 'draft')
  if (!draft || draft.kind !== 'draft') throw new Error('no draft')
  return bbox(draft.shape)
}

// A real store is the host, so these run through dispatch and history.
function setup(make: (host: ToolHost) => Tool) {
  const store = createEditorStore(createDefaultDoc())
  return { store, tool: make(store) }
}

describe('rect tool', () => {
  it('Alt drags from the center; Alt+Shift gives a centered square', () => {
    const { store, tool } = setup((host) => createRectTool({ host, radius: () => 0 }))
    tool.pointerDown(ev(12, 12))
    tool.pointerMove(ev(16, 14, { alt: true }))
    expect(draftBox(tool)).toEqual([8, 10, 16, 14])
    tool.pointerMove(ev(16, 14, { alt: true, shift: true }))
    expect(draftBox(tool)).toEqual([8, 8, 16, 16])
    tool.pointerUp(ev(16, 14, { alt: true, shift: true }))
    expect(store.getState().doc.shapes).toHaveLength(1)
  })
})

describe('ellipse tool (AC17)', () => {
  it('Alt+Shift drag from (12,12) to (20,12) commits a 4-node smooth circle, radius 8, centered at (12,12)', () => {
    const { store, tool } = setup((host) => createEllipseTool(host))
    tool.pointerDown(ev(12, 12))
    tool.pointerMove(ev(16, 12, { alt: true, shift: true }))
    tool.pointerUp(ev(20, 12, { alt: true, shift: true }))

    const { doc, history, selection } = store.getState()
    expect(doc.shapes).toHaveLength(1)
    const [shape] = doc.shapes
    const nodes = shape.subpaths[0].nodes
    expect(shape.subpaths[0].closed).toBe(true)
    expect(nodes.map((n) => n.mode)).toEqual(['smooth', 'smooth', 'smooth', 'smooth'])
    expect(nodes.map((n) => n.p)).toEqual([
      { x: 12, y: 4 },
      { x: 20, y: 12 },
      { x: 12, y: 20 },
      { x: 4, y: 12 },
    ])
    expect(history.past).toHaveLength(1)
    expect(selection.shapeIds).toEqual([shape.id])
  })
})

describe('zero-size drags and cancel (AC16)', () => {
  it('a click without a drag, or a cancelled drag, creates nothing and adds no history entry', () => {
    const makers: ((host: ToolHost) => Tool)[] = [
      (host) => createLineTool(host),
      (host) => createEllipseTool(host),
      (host) => createRectTool({ host, radius: () => 2 }),
    ]
    for (const make of makers) {
      const { store, tool } = setup(make)
      tool.pointerDown(ev(5, 5))
      tool.pointerUp(ev(5, 5))
      expect(store.getState().doc.shapes).toHaveLength(0)
      expect(store.getState().history.past).toHaveLength(0)

      tool.pointerDown(ev(5, 5))
      tool.pointerMove(ev(9, 9))
      expect(tool.overlay().some((o) => o.kind === 'draft')).toBe(true)
      tool.keyDown('Escape')
      expect(tool.overlay()).toEqual([])
      tool.pointerUp(ev(9, 9))
      expect(store.getState().doc.shapes).toHaveLength(0)
      expect(store.getState().history.past).toHaveLength(0)
    }
  })
})

describe('Space moves the shape being drawn', () => {
  it('rect drag (2,2)->(6,5), Space moves it by (+3,+1) at the same size, releasing Space resizes from the new start, one history entry', () => {
    const { store, tool } = setup((host) => createRectTool({ host, radius: () => 0 }))
    tool.pointerDown(ev(2, 2))
    tool.pointerMove(ev(6, 5))
    expect(draftBox(tool)).toEqual([2, 2, 6, 5])

    tool.pointerMove(ev(6, 5, { space: true })) // Space goes down; nothing moves yet
    tool.pointerMove(ev(9, 6, { space: true })) // pointer moved by (+3,+1)
    expect(draftBox(tool)).toEqual([5, 3, 9, 6])

    tool.pointerMove(ev(10, 8)) // Space released: resize from the new start (5,3)
    expect(draftBox(tool)).toEqual([5, 3, 10, 8])

    tool.pointerUp(ev(10, 8))
    const { doc, history } = store.getState()
    expect(doc.shapes).toHaveLength(1)
    expect(bbox(doc.shapes[0])).toEqual([5, 3, 10, 8])
    expect(history.past).toHaveLength(1)
  })
})

describe('Shift, Alt and Space compose while drawing', () => {
  it('a centered rect can be moved with Space, and Shift and Alt still apply live while moving', () => {
    const { store, tool } = setup((host) => createRectTool({ host, radius: () => 0 }))
    tool.pointerDown(ev(12, 12))
    tool.pointerMove(ev(16, 14, { alt: true }))
    expect(draftBox(tool)).toEqual([8, 10, 16, 14])

    tool.pointerMove(ev(16, 14, { alt: true, space: true }))
    tool.pointerMove(ev(18, 15, { alt: true, space: true })) // moved by (+2,+1): center is now (14,13)
    expect(draftBox(tool)).toEqual([10, 11, 18, 15])

    tool.pointerMove(ev(18, 15, { alt: true, shift: true, space: true })) // Shift while moving: centered square
    expect(draftBox(tool)).toEqual([10, 9, 18, 17])

    tool.pointerMove(ev(18, 15, { space: true })) // Alt released while moving: the moved point is now a corner
    expect(draftBox(tool)).toEqual([14, 13, 18, 15])

    tool.pointerUp(ev(18, 15, { space: true }))
    expect(store.getState().history.past).toHaveLength(1)
  })
})

describe('line tool (R9, AC13)', () => {
  it('Shift at about 40° ends the line at exactly 45°, keeping its length', () => {
    const { store, tool } = setup((host) => createLineTool(host))
    const len = 10
    const a = (40 * Math.PI) / 180
    tool.pointerDown(ev(2, 2))
    tool.pointerUp(ev(2 + len * Math.cos(a), 2 + len * Math.sin(a), { shift: true }))

    const [shape] = store.getState().doc.shapes
    expect(shape.subpaths[0].closed).toBe(false)
    const [p0, p1] = shape.subpaths[0].nodes.map((n) => n.p)
    expect(p0).toEqual({ x: 2, y: 2 })
    expect(p1.x).toBeCloseTo(2 + len * Math.SQRT1_2, 10)
    expect(p1.y).toBeCloseTo(2 + len * Math.SQRT1_2, 10)
  })
})

describe('editor tool contexts', () => {
  it('keeps Select and Pen independent of editing mode', () => {
    const store = createEditorStore(createDefaultDoc())
    const route = () => toolContext(store.getState().ui)
    expect(route()).toBe('shape-select')
    store.setUi({ mode: 'node', activeTool: 'select' })
    expect(route()).toBe('node-select')
    expect(isNodeSelect(store.getState().ui)).toBe(true)
    store.setUi({ activeTool: 'pen' })
    expect(route()).toBe('node-pen')
    expect(isNodeSelect(store.getState().ui)).toBe(false)
    store.setUi({ mode: 'shape' })
    expect(route()).toBe('shape-pen')
    store.setUi({ mode: 'node' })
    store.setUi({ activeTool: 'select' })
    expect(route()).toBe('node-select')
  })

  it.each(['line', 'rect', 'ellipse'] as const)(
    'choosing %s enters Shape atomically',
    (activeTool) => {
      const store = createEditorStore(createDefaultDoc())
      store.setUi({ mode: 'node', activeTool: 'pen' })
      const seen: string[] = []
      const unsubscribe = store.subscribe(() => {
        const { ui } = store.getState()
        seen.push(`${ui.mode}:${toolContext(ui)}`)
      })
      store.setUi({ activeTool })
      expect(seen).toEqual([`shape:${activeTool}`])
      unsubscribe()
      store.setUi({ mode: 'node' })
      expect(toolContext(store.getState().ui)).toBe('node-select')
    },
  )
})
