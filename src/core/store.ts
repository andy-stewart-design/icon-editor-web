import { createStore } from 'zustand/vanilla'
import { createCommands, type Command, type Recipe } from './commands'
import { emptyHistory, emptySelection, type HistoryState, type Selection } from './history'
import type { IconDoc } from './model'
import type { Size, Viewport } from './viewport'

export type ActiveTool = 'select' | 'node' | 'pen' | 'line' | 'rect' | 'ellipse'
export type SnapIncrement = 1 | 0.5 | 0.25

export type UiState = {
  viewport: Viewport
  canvasSize: Size // measured canvas element size in CSS px; 0 × 0 until the first measurement
  showGrid: boolean
  showSubgrid: boolean
  showKeylines: boolean
  snapEnabled: boolean
  snapIncrement: SnapIncrement
  activeTool: ActiveTool
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
  activeTool: 'select',
}

export type Listener = (doc: IconDoc) => void

// Deliberately omits setState: documents change only through the command API below.
export type EditorStore = {
  getState: () => EditorState
  subscribe: (listener: () => void) => () => void
  setSelection: (selection: Selection) => void
  setUi: (patch: Partial<UiState>) => void
  dispatch: (command: Command) => void
  updateDoc: (label: string, recipe: Recipe) => void
  begin: (label: string) => void
  update: (recipe: Recipe) => void
  commit: (selectionAfter?: Selection) => void
  cancel: () => void
  undo: () => void
  redo: () => void
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
  const commands = createCommands(api, (doc) => listeners.forEach((l) => l(doc)))
  return {
    getState: api.getState,
    subscribe: api.subscribe,
    setSelection: (selection) => api.setState({ selection }),
    setUi: (patch) => api.setState({ ui: { ...api.getState().ui, ...patch } }),
    ...commands,
    subscribeCommitted: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
