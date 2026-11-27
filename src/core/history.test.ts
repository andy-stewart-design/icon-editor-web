import { artboardWorkspace } from './test-fixtures/artboard-workspace'
import { describe, expect, it } from 'vitest'
import { createEditorStore } from './store'
import type { Artboard, IconDoc } from './model'
import type { Selection } from './history'

const emptySel: Selection = { shapeIds: [], nodes: [] }

const baseDoc = (): IconDoc => ({
  id: 'doc1',
  version: 2,
  strokeWidth: 1.5,
  linecap: 'round',
  linejoin: 'round',
  boards: [
    {
      id: 'board1',
      name: 'Artboard 1',
      size: 24,
      origin: { x: 0, y: 0 },
      shapes: [
        {
          id: 's1',
          type: 'path',
          style: {},
          subpaths: [
            { id: 'sp1', closed: false, nodes: [{ id: 'n1', p: { x: 0, y: 0 }, mode: 'corner' }] },
          ],
        },
      ],
    },
  ],
})

const addShape = (id: string) => (d: Artboard) => {
  d.shapes.push({ id, type: 'path', style: {}, subpaths: [] })
}

describe('editor store history', () => {
  it('50 updates plus one commit make one entry, and undo restores the original doc', () => {
    const store = createEditorStore(baseDoc())
    const original = store.getState().doc
    const committed: IconDoc[] = []
    store.subscribeCommitted((doc) => committed.push(doc))

    store.begin('Move node')
    for (let i = 1; i <= 50; i++) {
      store.update((d) => {
        d.shapes[0].subpaths[0].nodes[0].p.x = i
      })
    }
    expect(store.getState().doc.boards[0].shapes[0].subpaths[0].nodes[0].p.x).toBe(50)
    expect(committed).toHaveLength(0)
    expect(store.canUndo()).toBe(false)

    store.commit()
    expect(committed).toHaveLength(1)
    expect(store.getState().history.past).toHaveLength(1)

    store.undo()
    expect(store.getState().doc).toBe(original)
    expect(store.getState().doc).toEqual(baseDoc())
    expect(committed).toHaveLength(2)

    store.redo()
    expect(store.getState().doc.boards[0].shapes[0].subpaths[0].nodes[0].p.x).toBe(50)
  })

  it('cancel restores the base doc with no entry and no notification', () => {
    const store = createEditorStore(baseDoc())
    const original = store.getState().doc
    let notified = 0
    store.subscribeCommitted(() => notified++)

    store.begin('Drag')
    store.update(addShape('s2'))
    store.update(addShape('s3'))
    store.cancel()

    expect(store.getState().doc).toBe(original)
    expect(store.getState().tx).toBeNull()
    expect(store.canUndo()).toBe(false)
    expect(notified).toBe(0)
  })

  it('a new command after undo clears redo', () => {
    const store = createEditorStore(baseDoc())
    store.updateDoc('Add A', addShape('A'))
    store.undo()
    expect(store.canRedo()).toBe(true)

    store.updateDoc('Add B', addShape('B'))
    expect(store.canRedo()).toBe(false)
    expect(store.getState().doc.boards[0].shapes.map((s) => s.id)).toEqual(['s1', 'B'])
  })

  it('restores the selection on undo and drops IDs that no longer exist', () => {
    const store = createEditorStore(baseDoc())
    store.setSelection({
      shapeIds: ['s1'],
      nodes: [{ shapeId: 's1', subpathId: 'sp1', nodeId: 'n1' }],
    })
    store.dispatch({
      label: 'Delete shape',
      recipe: (d) => {
        d.shapes = []
      },
      selectionAfter: emptySel,
    })
    expect(store.getState().selection).toEqual(emptySel)

    store.undo()
    expect(store.getState().selection).toEqual({
      shapeIds: ['s1'],
      nodes: [{ shapeId: 's1', subpathId: 'sp1', nodeId: 'n1' }],
    })

    // Redo deletes s1 again, so the node and shape refs must drop out of the selection.
    store.redo()
    expect(store.getState().selection).toEqual(emptySel)
  })

  it('a no-op commit creates no entry', () => {
    const store = createEditorStore(baseDoc())
    let notified = 0
    store.subscribeCommitted(() => notified++)

    store.begin('Nothing')
    store.update(() => {})
    store.commit()
    store.updateDoc('Nothing either', () => {})

    expect(store.canUndo()).toBe(false)
    expect(notified).toBe(0)
  })

  it('retires bound input before navigation and blocks reentrant history calls', () => {
    const store = createEditorStore(baseDoc())
    store.updateDoc('Add A', addShape('A'))
    store.updateDoc('Add B', addShape('B'))
    const calls: unknown[] = []
    const unbind = store.bindHistoryInput({
      before(direction) {
        calls.push([direction, store.getState().history.past.length])
        store.undo()
        return false
      },
      after(applied) {
        calls.push([applied, store.getState().history.past.length])
        store.redo()
      },
    })
    store.undo()
    expect(calls).toEqual([
      ['undo', 2],
      [true, 1],
    ])
    unbind()
    store.redo()
    expect(store.getState().history.past).toHaveLength(2)
    expect(calls).toHaveLength(2)
  })

  it('undo during an open transaction cancels it first, then undoes the previous entry', () => {
    const store = createEditorStore(baseDoc())
    store.updateDoc('Add A', addShape('A'))
    store.begin('Drag')
    store.update(addShape('B'))
    store.undo()

    expect(store.getState().tx).toBeNull()
    expect(store.getState().doc).toEqual(baseDoc())
    expect(store.canRedo()).toBe(true)
  })
})

describe('replaceDocument', () => {
  it('clears undo, redo, selection and any open transaction, and notifies committed listeners', () => {
    const store = createEditorStore(baseDoc())
    store.updateDoc('add', addShape('s2'))
    store.undo()
    store.setSelection({ shapeIds: ['s1'], nodes: [] })
    store.begin('drag')
    store.update(addShape('s3'))
    const seen: IconDoc[] = []
    store.subscribeCommitted((doc) => seen.push(doc))

    const next: IconDoc = {
      ...baseDoc(),
      id: 'doc2',
      boards: [{ ...baseDoc().boards[0], id: 'board2', shapes: [] }],
    }
    store.replaceDocument(next)

    const state = store.getState()
    expect(state.doc).toBe(next)
    expect(state.tx).toBeNull()
    expect(state.selection).toEqual(emptySel)
    expect(store.canUndo()).toBe(false)
    expect(store.canRedo()).toBe(false)
    expect(seen).toEqual([next])
  })
})

describe('board-scoped history', () => {
  it('restores the edited board and its selection on undo/redo, without touching other artwork', () => {
    const store = createEditorStore(artboardWorkspace)
    const [small, large] = artboardWorkspace.boards
    store.setSelection({ shapeIds: ['small-overflow', 'large-overflow'], nodes: [] })
    expect(store.getState().selection.shapeIds).toEqual(['small-overflow'])
    store.activateBoard(large.id)
    expect(store.getState().selection).toEqual(emptySel)
    const selection = { shapeIds: ['large-overflow'], nodes: [] }
    store.setSelection(selection)
    store.begin('Translate path')
    store.activateBoard(small.id) // a press-time transaction owns the board until it ends
    store.update((board) => {
      board.shapes[0].subpaths[0].nodes[0].p.x -= 10
    })
    store.commit()
    expect(store.getState().doc.boards[0]).toBe(small)
    const after = store.getState().doc
    store.activateBoard(small.id)
    store.undo()
    expect(store.getState()).toMatchObject({
      doc: artboardWorkspace,
      activeBoardId: large.id,
      selection,
    })
    store.activateBoard(small.id)
    store.redo()
    expect(store.getState()).toMatchObject({ doc: after, activeBoardId: large.id, selection })
    store.replaceDocument(baseDoc())
    expect(store.getState()).toMatchObject({ activeBoardId: 'board1', selection: emptySel })
  })
})
