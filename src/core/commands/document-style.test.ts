import {
  artboardWorkspace,
  contentOfFirstBoard,
  workspaceWithShapes,
} from '../test-fixtures/artboard-workspace'
import { describe, expect, it } from 'vitest'
import { makeLine, makeRect } from '../geometry/shapes'
import { selectionBounds } from '../geometry/bounds'
import { type PathShape } from '../model'
import { validateArtboardSize } from '../validation'
import { createEditorStore } from '../store'
import { resizeArtboard, setDocLinecap, setDocStrokeWidth } from './document'
import {
  resetLinecap,
  selectionField,
  selectionRect,
  setLinecapOverride,
  setSelectionBounds,
  setStrokeWidthOverride,
} from './style'

function line(a: [number, number], b: [number, number]): PathShape {
  const s = makeLine({ x: a[0], y: a[1] }, { x: b[0], y: b[1] })
  if (!s) throw new Error('degenerate line')
  return s
}

function rect(x: number, y: number, w: number, h: number): PathShape {
  const s = makeRect(x, y, w, h)
  if (!s) throw new Error('degenerate rect')
  return s
}

function setup(shapes: PathShape[]) {
  const store = createEditorStore(workspaceWithShapes(shapes))
  const select = (...ids: string[]) => store.setSelection({ shapeIds: ids, nodes: [] })
  return { store, select }
}

const anchors = (s: PathShape) => s.subpaths.flatMap((sp) => sp.nodes.map((n) => n.p))

describe('artboard resize (AC27, AC28)', () => {
  it('stay in place changes only the size and keeps coordinates (AC27)', () => {
    const l = line([2, 2], [22, 22])
    const { store } = setup([l])
    store.dispatch(resizeArtboard(32, 'keep'))
    const doc = store.getState().doc
    expect(doc.boards[0].size).toBe(32)
    expect(anchors(doc.boards[0].shapes[0])).toEqual([
      { x: 2, y: 2 },
      { x: 22, y: 22 },
    ])
    expect(store.getState().history.past).toHaveLength(1)
  })

  it('scale multiplies coordinates, keeps stroke widths, and one undo restores the original (AC28)', () => {
    const l = line([2, 2], [22, 22])
    l.style = { strokeWidth: 3 }
    const { store } = setup([l])
    const doc0 = store.getState().doc
    expect(doc0.boards[0].size).toBe(24)
    store.dispatch(resizeArtboard(32, 'scale'))
    const doc = store.getState().doc
    expect(doc.boards[0].size).toBe(32)
    const [out] = doc.boards[0].shapes
    const [a, b] = anchors(out)
    expect(a.x).toBeCloseTo(2.6667, 3)
    expect(a.y).toBeCloseTo(2.6667, 3)
    expect(b.x).toBeCloseTo(29.3333, 3)
    expect(b.y).toBeCloseTo(29.3333, 3)
    expect(out.style).toEqual({ strokeWidth: 3 })
    expect(doc.strokeWidth).toBe(1.5)
    store.undo()
    expect(store.getState().doc).toEqual(doc0)
    expect(store.canUndo()).toBe(false)
  })
})

describe('document settings', () => {
  it('a no-op value creates no history entry', () => {
    const { store } = setup([])
    store.dispatch(setDocStrokeWidth(1.5))
    store.dispatch(setDocLinecap('round'))
    expect(store.getState().history.past).toHaveLength(0)
    store.dispatch(setDocLinecap('butt'))
    expect(store.getState().doc.linecap).toBe('butt')
    expect(store.getState().history.past).toHaveLength(1)
  })
})

describe('style overrides (AC30)', () => {
  it('mixed becomes same after setting, and reset removes the linecap key', () => {
    const a = rect(0, 0, 4, 4)
    const b = rect(10, 10, 4, 4)
    a.style = { linecap: 'square' }
    b.style = { linecap: 'round' }
    const { store, select } = setup([a, b])
    select(a.id, b.id)
    expect(
      selectionField(
        contentOfFirstBoard(store.getState().doc),
        store.getState().selection,
        'linecap',
      ),
    ).toEqual({
      kind: 'mixed',
    })

    store.dispatch(setLinecapOverride(store.getState().selection, 'butt'))
    const doc = store.getState().doc
    expect(selectionField(contentOfFirstBoard(doc), store.getState().selection, 'linecap')).toEqual(
      {
        kind: 'same',
        value: 'butt',
        overridden: true,
      },
    )

    select(a.id)
    store.dispatch(resetLinecap(store.getState().selection))
    const after = store.getState().doc.boards[0].shapes[0]
    expect('linecap' in after.style).toBe(false)
    expect(after.style).toEqual({})
  })

  it('an unset field falls back to the doc default and reports no override', () => {
    const a = rect(0, 0, 4, 4)
    const { store, select } = setup([a])
    select(a.id)
    const sel = store.getState().selection
    const doc = store.getState().doc
    expect(selectionField(contentOfFirstBoard(doc), sel, 'strokeWidth')).toEqual({
      kind: 'same',
      value: 1.5,
      overridden: false,
    })
    store.dispatch(setStrokeWidthOverride(sel, 2))
    expect(selectionField(contentOfFirstBoard(store.getState().doc), sel, 'strokeWidth')).toEqual({
      kind: 'same',
      value: 2,
      overridden: true,
    })
  })
})

describe('setSelectionBounds', () => {
  it('moves and scales a rect to the target bounds without touching stroke widths', () => {
    const r = rect(2, 2, 4, 6)
    r.style = { strokeWidth: 2 }
    const { store, select } = setup([r])
    select(r.id)
    const sel = store.getState().selection
    store.dispatch(setSelectionBounds(sel, 10, 5, 8, 12))
    const doc = store.getState().doc
    expect(selectionRect(contentOfFirstBoard(doc), sel)).toEqual({ x: 10, y: 5, w: 8, h: 12 })
    expect(doc.boards[0].shapes[0].style).toEqual({ strokeWidth: 2 })
    expect(store.getState().history.past).toHaveLength(1)
  })

  it('a zero-height line keeps h = 0 and ignores the requested height', () => {
    const l = line([0, 4], [10, 4])
    const { store, select } = setup([l])
    select(l.id)
    const sel = store.getState().selection
    store.dispatch(setSelectionBounds(sel, 1, 2, 20, 9))
    const b = selectionBounds(store.getState().doc.boards[0].shapes)!
    expect(b).toEqual({ x: 1, y: 2, w: 20, h: 0 })
  })

  it('setting the current bounds is a no-op', () => {
    const r = rect(2, 2, 4, 6)
    const { store, select } = setup([r])
    select(r.id)
    const sel = store.getState().selection
    store.dispatch(setSelectionBounds(sel, 2, 2, 4, 6))
    expect(store.getState().history.past).toHaveLength(0)
  })
})

it.each(['keep', 'scale'] as const)('resizes only the active board in %s mode', (mode) => {
  const [other, source] = artboardWorkspace.boards
  const store = createEditorStore(artboardWorkspace)
  store.activateBoard(source.id)
  store.dispatch(resizeArtboard(64, mode))
  const doc = store.getState().doc
  const board = doc.boards[1]
  expect(doc.boards[0]).toBe(other)
  expect(board.id).toBe(source.id)
  expect(board.origin).toBe(source.origin)
  expect(board.size).toBe(64)
  expect(board.shapes.map((shape) => shape.id)).toEqual(source.shapes.map((shape) => shape.id))
  expect(board.shapes[0].style).toEqual(source.shapes[0].style)
  expect(doc.strokeWidth).toBe(artboardWorkspace.strokeWidth)
  const factor = mode === 'keep' ? 1 : 2
  expect(anchors(board.shapes[0])).toEqual(
    anchors(source.shapes[0]).map(({ x, y }) => ({ x: x * factor, y: y * factor })),
  )
  store.undo()
  expect(store.getState().doc).toBe(artboardWorkspace)
})

it('rejects invalid size text and invalid direct resize commands without changing either board', () => {
  const store = createEditorStore(artboardWorkspace)
  store.activateBoard(artboardWorkspace.boards[1].id)
  for (const text of ['', 'no', '7', '257', '24.5', 'Infinity']) {
    expect(validateArtboardSize(text)).toEqual({ ok: false })
    for (const mode of ['keep', 'scale'] as const)
      store.dispatch(resizeArtboard(Number(text), mode))
  }
  expect(store.getState().doc).toBe(artboardWorkspace)
  expect(store.canUndo()).toBe(false)
})
