import { boardContent, type IconDoc, type Pt } from '../model'
import { activeBoard, activeContent, type EditorState, type EditorStore } from '../store'
import { screenToDoc } from '../viewport'
import { idlePenTarget } from './penTarget'
import { hitNode } from './nodeTool'
import { hitTestShape, selectionHandleAt } from './selectTool'

export const boardPoint = (world: Pt, origin: Pt): Pt => ({
  x: world.x - origin.x,
  y: world.y - origin.y,
})

export function boardAt(doc: IconDoc, world: Pt) {
  return doc.boards.findLast(({ origin, size }) => {
    const { x, y } = boardPoint(world, origin)
    return x >= 0 && y >= 0 && x <= size && y <= size
  })
}

export function paintedShapeAt(doc: IconDoc, world: Pt, zoom: number) {
  for (let i = doc.boards.length - 1; i >= 0; i--) {
    const board = doc.boards[i]
    const shapeId = hitTestShape(boardContent(doc, board), boardPoint(world, board.origin), zoom)
    if (shapeId !== null) return { board, shapeId }
  }
}

export function boardForPress(state: EditorState, world: Pt, shift: boolean) {
  const { doc, ui, selection } = state
  const active = activeBoard(state)
  const zoom = ui.viewport.zoom
  const local = boardPoint(world, active.origin)
  if (ui.activeTool === 'select') {
    const content = activeContent(state)
    const painted = paintedShapeAt(doc, world, zoom)
    // Controls are drawn above artwork; preserve existing handle/node precedence.
    if (
      ui.mode === 'node'
        ? hitNode(content, selection, local, zoom)
        : !(shift && painted) && selectionHandleAt(state, { pt: local, zoom, shift })
    ) {
      return active
    }
    if (painted) return painted.board
  }
  if (ui.activeTool === 'pen' && ui.mode === 'node') {
    // Node Pen edits the selected path, including endpoints that overflow another board.
    const shape =
      selection.shapeIds.length === 1 &&
      active.shapes.find(({ id }) => id === selection.shapeIds[0])
    if (shape && idlePenTarget(shape, local, zoom, doc.strokeWidth).kind !== 'empty') return active
  }
  return boardAt(doc, world) ?? active
}

// Retain the origin across the press and across clicks in a live Pen drawing.
export function prepareToolPress(store: EditorStore, screen: Pt, shift: boolean, drawing: boolean) {
  if (drawing) return
  const state = store.getState()
  store.activateBoard(boardForPress(state, screenToDoc(state.ui.viewport, screen), shift).id)
}
