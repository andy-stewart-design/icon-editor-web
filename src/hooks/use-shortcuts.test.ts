import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultDoc, createEditorStore, screenToDoc } from '../core'
import { dispatchKey } from './use-shortcuts'

class ElementStub extends EventTarget {
  tagName = 'INPUT'
}

beforeEach(() => vi.stubGlobal('HTMLElement', ElementStub))
afterEach(() => vi.unstubAllGlobals())

function setup() {
  const store = createEditorStore(createDefaultDoc())
  const viewport = { zoom: 4, panX: 50, panY: -25 }
  store.setUi({ viewport, canvasSize: { width: 600, height: 400 } })
  const press = (key: string, options: KeyboardEventInit, target: EventTarget | null = null) => {
    const e = Object.assign(new Event('keydown', { cancelable: true }), { key, ...options })
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
