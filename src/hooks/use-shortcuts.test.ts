import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultDoc, createEditorStore, screenToDoc } from '../core'
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
