import { createContext, useContext, useMemo, useSyncExternalStore } from 'react'
import {
  activeBoard,
  boardContent,
  boardViewport,
  type EditorState,
  type EditorStore,
} from '../core'

export const EditorContext = createContext<EditorStore | null>(null)

export function useEditorStore(): EditorStore {
  const store = useContext(EditorContext)
  if (!store)
    throw new Error(
      'useEditorStore: no EditorStore in context; wrap the tree in EditorContext.Provider',
    )
  return store
}

// Selectors must return stable references (primitives or existing state objects); a selector that
// builds a new object on every call makes useSyncExternalStore re-render forever.
export function useEditor<T>(selector: (s: EditorState) => T): T {
  const store = useEditorStore()
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()))
}

export function useActiveContent() {
  const doc = useEditor((state) => state.doc)
  const board = useEditor(activeBoard)
  return useMemo(() => boardContent(doc, board), [doc, board])
}

export function useBoardViewport() {
  const origin = useEditor((state) => activeBoard(state).origin)
  const vp = useEditor((state) => state.ui.viewport)
  return boardViewport(vp, origin)
}
