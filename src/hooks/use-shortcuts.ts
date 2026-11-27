import { useEffect } from 'react'
import {
  activeBoard,
  workspaceViewport,
  activeContent,
  actualSizeViewport,
  bringForward,
  cutSelectedSegment,
  deleteSelection,
  deleteSelectedNodes,
  duplicateSelection,
  fitViewport,
  flipSelection,
  isNodeSelect,
  nudgeAmount,
  nudgeSelection,
  selectAll,
  sendBackward,
  translateNodes,
  zoomAt,
  type ActiveTool,
  type EditorState,
  type EditorStore,
  type NudgeDir,
} from '../core'
import { isActivatable, isEditable } from './editable'
import { useEditorStore } from './use-editor'

// Single source of truth for the app-wide keyboard shortcuts (spec R25, "Keyboard shortcuts").
// Space (hold to pan, and move while drawing) is not in this table; it lives in use-viewport-input and use-tool-input.
//
// Matching: `keys` are lowercase KeyboardEvent.key values. `cmd` means Cmd (Meta) on macOS or Ctrl elsewhere.
// Alt never matches. `shift` is 'none' (default), 'required', or 'any'. `when` gates a binding by context. When it
// is false the key falls through to the next binding and is not prevented, so the browser keeps its default.
// `repeat` lets auto-repeat run the action; without it a repeat is still prevented but does nothing.

type Shift = 'none' | 'required' | 'any'
type Context = EditorState
type Binding = {
  keys: readonly string[]
  cmd?: boolean
  shift?: Shift
  when?: (s: Context, e: KeyboardEvent) => boolean
  repeat?: boolean
  run: (store: EditorStore, e: KeyboardEvent) => void
}

const hasShapes = (s: Context): boolean => s.selection.shapeIds.length > 0
const nodeContext = (s: Context): boolean => isNodeSelect(s.ui) && s.selection.nodes.length > 0

const enterToggles = (s: Context, e: KeyboardEvent): boolean =>
  !isActivatable(e.target) && s.ui.activeTool === 'select' && (s.ui.mode === 'node' || hasShapes(s))

const tool = (key: string, activeTool: ActiveTool, shift: Shift = 'any'): Binding => ({
  keys: [key],
  shift,
  repeat: false,
  run: (store) => store.setUi({ activeTool }),
})

// While a gesture is open, its transaction owns document edits.
const nudge = (dir: NudgeDir): Binding => {
  const [ux, uy] =
    dir === 'left' ? [-1, 0] : dir === 'right' ? [1, 0] : dir === 'up' ? [0, -1] : [0, 1]
  return {
    keys: [`arrow${dir}`],
    shift: 'any',
    when: (s) => !s.tx && (nodeContext(s) || hasShapes(s)),
    repeat: true,
    run: (store, e) => {
      const state = store.getState()
      const { selection, ui } = state
      if (nodeContext(state)) {
        const step = nudgeAmount(ui.snapIncrement, e.shiftKey)
        store.dispatch(translateNodes(selection, ux * step, uy * step))
      } else {
        store.dispatch(nudgeSelection(selection, dir, ui.snapIncrement, e.shiftKey))
      }
    },
  }
}

const flip = (axis: 'h' | 'v'): Binding => ({
  keys: [axis],
  shift: 'required',
  when: hasShapes,
  repeat: false,
  run: (store) => store.dispatch(flipSelection(store.getState().selection, axis)),
})

const ZOOM_STEP = 1.25

const zoomCanvas =
  (factor: number): Binding['run'] =>
  (store) => {
    const { viewport, canvasSize } = store.getState().ui
    const center = { x: canvasSize.width / 2, y: canvasSize.height / 2 }
    store.setUi({ viewport: zoomAt(viewport, viewport.zoom * factor, center) })
  }

const zoomIn = zoomCanvas(ZOOM_STEP)

const BINDINGS: readonly Binding[] = [
  // Tools. Shift+V is flip when shapes are selected; without a selection it does nothing, as before.
  tool('v', 'select', 'none'),
  {
    keys: ['a'],
    shift: 'any',
    repeat: false,
    run: (store) => store.setUi({ mode: 'node', activeTool: 'select' }),
  },
  tool('p', 'pen'),
  tool('l', 'line'),
  tool('r', 'rect'),
  tool('e', 'ellipse'),
  // Enter toggles Select <-> Node. Pen Enter is handled separately by use-tool-input.
  {
    keys: ['enter'],
    shift: 'none',
    when: enterToggles,
    repeat: false,
    run: (store) => {
      const { ui } = store.getState()
      store.setUi({ mode: ui.mode === 'node' ? 'shape' : 'node' })
    },
  },

  // Edit. Undo and redo repeat while held; Cmd+D does not, so holding it doesn't stack duplicates.
  { keys: ['z'], cmd: true, run: (store) => store.undo() },
  { keys: ['z'], cmd: true, shift: 'required', run: (store) => store.redo() },
  {
    keys: ['a'],
    cmd: true,
    run: (store) => store.dispatch(selectAll(activeContent(store.getState()))),
  },
  { keys: ['c'], cmd: true, run: (store) => store.clipboard('copy') },
  { keys: ['x'], cmd: true, run: (store) => store.clipboard('cut') },
  { keys: ['v'], cmd: true, run: (store) => store.clipboard('paste') },
  // Duplicate is prevented even with nothing selected, so Cmd+D never opens the bookmark dialog.
  {
    keys: ['d'],
    cmd: true,
    repeat: false,
    run: (store) => {
      const { selection } = store.getState()
      const doc = activeContent(store.getState())
      if (selection.shapeIds.length > 0) store.dispatch(duplicateSelection(doc, selection))
    },
  },
  // A selected segment takes priority over deleting its owner.
  {
    keys: ['delete', 'backspace'],
    shift: 'any',
    when: (s) => isNodeSelect(s.ui) && !!s.selection.segment,
    run: (store) => {
      if (!store.getState().tx) store.dispatch(cutSelectedSegment(store.getState().selection))
    },
  },
  // Delete. In the Node tool with nodes selected, Delete breaks the path at those nodes (left open) and Shift+Delete
  // joins the neighbours across them. Otherwise both remove the selected shapes.
  {
    keys: ['delete', 'backspace'],
    shift: 'none',
    when: nodeContext,
    repeat: true,
    run: (store) => store.dispatch(deleteSelectedNodes(store.getState().selection, 'break')),
  },
  {
    keys: ['delete', 'backspace'],
    shift: 'required',
    when: nodeContext,
    repeat: true,
    run: (store) => store.dispatch(deleteSelectedNodes(store.getState().selection, 'join')),
  },
  {
    keys: ['delete', 'backspace'],
    shift: 'any',
    when: hasShapes,
    repeat: true,
    run: (store) => store.dispatch(deleteSelection(store.getState().selection)),
  },

  // Arrange. Bracket keys with Cmd, matching the spec. These repeat while held, as they always have.
  {
    keys: [']'],
    cmd: true,
    when: hasShapes,
    repeat: true,
    run: (store) => store.dispatch(bringForward(store.getState().selection)),
  },
  {
    keys: ['['],
    cmd: true,
    when: hasShapes,
    repeat: true,
    run: (store) => store.dispatch(sendBackward(store.getState().selection)),
  },
  flip('h'),
  flip('v'),

  nudge('left'),
  nudge('right'),
  nudge('up'),
  nudge('down'),

  // '+' can be shifted (main keyboard) or unshifted (e.g. keypad).
  { keys: ['+'], cmd: true, shift: 'any', run: zoomIn },
  { keys: ['='], cmd: true, run: zoomIn },
  { keys: ['-'], cmd: true, run: zoomCanvas(1 / ZOOM_STEP) },

  // View. Toggling these on hold would flicker, so they ignore repeat.
  {
    keys: ['g'],
    shift: 'any',
    repeat: false,
    run: (store) => store.setUi({ showGrid: !store.getState().ui.showGrid }),
  },
  {
    keys: ['`'],
    repeat: false,
    run: (store) => store.setUi({ snapEnabled: !store.getState().ui.snapEnabled }),
  },
  {
    keys: ['0'],
    repeat: false,
    run: (store) => {
      const state = store.getState()
      const { ui } = state
      const { size, origin } = activeBoard(state)
      store.setUi({ viewport: workspaceViewport(fitViewport(ui.canvasSize, size, size), origin) })
    },
  },
  {
    keys: ['1'],
    repeat: false,
    run: (store) => {
      const state = store.getState()
      const { ui } = state
      const { size, origin } = activeBoard(state)
      store.setUi({
        viewport: workspaceViewport(actualSizeViewport(ui.canvasSize, size, size), origin),
      })
    },
  },
]

// The one keydown dispatcher. Returns after the first binding that matches, so table order is the priority.
export function dispatchKey(
  store: EditorStore,
  e: KeyboardEvent,
  segmentDeletes: Set<string>,
): void {
  const key = e.key.toLowerCase()
  if (!e.repeat) segmentDeletes.delete(key)

  // Keys typed into a field belong to the field.
  if (isEditable(e.target) || e.altKey) return
  const cmd = e.metaKey || e.ctrlKey
  if (e.repeat && segmentDeletes.has(key)) {
    e.preventDefault()
    return
  }
  const state = store.getState()

  for (const b of BINDINGS) {
    if (!b.keys.includes(key) || (b.cmd ?? false) !== cmd) continue
    const shift = b.shift ?? 'none'
    if (shift === 'none' && e.shiftKey) continue
    if (shift === 'required' && !e.shiftKey) continue
    if (b.when && !b.when(state, e)) continue
    e.preventDefault()
    if (e.repeat && !b.repeat) return
    // Once this physical press cuts a segment, its repeats must never delete the owner.
    if (
      !cmd &&
      (key === 'delete' || key === 'backspace') &&
      isNodeSelect(state.ui) &&
      state.selection.segment
    ) {
      segmentDeletes.add(key)
    }
    b.run(store, e)
    return
  }
}

// Registers the table on window keydown. Mounted once in the app shell.
export function useShortcuts(): void {
  const store = useEditorStore()

  useEffect(() => {
    const controller = new AbortController()
    const segmentDeletes = new Set<string>()
    window.addEventListener('keydown', (e) => dispatchKey(store, e, segmentDeletes), {
      signal: controller.signal,
    })
    return () => controller.abort()
  }, [store])
}
