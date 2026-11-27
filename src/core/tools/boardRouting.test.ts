import { describe, expect, it } from 'vitest'
import type { Pt } from '../model'
import { createEditorStore, activeContent, activeViewport } from '../store'
import { artboardWorkspace } from '../test-fixtures/artboard-workspace'
import { docToScreen, screenToDoc } from '../viewport'
import { boardAt, paintedShapeAt, prepareToolPress } from './boardRouting'
import { createLineTool } from './lineTool'
import { createNodeTool } from './nodeTool'
import { createPenTool } from './penTool'
import { createSelectTool } from './selectTool'
import { buildSnapFn } from './snapFn'
import type { Tool } from './types'

const [small, large] = artboardWorkspace.boards

function setup() {
  const store = createEditorStore(artboardWorkspace)
  store.setUi({ viewport: { zoom: 16, panX: 200, panY: 19 } })
  const screen = (world: Pt) => docToScreen(store.getState().ui.viewport, world)
  const event = (world: Pt) => {
    const state = store.getState()
    return {
      pt: screenToDoc(activeViewport(state), screen(world)),
      workspacePt: world,
      zoom: 16,
      shift: false,
      alt: false,
      suspendSnap: false,
      space: false,
      snap: buildSnapFn(state, 16, false),
    }
  }
  const down = (tool: Tool, world: Pt) => {
    prepareToolPress(store, screen(world), false, tool.hasActiveDrawing?.() ?? false)
    tool.pointerDown(event(world))
  }
  const click = (tool: Tool, world: Pt) => {
    down(tool, world)
    tool.pointerUp(event(world))
  }
  return { store, event, down, click }
}

const ownedIds = (state: ReturnType<ReturnType<typeof createEditorStore>['getState']>) =>
  activeContent(state).shapes.map(({ id }) => id)

describe('board routing', () => {
  it('picks visible overflow ahead of interior and changes active board on empty clicks', () => {
    const { store, click } = setup()
    const tool = createSelectTool(store)
    click(tool, { x: 7, y: 21.5 }) // Large overflow on Small
    expect(store.getState().activeBoardId).toBe(large.id)
    expect(store.getState().selection.shapeIds).toEqual(['large-overflow'])
    click(tool, { x: 10, y: 11 })
    expect(store.getState().activeBoardId).toBe(small.id)
    expect(store.getState().selection.shapeIds).toEqual([])
  })

  it('uses the last rendered board for overlapping interiors and strokes', () => {
    const doc = {
      ...artboardWorkspace,
      boards: [small, { ...large, origin: { ...small.origin, y: small.origin.y - 7 } }],
    } satisfies typeof artboardWorkspace
    const hit = { x: small.origin.x + 9, y: small.origin.y + 8 }
    expect(boardAt(doc, hit)?.id).toBe(large.id)
    expect(paintedShapeAt(doc, hit, 16)?.shapeId).toBe('large-overflow')
  })

  it('projects a translated node hit and edits only the owning board', () => {
    const { store, down, event, click } = setup()
    store.setUi({ mode: 'node' })
    const tool = createNodeTool(store)
    const end = { x: 4.25, y: 21.5 }
    click(tool, { x: 7, y: 21.5 })
    down(tool, end)
    tool.pointerUp(event({ x: 8.25, y: 23.5 }))
    const { doc } = store.getState()
    expect(doc.boards[0]).toBe(small)
    expect(doc.boards[1].shapes[0].subpaths[0].nodes[0].p).toEqual({ x: -8, y: 17 })
  })

  it('pins line ownership to the raw start interior or the active board and snaps locally', () => {
    const { store, down, event } = setup()
    store.setUi({ activeTool: 'line' })
    const tool = createLineTool(store)
    const start = { x: large.origin.x + 1.6, y: large.origin.y + 2.1 }
    const finish = { x: -5, y: 10 }
    down(tool, start)
    tool.pointerMove(event(finish))
    expect(store.getState().activeBoardId).toBe(large.id)
    expect(store.getState().doc).toBe(artboardWorkspace)
    expect(tool.overlay().find((p) => p.kind === 'draft')?.shape.subpaths[0].nodes[0].p).toEqual({
      x: 1.5,
      y: 2,
    })
    tool.pointerUp(event(finish))
    expect(ownedIds(store.getState())).toHaveLength(2)
    down(tool, { x: 14, y: 14 }) // gap, with Large active
    tool.pointerUp(event(finish))
    expect(ownedIds(store.getState())).toHaveLength(3)
    expect(store.getState().doc.boards[0]).toBe(small)
  })

  it('limits a marquee crossing both boards to the start board', () => {
    const { store, down, event } = setup()
    store.activateBoard(large.id)
    const tool = createSelectTool(store)
    down(tool, { x: -11, y: 10 })
    tool.pointerUp(event({ x: 46, y: 37 }))
    expect(store.getState().activeBoardId).toBe(small.id)
    expect(store.getState().selection.shapeIds).toEqual(['small-overflow', 'small-interior'])
  })

  it('keeps a provisional Pen contour on its starting board across clicks', () => {
    const { store, click } = setup()
    store.setUi({ activeTool: 'pen' })
    const tool = createPenTool(store)
    click(tool, { x: 20.25, y: 10.5 })
    expect(store.getState().doc).toBe(artboardWorkspace)
    click(tool, { x: -8, y: 13 })
    expect(store.getState().activeBoardId).toBe(large.id)
    expect(ownedIds(store.getState())).toHaveLength(2)
    expect(store.getState().doc.boards[0]).toBe(small)
    const nodes = activeContent(store.getState()).shapes[1].subpaths[0].nodes
    expect(nodes.map(({ p }) => p)).toEqual([
      { x: 4, y: 4 },
      { x: -24, y: 6.5 },
    ])
  })

  it('resumes a selected overflowing endpoint and keeps the attachment on its owner', () => {
    const { store, click } = setup()
    store.activateBoard(large.id)
    store.setSelection({ shapeIds: ['large-overflow'], nodes: [] })
    store.setUi({ activeTool: 'pen', mode: 'node' })
    const tool = createPenTool(store, { mode: 'node' })
    click(tool, { x: 4.25, y: 21.5 }) // endpoint painted inside Small
    click(tool, { x: 3.25, y: 27.5 })
    expect(store.getState().activeBoardId).toBe(large.id)
    expect(store.getState().doc.boards[0]).toBe(small)
    expect(activeContent(store.getState()).shapes[0].subpaths[0].nodes[0].p).toEqual({
      x: -13,
      y: 21,
    })
  })
})
