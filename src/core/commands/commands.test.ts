import { describe, expect, it } from 'vitest'
import { makeLine, makeRect } from '../geometry/shapes'
import { selectionBounds } from '../geometry/bounds'
import { createDefaultDoc, type PathShape } from '../model'
import { createEditorStore } from '../store'
import { bringForward, deleteSelection, duplicateSelection, sendBackward } from './arrange'
import { flipSelection, resizeFactors, resizeSelection, rotationAngle } from './transform'

function rect(x: number, y: number, w: number, h: number): PathShape {
  const s = makeRect(x, y, w, h)
  if (!s) throw new Error('degenerate rect')
  return s
}

function setup(shapes: PathShape[]) {
  const store = createEditorStore({ ...createDefaultDoc(), shapes })
  const select = (...ids: string[]) => store.setSelection({ shapeIds: ids, nodes: [] })
  return { store, select }
}

const anchors = (s: PathShape) => s.subpaths.flatMap((sp) => sp.nodes.map((n) => n.p))

describe('transform commands', () => {
  it('resizing to 200% doubles coordinates and leaves the stroke style alone (AC24)', () => {
    const r = rect(2, 2, 4, 3)
    r.style = { strokeWidth: 2 }
    const { store, select } = setup([r])
    select(r.id)
    const b = selectionBounds([r])!
    const { sx, sy, anchor } = resizeFactors(b, 'se', { x: b.x + b.w * 2, y: b.y + b.h * 2 })
    store.dispatch(resizeSelection(store.getState().selection, sx, sy, anchor))
    const [out] = store.getState().doc.shapes
    expect(selectionBounds([out])).toEqual({ x: 2, y: 2, w: 8, h: 6 })
    expect(out.style).toEqual({ strokeWidth: 2 })
  })

  it('Shift keeps the aspect ratio when resizing from a corner', () => {
    const b = { x: 0, y: 0, w: 10, h: 5 }
    const f = resizeFactors(b, 'se', { x: 20, y: 6 }, true)
    expect(f.sx).toBeCloseTo(2)
    expect(f.sy).toBeCloseTo(2)
  })

  it('Alt resizes about the center of the bounds', () => {
    const b = { x: 4, y: 4, w: 8, h: 4 } // center (8, 6)
    const f = resizeFactors(b, 'se', { x: 16, y: 10 }, false, true) // pointer 8 right, 4 below the center
    expect(f.anchor).toEqual({ x: 8, y: 6 })
    expect(f.sx).toBeCloseTo(2)
    expect(f.sy).toBeCloseTo(2)
    const e = resizeFactors(b, 'w', { x: 0, y: 6 }, false, true) // west edge dragged to 8 left of the center
    expect(e.sx).toBeCloseTo(2)
    expect(e.sy).toBe(1)
  })

  it('flipping twice on the same axis restores the coordinates (AC25)', () => {
    const r = rect(2, 3, 5, 4)
    const { store, select } = setup([r])
    select(r.id)
    for (const axis of ['h', 'v'] as const) {
      store.dispatch(flipSelection(store.getState().selection, axis))
      store.dispatch(flipSelection(store.getState().selection, axis))
    }
    const before = anchors(r)
    const after = anchors(store.getState().doc.shapes[0])
    after.forEach((p, i) => {
      expect(p.x).toBeCloseTo(before[i].x, 9)
      expect(p.y).toBeCloseTo(before[i].y, 9)
    })
  })

  it('Shift rotation lands on multiples of 15° (AC23)', () => {
    const c = { x: 0, y: 0 }
    const a = rotationAngle(c, { x: 1, y: 0 }, { x: Math.cos(0.5), y: Math.sin(0.5) }, true)
    expect(a / (Math.PI / 12)).toBeCloseTo(Math.round(a / (Math.PI / 12)), 9)
    expect((a * 180) / Math.PI).toBeCloseTo(30, 9) // 0.5 rad is 28.6°, nearest step is 30°
  })
})

describe('arrange commands', () => {
  const line = (y: number) => {
    const s = makeLine({ x: 0, y }, { x: 10, y })
    if (!s) throw new Error('degenerate line')
    return s
  }

  it('duplicate puts the copy directly above with new ids and selects it; z-order moves one step (AC26)', () => {
    const [a, b, c] = [line(1), line(2), line(3)]
    const { store, select } = setup([a, b, c])
    select(a.id)
    store.dispatch(duplicateSelection(store.getState().doc, store.getState().selection))
    const { doc, selection } = store.getState()
    expect(doc.shapes).toHaveLength(4)
    expect(doc.shapes[0].id).toBe(a.id)
    const copy = doc.shapes[1]
    expect(copy.id).not.toBe(a.id)
    expect(copy.subpaths[0].nodes.map((n) => n.id)).not.toEqual(
      a.subpaths[0].nodes.map((n) => n.id),
    )
    expect(anchors(copy)).toEqual(anchors(a))
    expect(selection.shapeIds).toEqual([copy.id])

    store.dispatch(bringForward(selection))
    expect(store.getState().doc.shapes[2].id).toBe(copy.id)
    store.dispatch(sendBackward(store.getState().selection))
    expect(store.getState().doc.shapes[1].id).toBe(copy.id)
    // At the bottom/top nothing moves and no history entry is recorded.
    const n = store.getState().history.past.length
    store.dispatch(bringForward({ shapeIds: [c.id], nodes: [] }))
    expect(store.getState().history.past.length).toBe(n)
  })

  it('delete is one history entry and one undo restores the shape', () => {
    const [a, b] = [line(1), line(2)]
    const { store, select } = setup([a, b])
    select(a.id)
    store.dispatch(deleteSelection(store.getState().selection))
    expect(store.getState().doc.shapes.map((s) => s.id)).toEqual([b.id])
    expect(store.getState().history.past).toHaveLength(1)
    store.undo()
    expect(store.getState().doc.shapes.map((s) => s.id)).toEqual([a.id, b.id])
  })
})
