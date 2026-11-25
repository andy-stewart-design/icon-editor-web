import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDefaultDoc,
  createEditorStore,
  screenToDoc,
  selectionBounds,
  type PathShape,
} from '../core'
import { makeLine } from '../core/geometry/shapes'
import { dispatchKey } from './use-shortcuts'

class ElementStub extends EventTarget {
  tagName = 'INPUT'
}

beforeEach(() => vi.stubGlobal('HTMLElement', ElementStub))
afterEach(() => vi.unstubAllGlobals())

function setup(doc = createDefaultDoc()) {
  const store = createEditorStore(doc)
  const viewport = { zoom: 4, panX: 50, panY: -25 }
  store.setUi({ viewport, canvasSize: { width: 600, height: 400 } })
  const press = (key: string, options: KeyboardEventInit, target: EventTarget | null = null) => {
    const e = Object.assign(new Event('keydown', { cancelable: true }), {
      key,
      metaKey: false,
      ctrlKey: false,
      ...options,
    })
    Object.defineProperty(e, 'target', { value: target })
    dispatchKey(store, e as KeyboardEvent, new Set())
    return e.defaultPrevented
  }
  return { store, viewport, press }
}

describe('canvas zoom shortcuts', () => {
  it.each([
    ['+', { metaKey: true, shiftKey: true }],
    ['+', { ctrlKey: true, code: 'NumpadAdd' }],
    ['=', { ctrlKey: true }],
  ] as const)(
    'zooms in with %s, keeps the center fixed, and reverses with minus',
    (key, options) => {
      const { store, viewport, press } = setup()
      const { doc, history } = store.getState()
      const center = { x: 300, y: 200 }

      expect(press(key, options)).toBe(true)
      const zoomed = store.getState().ui.viewport
      expect(zoomed.zoom).toBe(5)
      expect(screenToDoc(zoomed, center)).toEqual(screenToDoc(viewport, center))
      expect(press('-', { ctrlKey: true, code: 'NumpadSubtract' })).toBe(true)
      expect(store.getState().ui.viewport).toEqual(viewport)
      expect(store.getState().doc).toBe(doc)
      expect(store.getState().history).toBe(history)
    },
  )

  it('leaves unmatched modifiers and editable targets alone', () => {
    const { store, viewport, press } = setup()
    expect(press('=', {})).toBe(false)
    expect(press('+', { ctrlKey: true, altKey: true })).toBe(false)
    expect(press('-', { ctrlKey: true, shiftKey: true })).toBe(false)
    expect(press('=', { ctrlKey: true }, new ElementStub())).toBe(false)
    expect(store.getState().ui.viewport).toBe(viewport)
  })
})

function setupNudge(mode: 'shape' | 'node') {
  const line = makeLine({ x: 2, y: 4 }, { x: 12, y: 4 })
  if (!line) throw new Error('degenerate line')
  const { store, press } = setup({ ...createDefaultDoc(), shapes: [line] })
  const subpath = line.subpaths[0]
  store.setUi({ activeTool: 'select', mode, snapEnabled: false })
  store.setSelection({
    shapeIds: [line.id],
    nodes:
      mode === 'node'
        ? [{ shapeId: line.id, subpathId: subpath.id, nodeId: subpath.nodes[0].id }]
        : [],
  })
  const xs = () => store.getState().doc.shapes[0].subpaths[0].nodes.map((node) => node.p.x)
  return { store, press, xs }
}

describe.each(['shape', 'node'] as const)('%s nudge shortcuts', (mode) => {
  it.each([
    [0.25, 2],
    [0.5, 4],
    [1, 8],
  ] as const)(
    'uses %s normally and %s with Shift, including repeat and undo',
    (snapIncrement, step) => {
      const { store, press, xs } = setupNudge(mode)
      store.setUi({ snapIncrement })
      const positions = (dx: number) => [2 + dx, mode === 'shape' ? 12 + dx : 12]

      expect(press('ArrowRight', {})).toBe(true)
      expect(xs()).toEqual(positions(snapIncrement))
      expect(press('ArrowRight', { shiftKey: true })).toBe(true)
      expect(xs()).toEqual(positions(snapIncrement + step))
      expect(press('ArrowRight', { shiftKey: true, repeat: true })).toBe(true)
      expect(xs()).toEqual(positions(snapIncrement + 2 * step))
      for (const dx of [snapIncrement + step, snapIncrement, 0]) {
        store.undo()
        expect(xs()).toEqual(positions(dx))
      }
    },
  )

  it('does not nudge during an open gesture', () => {
    const { store, press, xs } = setupNudge(mode)
    store.begin('Gesture')
    const { tx, history } = store.getState()
    expect(press('ArrowRight', {})).toBe(false)
    expect(press('ArrowRight', { shiftKey: true })).toBe(false)
    expect(store.getState().tx).toBe(tx)
    expect(store.getState().history).toBe(history)
    expect(xs()).toEqual([2, 12])
  })
})

describe('local clipboard shortcuts', () => {
  const cmd = { ctrlKey: true }
  function path(id: string, xs: number[], closed = false) {
    return {
      id,
      type: 'path' as const,
      style: { strokeWidth: 3, linecap: 'square' as const },
      subpaths: [
        {
          id: `${id}-path`,
          closed,
          nodes: xs.map((x) => ({
            id: `${id}-${x}`,
            p: { x, y: 5 },
            mode: 'smooth' as const,
            hIn: { x: x - 1, y: 5 },
            hOut: { x: x + 1, y: 5 },
          })),
        },
      ],
    }
  }
  const ref = (shapeId: string, x: number) => ({
    shapeId,
    subpathId: `${shapeId}-path`,
    nodeId: `${shapeId}-${x}`,
  })

  it('copies snapshots in stacking order, cuts and pastes with independent history and fresh IDs', () => {
    const a = path('a', [1, 2, 3], true)
    const b = path('b', [4, 5])
    const doc = { ...createDefaultDoc(), shapes: [a, b] }
    const { store, press } = setup(doc)
    const before = { shapeIds: ['b', 'a'], nodes: [] }
    store.setSelection(before)
    press('c', { metaKey: true })
    expect(store.canUndo()).toBe(false)
    store.updateDoc('Change style', (draft) => {
      draft.shapes[0].style.strokeWidth = 9
    })
    press('v', cmd)
    const pasted = store.getState().doc.shapes.slice(2)
    expect(pasted.map((s) => s.style)).toEqual([a.style, b.style])
    const bounds = selectionBounds([a, b])!
    const dx = 62.5 - (bounds.x + bounds.w / 2)
    const moved = ({ x, y }: { x: number; y: number }) => ({ x: x + dx, y: y + 51.25 })
    const pastedBounds = selectionBounds(pasted)!
    expect(pastedBounds.w).toBeCloseTo(bounds.w)
    expect(pastedBounds.x + pastedBounds.w / 2).toBeCloseTo(62.5)
    expect(pastedBounds.y + pastedBounds.h / 2).toBeCloseTo(56.25)
    expect(pasted[1].subpaths[0].nodes[0].p).toEqual(moved(b.subpaths[0].nodes[0].p))
    expect(pasted[0].subpaths[0]).toMatchObject({
      closed: true,
      nodes: a.subpaths[0].nodes.map(({ p, hIn, hOut, mode }) => ({
        p: moved(p),
        hIn: moved(hIn),
        hOut: moved(hOut),
        mode,
      })),
    })
    const ids = (s: PathShape) => [
      s.id,
      ...s.subpaths.flatMap((sp) => [sp.id, ...sp.nodes.map((n) => n.id)]),
    ]
    expect(new Set([a, b, ...pasted].flatMap(ids)).size).toBe(18)
    expect(store.getState().selection.shapeIds).toEqual(pasted.map((s) => s.id))
    const after = store.getState().selection
    store.undo()
    expect(store.getState().selection).toEqual(before)
    store.redo()
    expect(store.getState().selection).toEqual(after)
    press('x', cmd)
    expect(store.getState().doc.shapes).toHaveLength(2)
    expect(store.getState().selection.shapeIds).toEqual([])
    press('v', cmd)
    expect(store.getState().selection.shapeIds).not.toEqual(after.shapeIds)
    store.undo()
    store.undo()
    expect(store.getState().selection).toEqual(after)
  })

  it('keeps the closed seam together, preserves whole contours, and never bridges gaps', () => {
    const a = path('a', [0, 1, 2, 3, 4, 5, 6, 7], true)
    const b = path('b', [8, 9, 10], true)
    const { store, press } = setup({ ...createDefaultDoc(), shapes: [a, b] })
    store.setUi({ mode: 'node' })
    store.setSelection({
      shapeIds: ['b', 'a'],
      nodes: [
        ref('a', 0),
        ref('a', 4),
        ref('a', 3),
        ref('a', 7),
        ref('b', 10),
        ref('b', 8),
        ref('b', 9),
      ],
    })
    press('c', cmd)
    store.setUi({ mode: 'shape', activeTool: 'pen' })
    press('v', cmd)
    const { doc, selection, ui } = store.getState()
    const [pa, pb] = doc.shapes.slice(2)
    expect(pa.style).toEqual(a.style)
    const startX = pa.subpaths[0].nodes[0].p.x
    expect(pa.subpaths.map((sp) => sp.nodes.map((n) => n.p.x))).toEqual([
      [startX, startX - 7],
      [startX - 4, startX - 3],
    ])
    for (const sp of pa.subpaths) {
      expect(sp.closed).toBe(false)
      expect(sp.nodes[0].hIn).toBeUndefined()
      expect(sp.nodes[0].hOut).toBeDefined()
      expect(sp.nodes[1].hIn).toBeDefined()
      expect(sp.nodes[1].hOut).toBeUndefined()
    }
    expect(pb.subpaths[0].closed).toBe(true)
    expect(pb.subpaths[0].nodes[0].hIn).toEqual({ x: startX, y: 56.25 })
    expect(selection.shapeIds).toEqual([pa.id, pb.id])
    expect(selection.nodes).toHaveLength(7)
    expect(ui).toMatchObject({ mode: 'node', activeTool: 'select' })
  })

  it('joins cuts and pastes mixed runs atomically, preserving all loose points in path order', () => {
    const a = path('a', [0, 1, 2, 3, 4, 5, 6, 7])
    const { store, press } = setup({ ...createDefaultDoc(), shapes: [a] })
    store.setUi({ mode: 'node' })
    const before = { shapeIds: ['a'], nodes: [ref('a', 6), ref('a', 4), ref('a', 3), ref('a', 1)] }
    store.setSelection(before)
    press('x', cmd)
    const cut = store.getState()
    expect(cut.doc.shapes[0].subpaths[0].nodes.map((n) => n.p.x)).toEqual([0, 2, 5, 7])
    press('v', cmd)
    expect(store.getState()).toBe(cut)
    const destination = { shapeIds: ['a'], nodes: [ref('a', 2)] }
    store.setSelection(destination)
    press('v', cmd)
    const { doc, selection, history } = store.getState()
    const nodes = doc.shapes[0].subpaths[0].nodes
    expect(nodes.map((n) => n.p.x)).toEqual([0, 2, 60, 65, 5, 7])
    expect(nodes[2]).toMatchObject({
      mode: 'smooth',
      p: { x: 60, y: 56.25 },
      hIn: { x: 59, y: 56.25 },
      hOut: { x: 61, y: 56.25 },
    })
    expect(nodes[2].id).not.toBe('a-1')
    expect(doc.shapes[1].subpaths[0].nodes.map((n) => n.p.x)).toEqual([62, 63])
    expect(selection.nodes).toHaveLength(4)
    expect(selection.shapeIds).toEqual(['a', doc.shapes[1].id])
    expect(history.past).toHaveLength(2)
    store.undo()
    expect(store.getState().selection).toEqual(destination)
    store.undo()
    expect(store.getState().selection).toEqual(before)
    store.redo()
    store.redo()
    expect(store.getState().selection).toEqual(selection)
  })

  it('centers a lone point after the chosen anchor on every paste using the latest viewport', () => {
    const a = path('a', [0, 1, 2])
    const { store, press } = setup({ ...createDefaultDoc(), shapes: [a] })
    store.setUi({ mode: 'node' })
    store.setSelection({ shapeIds: ['a'], nodes: [ref('a', 0)] })
    press('c', cmd)
    const destination = { shapeIds: ['a'], nodes: [ref('a', 1)] }
    store.setSelection(destination)
    press('v', cmd)
    store.setUi({
      viewport: { zoom: 2, panX: 20, panY: 40 },
      canvasSize: { width: 200, height: 120 },
    })
    store.setSelection(destination)
    press('v', cmd)
    const nodes = store.getState().doc.shapes[0].subpaths[0].nodes
    expect(nodes.map((n) => n.p)).toEqual([
      { x: 0, y: 5 },
      { x: 1, y: 5 },
      { x: 40, y: 10 },
      { x: 62.5, y: 56.25 },
      { x: 2, y: 5 },
    ])
    expect(nodes[2].hIn).toEqual({ x: 39, y: 10 })
  })

  it('does not overwrite a valid clipboard on a last-node cut, stale ref, or segment selection', () => {
    const a = path('a', [0, 1])
    const other = path('other', [2, 3])
    const { store, press } = setup({ ...createDefaultDoc(), shapes: [a, other] })
    store.setSelection({ shapeIds: ['other'], nodes: [] })
    press('c', cmd)
    store.setUi({ mode: 'node' })
    store.setSelection({ shapeIds: ['a'], nodes: [ref('a', 0)] })
    const before = store.getState()
    press('x', cmd)
    expect(store.getState()).toBe(before)
    store.setSelection({ shapeIds: ['a'], nodes: [ref('a', 999)] })
    press('c', cmd)
    press('x', cmd)
    store.setSelection({
      shapeIds: ['a'],
      nodes: [],
      segment: { shapeId: 'a', subpathId: 'a-path', fromId: 'a-0', toId: 'a-1' },
    })
    expect(store.getState().selection.segment).toBeDefined()
    press('c', cmd)
    press('x', cmd)
    expect(store.canUndo()).toBe(false)
    press('v', cmd)
    expect(store.getState().doc.shapes[2].subpaths[0].nodes.map((n) => n.p.x)).toEqual([62, 63])
    expect(store.getState().selection.segment).toBeUndefined()
  })

  it('ignores repeats and open gestures, leaves native fields alone, and isolates editors', () => {
    const a = path('a', [0, 1])
    const { store, press } = setup({ ...createDefaultDoc(), shapes: [a] })
    store.setSelection({ shapeIds: ['a'], nodes: [] })
    for (const key of ['c', 'x', 'v']) {
      expect(press(key, cmd, new ElementStub())).toBe(false)
      press(key, { ...cmd, repeat: true })
    }
    press('v', cmd)
    expect(store.canUndo()).toBe(false)
    store.begin('Gesture')
    press('c', cmd)
    press('x', cmd)
    store.cancel()
    press('v', cmd)
    expect(store.canUndo()).toBe(false)
    press('c', cmd)
    store.begin('Gesture')
    press('v', cmd)
    store.cancel()
    expect(store.canUndo()).toBe(false)
    const second = setup()
    second.press('v', cmd)
    expect(second.store.getState().doc.shapes).toEqual([])
  })
})
