import { produce } from 'immer'
import { expect, it } from 'vitest'
import { boardContent } from '../model'
import { serializeSvg } from '../serialize'
import { activeBoard, createEditorStore } from '../store'
import { artboardWorkspace } from '../test-fixtures/artboard-workspace'
import {
  addArtboard,
  deleteArtboard,
  duplicateArtboard,
  moveArtboard,
  renameArtboard,
} from './artboards'

it('adds an empty board in the first free spot to the right without altering the source', () => {
  const store = createEditorStore(artboardWorkspace)
  const { doc, activeBoardId } = store.getState()
  const [source, blocker] = doc.boards
  const svg = serializeSvg(boardContent(doc, source))
  store.dispatch(addArtboard(doc, activeBoardId))
  const next = store.getState()
  expect(activeBoard(next)).toMatchObject({
    name: 'Artboard 1',
    size: 24,
    shapes: [],
    origin: { x: blocker.origin.x + blocker.size + 8, y: source.origin.y },
  })
  expect(next.doc.boards[0]).toBe(source)
  expect(serializeSvg(boardContent(next.doc, next.doc.boards[0]))).toBe(svg)
})

it('duplicates full SVG artwork in order with independent data and fresh identities', () => {
  const doc = produce(artboardWorkspace, (draft) => {
    draft.boards[0].shapes[0].style.strokeWidth = 2
    draft.boards[0].shapes[0].subpaths[0].nodes[0].hOut = { x: 12, y: 0 }
  })
  const source = doc.boards[0]
  const store = createEditorStore(doc)
  const svg = serializeSvg(boardContent(doc, source))
  store.dispatch(duplicateArtboard(doc, source.id))
  const copy = activeBoard(store.getState())
  expect(copy.id).not.toBe(source.id)
  store.undo()
  expect(activeBoard(store.getState())).toBe(source)
  store.redo()
  expect(activeBoard(store.getState())).toBe(copy)
  expect(copy.name).toBe('Small copy')
  expect(copy.size).toBe(source.size)
  expect(copy.origin.x).toBe(doc.boards[1].origin.x + doc.boards[1].size + 8)
  expect(serializeSvg(boardContent(doc, copy))).toBe(svg)
  for (const [i, shape] of copy.shapes.entries()) {
    const original = source.shapes[i]
    expect(shape.id).not.toBe(original.id)
    expect(shape.style).not.toBe(original.style)
    for (const [j, path] of shape.subpaths.entries()) {
      const originalPath = original.subpaths[j]
      expect(path.id).not.toBe(originalPath.id)
      for (const [k, node] of path.nodes.entries()) {
        const originalNode = originalPath.nodes[k]
        expect(node.id).not.toBe(originalNode.id)
        expect(node.p).not.toBe(originalNode.p)
        if (node.hOut) expect(node.hOut).not.toBe(originalNode.hOut)
      }
    }
  }
  store.dispatch(renameArtboard(' Variant '))
  expect(activeBoard(store.getState()).name).toBe('Variant')
  store.undo()
  expect(activeBoard(store.getState()).name).toBe('Small copy')
  store.redo()
  expect(activeBoard(store.getState()).name).toBe('Variant')
  store.updateDoc('Edit duplicate', (board) => {
    board.shapes[0].subpaths[0].nodes[0].p.x += 1
  })
  const next = store.getState()
  expect(serializeSvg(boardContent(next.doc, activeBoard(next)))).not.toBe(svg)
  expect(serializeSvg(boardContent(next.doc, next.doc.boards[0]))).toBe(svg)
  expect(next.doc.boards[0].name).toBe('Small')
})

it('does not record deleting the final board or renaming it to a blank or unchanged name', () => {
  const [board] = artboardWorkspace.boards
  const store = createEditorStore({ ...artboardWorkspace, boards: [board] })
  store.setSelection({ shapeIds: [board.shapes[0].id], nodes: [] })
  const before = store.getState()
  store.dispatch(deleteArtboard())
  store.dispatch(renameArtboard(' '))
  store.dispatch(renameArtboard(board.name))
  expect(store.getState().doc).toBe(before.doc)
  expect(store.getState().activeBoardId).toBe(board.id)
  expect(store.getState().selection).toEqual(before.selection)
  expect(store.canUndo()).toBe(false)
})

it('moves an overflowing board over another without changing either SVG, in one committed edit', () => {
  const doc = artboardWorkspace
  const [other, source] = doc.boards
  const svg = serializeSvg(boardContent(doc, source))
  const store = createEditorStore(doc)
  const saved: unknown[] = []
  store.subscribeCommitted((next) => saved.push(next))
  store.activateBoard(source.id)
  const move = moveArtboard(other.origin)
  store.begin(move.label)
  store.update(moveArtboard({ x: -3, y: 4 }).recipe)
  store.update(move.recipe)
  const moved = store.getState().doc
  expect(moved.boards[1]).toEqual({ ...source, origin: other.origin })
  expect(moved.boards[1].shapes).toBe(source.shapes)
  expect(moved.boards[0]).toBe(other)
  expect(serializeSvg(boardContent(moved, moved.boards[1]))).toBe(svg)
  expect(saved).toHaveLength(0)
  store.commit()
  expect(saved).toEqual([moved])
  store.undo()
  expect(store.getState().doc).toBe(doc)
  expect(store.canUndo()).toBe(false)
  store.redo()
  expect(store.getState().doc).toBe(moved)
  expect(activeBoard(store.getState()).id).toBe(source.id)
})

it('restores the starting layout without saving or recording a canceled or zero-distance move', () => {
  const store = createEditorStore(artboardWorkspace)
  const board = activeBoard(store.getState())
  const saved: unknown[] = []
  store.subscribeCommitted((next) => saved.push(next))
  store.begin('Move artboard')
  store.update(moveArtboard({ x: 9, y: 12 }).recipe)
  store.cancel()
  expect(store.getState().doc).toBe(artboardWorkspace)
  store.begin('Move artboard')
  store.update(moveArtboard({ x: 9, y: 12 }).recipe)
  store.update(moveArtboard(board.origin).recipe)
  store.commit()
  expect(store.getState().doc).toBe(artboardWorkspace)
  expect(store.canUndo()).toBe(false)
  expect(saved).toHaveLength(0)
})
