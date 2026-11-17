import { useEditor, useEditorStore } from '../../hooks/use-editor'
import s from './styles.module.css'

// Non-blocking notices, pinned bottom-left so they don't affect the toolbar or canvas layout.
export default function Notices() {
  const store = useEditorStore()
  const loadNotice = useEditor((e) => e.ui.loadNotice)
  const saveStatus = useEditor((e) => e.ui.saveStatus)

  if (loadNotice === null && saveStatus === 'ok') return null

  return (
    <div className={s.stack}>
      {loadNotice === 'recovered' && (
        <div className={s.notice} role="status">
          <p>Your previous document couldn&apos;t be loaded. A backup was kept and a new document was started.</p>
          <button type="button" className={s.button} onClick={() => store.setUi({ loadNotice: null })}>
            Dismiss
          </button>
        </div>
      )}
      {saveStatus === 'failing' && (
        <div className={s.notice} role="status">
          <p>Changes aren&apos;t being saved. Your work stays open, but it may be lost on reload.</p>
        </div>
      )}
    </div>
  )
}
