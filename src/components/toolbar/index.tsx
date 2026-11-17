import { actualSizeViewport, createDefaultDoc, fitViewport } from '../../core'
import { useEditor, useEditorStore } from '../../hooks/use-editor'
import { createUuidIdGen } from '../../platform/ids'
import s from './styles.module.css'

export default function Toolbar() {
  const store = useEditorStore()
  const showGrid = useEditor((e) => e.ui.showGrid)
  const showSubgrid = useEditor((e) => e.ui.showSubgrid)
  const zoom = useEditor((e) => e.ui.viewport.zoom)

  const fit = () => {
    const { doc, ui } = store.getState()
    store.setUi({ viewport: fitViewport(ui.canvasSize, doc.size, doc.size) })
  }

  const actualSize = () => {
    const { doc, ui } = store.getState()
    store.setUi({ viewport: actualSizeViewport(ui.canvasSize, doc.size, doc.size) })
  }

  // Autosave persists the replacement through subscribeCommitted; the viewport already fits the same artboard size.
  const newDocument = () => {
    if (!window.confirm('Start a new document? The current one will be replaced.')) return
    store.replaceDocument(createDefaultDoc(createUuidIdGen()))
  }

  return (
    <div className={s.toolbar}>
      <div className={s.group}>
        <button type="button" className={s.button} onClick={newDocument}>
          New
        </button>
        <button
          type="button"
          className={s.button}
          aria-pressed={showGrid}
          onClick={() => store.setUi({ showGrid: !store.getState().ui.showGrid })}
        >
          Grid
        </button>
        <button
          type="button"
          className={s.button}
          aria-pressed={showSubgrid}
          onClick={() => store.setUi({ showSubgrid: !store.getState().ui.showSubgrid })}
        >
          Subgrid
        </button>
      </div>
      <div className={s.group}>
        <button type="button" className={s.button} onClick={fit}>
          Fit
        </button>
        <button type="button" className={s.button} onClick={actualSize}>
          100%
        </button>
        <span className={s.zoom}>{`${Math.round(zoom * 100)}%`}</span>
      </div>
    </div>
  )
}
