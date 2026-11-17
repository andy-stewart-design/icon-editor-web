import { useEffect } from 'react'
import { isEditable } from './editable'
import { useEditorStore } from './use-editor'

// App-wide shortcuts. Grid (G), view (0, 1) and Space pan stay in use-viewport-input.
// Ignored while focus is in a text field or choice, and with Cmd, Ctrl or Alt held.
export function useShortcuts(): void {
  const store = useEditorStore()

  useEffect(() => {
    const controller = new AbortController()

    window.addEventListener(
      'keydown',
      (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return
        if (e.key === '`') {
          e.preventDefault()
          if (e.repeat) return
          store.setUi({ snapEnabled: !store.getState().ui.snapEnabled })
        }
      },
      { signal: controller.signal },
    )

    return () => controller.abort()
  }, [store])
}
