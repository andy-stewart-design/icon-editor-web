import { describe, expect, it } from 'vitest'
import { nudgeSelection, selectAll } from '../commands/selection'
import { selectionBounds } from '../geometry/bounds'
import { makeLine, makeRect } from '../geometry/shapes'
import { createDefaultDoc, type IconDoc, type PathShape, type Pt } from '../model'
import { createEditorStore } from '../store'
import { createSelectTool, hitTestShape } from './selectTool'
import type { ToolEvent } from './types'

const noSnap = (pt: Pt) => ({ point: pt, targets: { x: null, y: null } })
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

// Horizontal 1.5-wide line from x=2 to x=22 at height y.
function hline(y: number): PathShape {
  const s = makeLine({ x: 2, y }, { x: 22, y })
  if (!s) throw new Error('degenerate line')
  return s
}

function docWith(shapes: PathShape[]): IconDoc {
  return { ...createDefaultDoc(), shapes }
}

describe('select tool hit testing (AC10)', () => {
  it('selects a shape clicked just outside a 1.5 stroke; empty click clears the selection', () => {
    const line = hline(4)
    const store = createEditorStore(docWith([line]))
    const tool = createSelectTool(store)
    // zoom 16: tolerance 6/16 = 0.375, plus half the 1.5 stroke = 0.75, so reach is 1.125 doc units.
    expect(hitTestShape(store.getState().doc, { x: 12, y: 5.1 }, 16)).toBe(line.id)
    expect(hitTestShape(store.getState().doc, { x: 12, y: 6 }, 16)).toBeNull()

    tool.pointerDown(ev(12, 5.1))
    tool.pointerUp(ev(12, 5.1))
    expect(store.getState().selection.shapeIds).toEqual([line.id])

    tool.pointerDown(ev(12, 12))
    tool.pointerUp(ev(12, 12))
    expect(store.getState().selection.shapeIds).toEqual([])
    expect(store.getState().history.past).toHaveLength(0)
  })
})

describe('select tool marquee and Shift toggle (AC11)', () => {
  it('marquee selects every intersected shape; Shift-click adds then removes one', () => {
    const [a, b, c] = [hline(2), hline(10), hline(18)]
    const store = createEditorStore(docWith([a, b, c]))
    const tool = createSelectTool(store)

    // Marquee across the top two lines only, dragged from empty space.
    tool.pointerDown(ev(0, 0))
    tool.pointerMove(ev(24, 12))
    expect(tool.overlay()).toEqual([{ kind: 'marquee', rect: { x: 0, y: 0, w: 24, h: 12 } }])
    tool.pointerUp(ev(24, 12))
    expect(store.getState().selection.shapeIds).toEqual([a.id, b.id])

    // Shift-click the third line adds it; Shift-click again removes it.
    tool.pointerDown(ev(12, 18, { shift: true }))
    tool.pointerUp(ev(12, 18, { shift: true }))
    expect(store.getState().selection.shapeIds).toEqual([a.id, b.id, c.id])
    tool.pointerDown(ev(12, 18, { shift: true }))
    tool.pointerUp(ev(12, 18, { shift: true }))
    expect(store.getState().selection.shapeIds).toEqual([a.id, b.id])
    expect(store.getState().history.past).toHaveLength(0)
  })
})

describe('select tool drag-move (AC37, AC38)', () => {
  it('a drag is one history entry that undo reverts; Esc restores with no entry', () => {
    const line = hline(4)
    const store = createEditorStore(docWith([line]))
    store.setUi({ snapEnabled: false })
    const original = store.getState().doc
    const tool = createSelectTool(store)

    tool.pointerDown(ev(12, 4))
    tool.pointerMove(ev(14, 4))
    tool.pointerMove(ev(16, 6))
    tool.pointerMove(ev(20, 9))
    expect(store.getState().tx).not.toBeNull()
    expect(store.getState().doc.shapes[0].subpaths[0].nodes[0].p).toEqual({ x: 2 + 8, y: 4 + 5 })
    tool.pointerUp(ev(20, 9))
    expect(store.getState().tx).toBeNull()
    expect(store.getState().history.past).toHaveLength(1)
    expect(store.getState().selection.shapeIds).toEqual([line.id])

    store.undo()
    expect(store.getState().doc).toBe(original)
    expect(store.getState().history.past).toHaveLength(0)

    // Esc mid-drag: back to the pre-drag doc, and no entry.
    tool.pointerDown(ev(12, 4))
    tool.pointerMove(ev(18, 10))
    tool.keyDown('Escape')
    expect(store.getState().tx).toBeNull()
    expect(store.getState().doc).toBe(original)
    expect(store.getState().history.past).toHaveLength(0)
    tool.pointerUp(ev(18, 10))
    expect(store.getState().history.past).toHaveLength(0)
  })
})

describe('nudge and select-all commands (AC12)', () => {
  it('moves by the increment (even with snapping off) or 1 unit with Shift, one entry each', () => {
    const line = hline(4)
    const store = createEditorStore(docWith([line]))
    store.setUi({ snapEnabled: false, snapIncrement: 0.5 })
    const x0 = () => store.getState().doc.shapes[0].subpaths[0].nodes[0].p.x

    store.setSelection({ shapeIds: [line.id], nodes: [] })
    store.dispatch(nudgeSelection(store.getState().selection, 'right', 0.5, false))
    expect(x0()).toBe(2.5)
    store.dispatch(nudgeSelection(store.getState().selection, 'right', 0.5, true))
    expect(x0()).toBe(3.5)
    expect(store.getState().history.past).toHaveLength(2)
  })

  it('select-all selects every shape without a history entry', () => {
    const store = createEditorStore(docWith([hline(2), hline(10)]))
    store.dispatch(selectAll(store.getState().doc))
    expect(store.getState().selection.shapeIds).toHaveLength(2)
    expect(store.getState().history.past).toHaveLength(0)
  })
})

describe('select tool handles', () => {
  it('dragging the se handle resizes as one history entry; the rotate handle rotates; Esc restores', () => {
    const r = makeRect(4, 4, 8, 8)
    if (!r) throw new Error('degenerate rect')
    const store = createEditorStore(docWith([r]))
    store.setUi({ snapEnabled: false })
    store.setSelection({ shapeIds: [r.id], nodes: [] })
    const original = store.getState().doc
    const tool = createSelectTool(store)

    tool.pointerDown(ev(12, 12)) // the se corner
    tool.pointerMove(ev(20, 20))
    tool.pointerUp(ev(20, 20))
    expect(selectionBounds([store.getState().doc.shapes[0]])).toEqual({ x: 4, y: 4, w: 16, h: 16 })
    expect(store.getState().history.past).toHaveLength(1)

    // Rotate handle: 22 screen px above the top edge at zoom 16, then a quarter turn about the center (12,12).
    store.undo()
    const top = 4 - 22 / 16
    tool.pointerDown(ev(8, top))
    tool.pointerMove(ev(8 + 4 + (4 - top), 8)) // pointer swings to the right of center
    tool.pointerMove(ev(8, top)) // and back: no net rotation
    tool.pointerCancel()
    expect(store.getState().doc).toBe(original)
    expect(store.getState().history.past).toHaveLength(0)
  })
})
