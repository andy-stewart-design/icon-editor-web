import { useEffect, useRef, type PointerEvent, type RefObject } from 'react'
import { docToScreen, moveArtboard, screenToDoc, type Pt, type Transaction } from '../../core'
import { useEditor, useEditorStore } from '../../hooks/use-editor'
import s from './styles.module.css'

type Drag = {
  id: number
  target: HTMLButtonElement
  canvas: HTMLDivElement
  start: Pt
  origin: Pt
  tx: Transaction | null
}

export default function ArtboardLabels({
  canvasRef,
}: {
  canvasRef: RefObject<HTMLDivElement | null>
}) {
  const store = useEditorStore()
  const boards = useEditor((st) => st.doc.boards)
  const activeId = useEditor((st) => st.activeBoardId)
  const viewport = useEditor((st) => st.ui.viewport)
  const drag = useRef<Drag | null>(null)

  const release = () => {
    const g = drag.current
    drag.current = null
    if (!g) return
    delete g.canvas.dataset.boardDrag
    if (g.target.hasPointerCapture(g.id)) g.target.releasePointerCapture(g.id)
  }

  useEffect(() => {
    const cancel = () => {
      const g = drag.current
      if (!g) return
      release()
      if (g.tx && store.getState().tx === g.tx) store.cancel()
    }
    const keydown = (e: KeyboardEvent) => {
      if (!drag.current || ['Shift', 'Control', 'Alt', 'Meta', ' '].includes(e.key)) return
      cancel()
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    const unsubscribe = store.subscribe(() => {
      if (drag.current?.tx && store.getState().tx !== drag.current.tx) release()
    })
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('blur', cancel)
      unsubscribe()
      cancel()
    }
  }, [store])

  const worldPoint = (e: PointerEvent, canvas: HTMLDivElement) => {
    const r = canvas.getBoundingClientRect()
    return screenToDoc(store.getState().ui.viewport, {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
    })
  }

  const move = (g: Drag, e: PointerEvent) => {
    const point = worldPoint(e, g.canvas)
    const dx = point.x - g.start.x
    const dy = point.y - g.start.y
    if (!g.tx) {
      if (!dx && !dy) return
      store.begin('Move artboard')
      g.tx = store.getState().tx
    }
    store.update(moveArtboard({ x: g.origin.x + dx, y: g.origin.y + dy }).recipe)
  }

  return boards.map((board) => {
    const { x, y } = docToScreen(viewport, board.origin)
    return (
      <button
        key={board.id}
        type="button"
        className={s.boardLabel}
        aria-pressed={board.id === activeId}
        style={{ left: x, top: y }}
        onClick={(e) => {
          // Pointer activation happens on press; keyboard activation arrives as a zero-detail click.
          if (e.detail === 0) store.activateBoard(board.id)
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          e.stopPropagation()
          const canvas = canvasRef.current
          if (
            !canvas ||
            e.button !== 0 ||
            !e.isPrimary ||
            drag.current ||
            canvas.dataset.pan ||
            canvas.dataset.drawing ||
            store.getState().tx
          )
            return
          // Let a focused properties field commit against its original board before switching.
          e.currentTarget.focus({ preventScroll: true })
          store.activateBoard(board.id)
          drag.current = {
            id: e.pointerId,
            target: e.currentTarget,
            canvas,
            start: worldPoint(e, canvas),
            origin: board.origin,
            tx: null,
          }
          canvas.dataset.boardDrag = 'true'
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          e.stopPropagation()
          const g = drag.current
          if (g && e.pointerId === g.id) move(g, e)
        }}
        onPointerUp={(e) => {
          e.stopPropagation()
          const g = drag.current
          if (!g || e.pointerId !== g.id || e.button !== 0) return
          move(g, e)
          release()
          if (g.tx) store.commit()
        }}
        onPointerCancel={cancelPointer}
        onLostPointerCapture={cancelPointer}
      >
        {board.name}
      </button>
    )
  })

  function cancelPointer(e: PointerEvent<HTMLButtonElement>) {
    e.stopPropagation()
    const g = drag.current
    if (!g || e.pointerId !== g.id) return
    release()
    if (g.tx) store.cancel()
  }
}
