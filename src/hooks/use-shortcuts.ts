import { useEffect } from 'react'
import {
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
  type ActiveTool,
  type EditorState,
  type EditorStore,
  type NudgeDir,
} from '../core'
import { isEditable } from './editable'
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

// Enter is left alone on buttons, links and selects so a focused toolbar button still activates with Enter.
// Text fields are excluded earlier by isEditable.
const ACTIVATABLE_TAGS = new Set(['BUTTON', 'A', 'SELECT'])
const isActivatable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && ACTIVATABLE_TAGS.has(target.tagName)
const enterToggles = (s: Context, e: KeyboardEvent): boolean =>
  !isActivatable(e.target) && s.ui.activeTool === 'select' && (s.ui.mode === 'node' || hasShapes(s))

const tool = (key: string, activeTool: ActiveTool, shift: Shift = 'any'): Binding => ({
  keys: [key],
  shift,
  repeat: false,
  run: (store) => store.setUi({ activeTool }),
})

// Nudge step: the snap increment, or 1 unit with Shift. `nodes` picks the Node tool's node nudge over shape nudge.
const nudge = (dir: NudgeDir, nodes: boolean): Binding['run'] => {
  const [ux, uy] =
    dir === 'left' ? [-1, 0] : dir === 'right' ? [1, 0] : dir === 'up' ? [0, -1] : [0, 1]
  return (store, e) => {
    const { selection, ui } = store.getState()
    const step = nudgeAmount(ui.snapIncrement, e.shiftKey)
    if (nodes) store.dispatch(translateNodes(selection, ux * step, uy * step))
    else store.dispatch(nudgeSelection(selection, dir, ui.snapIncrement, e.shiftKey))
  }
}

const flip = (axis: 'h' | 'v'): Binding => ({
  keys: [axis],
  shift: 'required',
  when: hasShapes,
  repeat: false,
  run: (store) => store.dispatch(flipSelection(store.getState().selection, axis)),
})

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
  // Enter toggles Select <-> Node. Enter in the Pen tool finishes the path (use-tool-input).
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
  { keys: ['a'], cmd: true, run: (store) => store.dispatch(selectAll(store.getState().doc)) },
  // Duplicate is prevented even with nothing selected, so Cmd+D never opens the bookmark dialog.
  {
    keys: ['d'],
    cmd: true,
    repeat: false,
    run: (store) => {
      const { doc, selection } = store.getState()
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

  // Nudge. Node-tool nudging comes first so it wins over shape nudging when nodes are selected.
  { keys: ['arrowleft'], shift: 'any', when: nodeContext, repeat: true, run: nudge('left', true) },
  {
    keys: ['arrowright'],
    shift: 'any',
    when: nodeContext,
    repeat: true,
    run: nudge('right', true),
  },
  { keys: ['arrowup'], shift: 'any', when: nodeContext, repeat: true, run: nudge('up', true) },
  { keys: ['arrowdown'], shift: 'any', when: nodeContext, repeat: true, run: nudge('down', true) },
  { keys: ['arrowleft'], shift: 'any', when: hasShapes, repeat: true, run: nudge('left', false) },
  { keys: ['arrowright'], shift: 'any', when: hasShapes, repeat: true, run: nudge('right', false) },
  { keys: ['arrowup'], shift: 'any', when: hasShapes, repeat: true, run: nudge('up', false) },
  { keys: ['arrowdown'], shift: 'any', when: hasShapes, repeat: true, run: nudge('down', false) },

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
      const { doc, ui } = store.getState()
      store.setUi({ viewport: fitViewport(ui.canvasSize, doc.size, doc.size) })
    },
  },
  {
    keys: ['1'],
    repeat: false,
    run: (store) => {
      const { doc, ui } = store.getState()
      store.setUi({ viewport: actualSizeViewport(ui.canvasSize, doc.size, doc.size) })
    },
  },
]

// The one keydown dispatcher. Returns after the first binding that matches, so table order is the priority.
function dispatchKey(store: EditorStore, e: KeyboardEvent, segmentDeletes: Set<string>): void {
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
