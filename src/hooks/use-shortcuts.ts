import { useEffect } from 'react'
import { nudgeSelection, selectAll, type ActiveTool, type NudgeDir } from '../core'
import { isEditable } from './editable'
import { useEditorStore } from './use-editor'

// Tool letters from the spec's keyboard table.
const TOOL_KEYS: Record<string, ActiveTool> = { v: 'select', l: 'line', r: 'rect', e: 'ellipse' }
const ARROWS: Record<string, NudgeDir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }

// App-wide shortcuts. Grid (G), view (0, 1) and Space pan stay in use-viewport-input.
// Ignored while focus is in a text field or choice. Tool keys and the backtick are also ignored with Cmd, Ctrl or Alt held.
// Undo and redo take Cmd or Ctrl (Shift for redo); Alt is not part of either.
export function useShortcuts(): void {
  const store = useEditorStore()

  useEffect(() => {
    const controller = new AbortController()

    window.addEventListener(
      'keydown',
      (e) => {
        if (isEditable(e.target)) return
        const key = e.key.toLowerCase()

        if ((e.metaKey || e.ctrlKey) && !e.altKey) {
          if (key === 'a' && !e.shiftKey) {
            e.preventDefault()
            store.dispatch(selectAll(store.getState().doc))
            return
          }
          if (key !== 'z') return
          e.preventDefault()
          if (e.shiftKey) store.redo()
          else store.undo()
          return
        }

        if (e.metaKey || e.ctrlKey || e.altKey) return
        if (e.key === '`') {
          e.preventDefault()
          if (e.repeat) return
          store.setUi({ snapEnabled: !store.getState().ui.snapEnabled })
          return
        }
        const dir = ARROWS[e.key]
        if (dir) {
          const { selection, ui } = store.getState()
          if (selection.shapeIds.length === 0) return
          e.preventDefault() // no page scroll
          store.dispatch(nudgeSelection(selection, dir, ui.snapIncrement, e.shiftKey))
          return
        }
        const tool = TOOL_KEYS[key]
        if (tool && !e.repeat) store.setUi({ activeTool: tool })
      },
      { signal: controller.signal },
    )

    return () => controller.abort()
  }, [store])
}
