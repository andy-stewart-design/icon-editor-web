import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { activeBoard, boardContent, initialWorkspaceViewport } from '../../core'
import { useEditor, useEditorStore } from '../../hooks/use-editor'
import { useToolInput } from '../../hooks/use-tool-input'
import { useViewportInput } from '../../hooks/use-viewport-input'
import ContentLayer from './content-layer'
import GridLayer from './grid-layer'
import KeylineLayer from './keyline-layer'
import NodeOverlay from './node-overlay'
import SelectionOutline from './selection-outline'
import SelectionOverlay from './selection-overlay'
import ToolOverlay from './tool-overlay'
import s from './styles.module.css'

export default function Canvas() {
  const store = useEditorStore()
  const ref = useRef<HTMLDivElement>(null)
  useViewportInput(ref)
  // Tool handlers coexist with the viewport handlers: viewport pan takes the pointer when it starts first.
  const tools = useToolInput()
  const doc = useEditor((st) => st.doc)
  const board = useEditor(activeBoard)
  const preview = tools.primitives.find((p) => p.kind === 'contourPreview')
  // Use the same temporary geometry for the styled path and its selection outline.
  // Nothing outside these render layers reads the preview as document state.
  const displayDoc = useMemo(() => {
    const content = boardContent(doc, board)
    if (!preview) return content
    return {
      ...content,
      shapes: content.shapes.map((shape) =>
        shape.id === preview.shapeId && shape.subpaths.includes(preview.previous)
          ? {
              ...shape,
              subpaths: shape.subpaths.map((sp) => (sp === preview.previous ? preview.next : sp)),
            }
          : shape,
      ),
    }
  }, [doc, board, preview])
  // The first non-zero measurement frames the workspace, so a measured canvas means a fitted view.
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
      // The first non-zero measurement fits the workspace; later resizes keep the current view.
      const first = prev.width === 0 && prev.height === 0 && width > 0 && height > 0
      store.setUi(
        first
          ? { canvasSize, viewport: initialWorkspaceViewport(canvasSize, doc) }
          : { canvasSize },
      )
    }
    const rect = el.getBoundingClientRect()
    measure(rect.width, rect.height)
    const observer = new ResizeObserver(([entry]) =>
      measure(entry.contentRect.width, entry.contentRect.height),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [store])

  return (
    <div
      ref={ref}
      className={s.canvas}
      style={{ '--tool-cursor': tools.cursor } as CSSProperties}
      {...tools.handlers}
    >
      {ready && (
        <>
          {doc.boards.map((item) => (
            <GridLayer key={item.id} board={item} />
          ))}
          <GridLayer board={board} active />
          <KeylineLayer />
          {doc.boards.map((item) => (
            <ContentLayer
              key={item.id}
              origin={item.origin}
              doc={item === board ? displayDoc : boardContent(doc, item)}
            />
          ))}
          <SelectionOutline doc={displayDoc} />
          <SelectionOverlay />
          <NodeOverlay />
          <ToolOverlay primitives={tools.primitives} />
        </>
      )}
    </div>
  )
}
