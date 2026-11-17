import { useEffect, useRef } from 'react'
import { fitViewport } from '../../core'
import { useEditorStore } from '../../hooks/use-editor'
import { useViewportInput } from '../../hooks/use-viewport-input'
import ContentLayer from './content-layer'
import GridLayer from './grid-layer'
import s from './styles.module.css'

export default function Canvas() {
  const store = useEditorStore()
  const ref = useRef<HTMLDivElement>(null)
  useViewportInput(ref)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const { doc, ui } = store.getState()
      const prev = ui.canvasSize
      if (width === prev.width && height === prev.height) return
      const canvasSize = { width, height }
      // The first non-zero measurement fits the artboard; later resizes keep the current view.
      const first = prev.width === 0 && prev.height === 0 && width > 0 && height > 0
      store.setUi(first ? { canvasSize, viewport: fitViewport(canvasSize, doc.size, doc.size) } : { canvasSize })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [store])

  return (
    <div ref={ref} className={s.canvas}>
      <GridLayer />
      {/* keylines layer: Step 2.2 */}
      <ContentLayer />
      {/* selection and tool overlay: Steps 2.3 and 2.4 */}
      <svg className={s.overlay} aria-hidden="true" />
    </div>
  )
}
