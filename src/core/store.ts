import { createStore } from 'zustand/vanilla'
import { createCommands, type Command, type Recipe } from './commands'
import {
  emptyHistory,
  emptySelection,
  pruneSelection,
  withoutSegment,
  type HistoryState,
  type Selection,
} from './history'
import { captureClipboard, pasteClipboard, type Clipboard } from './commands/clipboard'
import type { ResizeMode } from './commands/document'
import type { IconDoc } from './model'
import type { LoadResult, SaveStatus } from './persistence'
import type { Size, Viewport } from './viewport'

export type ActiveTool = 'select' | 'pen' | 'line' | 'rect' | 'ellipse'
export type EditMode = 'shape' | 'node'
export type SnapIncrement = 1 | 0.5 | 0.25

export type UiState = {
  viewport: Viewport
  canvasSize: Size // measured canvas element size in CSS px; 0 × 0 until the first measurement
  showGrid: boolean
  showSubgrid: boolean
  showKeylines: boolean
  snapEnabled: boolean
  snapIncrement: SnapIncrement
  mode: EditMode
  activeTool: ActiveTool
  rectRadius: number // corner radius for the Rectangle tool, in doc units; clamped when the rect is built
  artboardResizeMode: ResizeMode // how shapes respond when the artboard size field commits; editor UI only
  saveStatus: SaveStatus // 'failing' while the last save attempt failed
  loadNotice: LoadResult['notice'] // set on boot when the stored document was replaced
}

// An open gesture: `base` is the doc at begin(), and every update() recomputes from it.
export type Transaction = { label: string; base: IconDoc; selectionBefore: Selection }

export type EditorState = {
  doc: IconDoc
  selection: Selection
  ui: UiState
  history: HistoryState
  tx: Transaction | null
}

export const defaultUi: UiState = {
  viewport: { zoom: 16, panX: 0, panY: 0 },
  canvasSize: { width: 0, height: 0 },
  showGrid: true,
  showSubgrid: false,
  showKeylines: false,
  snapEnabled: true,
  snapIncrement: 0.5,
  mode: 'shape',
  activeTool: 'select',
  rectRadius: 0,
  artboardResizeMode: 'keep',
  saveStatus: 'ok',
  loadNotice: null,
}

export const isNodeSelect = (ui: Pick<UiState, 'mode' | 'activeTool'>): boolean =>
  ui.mode === 'node' && ui.activeTool === 'select'

// Routing includes the mode for Select and Pen, but primitives have only a Shape context.
export const toolContext = ({ mode, activeTool }: Pick<UiState, 'mode' | 'activeTool'>) =>
  activeTool === 'select' || activeTool === 'pen' ? (`${mode}-${activeTool}` as const) : activeTool

function updateUi(ui: UiState, patch: Partial<UiState>, selection: Selection): UiState {
  const next = { ...ui, ...patch }
  if (next.activeTool !== 'select' && next.activeTool !== 'pen') {
    if (patch.activeTool !== undefined) next.mode = 'shape'
    else if (next.mode === 'node') next.activeTool = 'select'
  }
  // Only redirect on entry; selection loss must not retire an active Node Pen.
  if (
    selection.shapeIds.length === 0 &&
    toolContext(next) === 'node-pen' &&
    toolContext(ui) !== 'node-pen'
  ) {
    next.mode = 'shape'
  }
  return next
}

export type Listener = (doc: IconDoc) => void

// Deliberately omits setState: documents change only through the command API below.
type HistoryInput = {
  before: (direction: 'undo' | 'redo') => boolean
  after: (applied: boolean, direction: 'undo' | 'redo') => void
}

export type EditorStore = {
  getState: () => EditorState
  subscribe: (listener: () => void) => () => void
  setSelection: (selection: Selection) => void
  setUi: (patch: Partial<UiState>) => void
  dispatch: (command: Command) => void
  updateDoc: (label: string, recipe: Recipe) => void
  replaceDocument: (doc: IconDoc) => void
  begin: (label: string) => void
  update: (recipe: Recipe) => void
  commit: (selectionAfter?: Selection) => void
  cancel: () => void
  bindHistoryInput: (input: HistoryInput) => () => void
  undo: () => void
  redo: () => void
  clipboard: (action: 'copy' | 'cut' | 'paste') => void
  canUndo: () => boolean
  canRedo: () => boolean
  subscribeCommitted: (listener: Listener) => () => void
}

export function createEditorStore(initialDoc: IconDoc): EditorStore {
  const api = createStore<EditorState>()(() => ({
    doc: initialDoc,
    selection: emptySelection,
    ui: defaultUi,
    history: emptyHistory,
    tx: null,
  }))
  const listeners = new Set<Listener>()
  const selectionFor = (sel: Selection, doc: IconDoc) =>
    pruneSelection(isNodeSelect(api.getState().ui) ? sel : withoutSegment(sel), doc)
  const commands = createCommands(api, (doc) => listeners.forEach((l) => l(doc)), selectionFor)
  let historyInput: HistoryInput | undefined
  let navigating = false
  const navigate = (direction: 'undo' | 'redo') => {
    if (navigating) return
    navigating = true
    const input = historyInput
    let applied = false
    try {
      applied = !input?.before(direction) && commands[direction]()
    } finally {
      try {
        if (historyInput === input) input?.after(applied, direction)
      } finally {
        navigating = false
      }
    }
  }
  let clipboard: Clipboard | undefined
  const setUi: EditorStore['setUi'] = (patch) => {
    const { ui, selection } = api.getState()
    const next = updateUi(ui, patch, selection)
    api.setState({
      ui: next,
      selection: isNodeSelect(next) ? selection : withoutSegment(selection),
    })
  }
  return {
    getState: api.getState,
    subscribe: api.subscribe,
    setSelection: (selection) => {
      api.setState({
        selection: selection.segment ? selectionFor(selection, api.getState().doc) : selection,
      })
    },
    setUi,
    clipboard: (action) => {
      const { doc, selection, ui, tx } = api.getState()
      if (tx) return
      const nodeSelect = isNodeSelect(ui)
      if (action === 'paste') {
        if (!clipboard) return
        const payload = clipboard
        const command = pasteClipboard(doc, selection, nodeSelect, payload)
        if (!command) return
        commands.dispatch(command)
        if (payload.kind === 'points' && !nodeSelect) setUi({ activeTool: 'select', mode: 'node' })
      } else {
        const captured = captureClipboard(doc, selection, nodeSelect, action === 'cut')
        if (!captured) return
        clipboard = captured.payload
        if (captured.command) commands.dispatch({ ...captured.command, label: 'Cut' })
      }
    },
    ...commands,
    bindHistoryInput: (input) => {
      historyInput = input
      return () => {
        if (historyInput === input) historyInput = undefined
      }
    },
    undo: () => navigate('undo'),
    redo: () => navigate('redo'),
    subscribeCommitted: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
