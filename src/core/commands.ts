import { produce } from 'immer'
import {
  emptyHistory,
  emptySelection,
  recordEntry,
  stepBack,
  stepForward,
  type HistoryEntry,
  type Selection,
} from './history'
import { artboardFor, type Artboard, type IconDoc } from './model'
import type { EditorState } from './store'

export type Recipe = (board: Artboard, draft: IconDoc) => void
export type Command = { label: string; recipe: Recipe; selectionAfter?: Selection }

type StateApi = {
  getState: () => EditorState
  setState: (patch: Partial<EditorState>) => void
}

// Misuse throws: dispatch or update outside a transaction, begin inside one, and dispatch inside one.
// Gesture ends are forgiving: commit or cancel with no open transaction is a no-op.
// undo and redo cancel an open transaction first, so the gesture's pre-drag doc is what gets undone.
export function createCommands(
  api: StateApi,
  notify: (doc: IconDoc) => void,
  selectionFor: (sel: Selection, doc: IconDoc, boardId: string) => Selection,
) {
  // Records one entry and notifies, unless the recipe left the doc reference unchanged.
  const record = (entry: HistoryEntry): void => {
    const { history } = api.getState()
    if (entry.before === entry.after) {
      api.setState({ selection: entry.selectionAfter })
      return
    }
    api.setState({
      doc: entry.after,
      activeBoardId: artboardFor(entry.after, entry.boardId).id,
      selection: entry.selectionAfter,
      history: recordEntry(history, entry),
    })
    notify(entry.after)
  }

  const dispatch = (command: Command): void => {
    const { doc, selection, tx, activeBoardId } = api.getState()
    if (tx) throw new Error(`dispatch("${command.label}") during open transaction "${tx.label}"`)
    const after = produce(doc, (draft) => command.recipe(artboardFor(draft, activeBoardId), draft))
    const selectionBefore = selection
    const selectionAfter = selectionFor(command.selectionAfter ?? selection, after, activeBoardId)
    record({
      boardId: activeBoardId,
      label: command.label,
      before: doc,
      after,
      selectionBefore,
      selectionAfter,
    })
  }

  const cancel = (): void => {
    const { tx } = api.getState()
    if (!tx) return
    api.setState({ doc: tx.base, tx: null })
  }

  const begin = (label: string): void => {
    const { doc, selection, tx, activeBoardId } = api.getState()
    if (tx) throw new Error(`begin("${label}") while transaction "${tx.label}" is open`)
    api.setState({ tx: { boardId: activeBoardId, label, base: doc, selectionBefore: selection } })
  }

  const update = (recipe: Recipe): void => {
    const { tx } = api.getState()
    if (!tx) throw new Error('update() without an open transaction')
    api.setState({
      doc: produce(tx.base, (draft) => recipe(artboardFor(draft, tx.boardId), draft)),
    })
  }

  const commit = (selectionAfter?: Selection): void => {
    const { doc, selection, tx } = api.getState()
    if (!tx) return
    api.setState({ tx: null })
    record({
      boardId: tx.boardId,
      label: tx.label,
      before: tx.base,
      after: doc,
      selectionBefore: tx.selectionBefore,
      selectionAfter: selectionFor(selectionAfter ?? selection, doc, tx.boardId),
    })
  }

  // Swaps the whole document (New document). Drops any open transaction, history and selection.
  const replaceDocument = (doc: IconDoc): void => {
    api.setState({
      doc,
      activeBoardId: doc.boards[0].id,
      tx: null,
      history: emptyHistory,
      selection: emptySelection,
    })
    notify(doc)
  }

  const undo = () => {
    cancel()
    const step = stepBack(api.getState().history)
    if (!step) return false
    const { entry } = step
    api.setState({
      doc: entry.before,
      activeBoardId: artboardFor(entry.before, entry.boardId).id,
      selection: selectionFor(entry.selectionBefore, entry.before, entry.boardId),
      history: step.history,
    })
    notify(entry.before)
    return true
  }

  const redo = () => {
    cancel()
    const step = stepForward(api.getState().history)
    if (!step) return false
    const { entry } = step
    api.setState({
      doc: entry.after,
      activeBoardId: artboardFor(entry.after, entry.boardId).id,
      selection: selectionFor(entry.selectionAfter, entry.after, entry.boardId),
      history: step.history,
    })
    notify(entry.after)
    return true
  }

  return {
    dispatch,
    updateDoc: (label: string, recipe: Recipe) => dispatch({ label, recipe }),
    replaceDocument,
    begin,
    update,
    commit,
    cancel,
    undo,
    redo,
    canUndo: () => api.getState().history.past.length > 0,
    canRedo: () => api.getState().history.future.length > 0,
  }
}
