import { useLayoutEffect, useRef } from 'react'
import { fitViewport } from '../../core'
import { useEditor, useEditorStore } from '../../hooks/use-editor'
import { useViewportInput } from '../../hooks/use-viewport-input'
import ContentLayer from './content-layer'
import GridLayer from './grid-layer'
import KeylineLayer from './keyline-layer'
import s from './styles.module.css'

export default function Canvas() {
  const store = useEditorStore()
  const ref = useRef<HTMLDivElement>(null)
  useViewportInput(ref)
  // The first non-zero measurement always fits the artboard, so a measured canvas means a fitted view.
  // Layers stay unrendered until then, so the default viewport never paints.
  const ready = useEditor((st) => st.ui.canvasSize.width > 0 && st.ui.canvasSize.height > 0)

  // Layout effect: the first measurement and fit happen before the browser paints, so the default
  // viewport never flashes on load. The ResizeObserver then handles later size changes.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (width: number, height: number) => {
      const { doc, ui } = store.getState()
      const prev = ui.canvasSize
      if (width === prev.width && height === prev.height) return
      const canvasSize = { width, height }
      // The first non-zero measurement fits the artboard; later resizes keep the current view.
      const first = prev.width === 0 && prev.height === 0 && width > 0 && height > 0
      store.setUi(first ? { canvasSize, viewport: fitViewport(canvasSize, doc.size, doc.size) } : { canvasSize })
    }
    const rect = el.getBoundingClientRect()
    measure(rect.width, rect.height)
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width, entry.contentRect.height))
    observer.observe(el)
    return () => observer.disconnect()
  }, [store])

  return (
    <div ref={ref} className={s.canvas}>
      {ready && (
        <>
          <GridLayer />
          <KeylineLayer />
          <ContentLayer />
          {/* selection and tool overlay: Steps 2.3 and 2.4 */}
          <svg className={s.overlay} aria-hidden="true" />
        </>
      )}
    </div>
  )
}
