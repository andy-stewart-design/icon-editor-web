import { useEffect, type RefObject } from 'react'
import { zoomAt, type Pt, type Viewport } from '../core'
import { isEditable } from './editable'
import { useEditorStore } from './use-editor'

// Safari reports pinch as non-standard gesture events that carry a cumulative scale.
type GestureEvent = Event & { scale: number }

const LINE_PX = 16 // wheel deltas in lines are scaled to CSS px
const ZOOM_RATE = 0.01 // per px of ctrl/meta+wheel delta; the trackpad pinch delta is small

// Deltas are in CSS px. deltaMode 1 is lines and 2 is pages; a page is taken as the canvas height.
function wheelPx(e: WheelEvent, pageHeight: number): Pt {
  const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? pageHeight : 1
  return { x: e.deltaX * unit, y: e.deltaY * unit }
}

// Viewport input for the canvas element: wheel and pinch zoom and pan, and middle or Space drag.
// Changes go through setUi, so they never create history entries.
export function useViewportInput(ref: RefObject<HTMLDivElement | null>): void {
  const store = useEditorStore()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const controller = new AbortController()
    const { signal } = controller

    let spaceHeld = false
    let drag: { id: number; x: number; y: number } | null = null
    let gestureStart: Viewport | null = null
    let last: Pt | null = null // last pointer position in canvas coordinates

    const local = (e: MouseEvent): Pt => {
      const r = el.getBoundingClientRect()
      last = { x: e.clientX - r.left, y: e.clientY - r.top }
      return last
    }

    const panBy = (dx: number, dy: number) => {
      const vp = store.getState().ui.viewport
      store.setUi({ viewport: { ...vp, panX: vp.panX + dx, panY: vp.panY + dy } })
    }

    // A draw in progress (data-drawing, set by use-tool-input) keeps the crosshair. Space then moves the shape.
    const syncCursor = () => {
      if (drag) el.dataset.pan = 'drag'
      else if (spaceHeld && !el.dataset.drawing && !el.dataset.boardDrag) el.dataset.pan = 'space'
      else delete el.dataset.pan
    }

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        if (el.dataset.boardDrag) return
        const pt = local(e)
        const { ui } = store.getState()
        const d = wheelPx(e, ui.canvasSize.height)
        if (e.ctrlKey || e.metaKey) {
          const vp = store.getState().ui.viewport
          store.setUi({ viewport: zoomAt(vp, vp.zoom * Math.exp(-d.y * ZOOM_RATE), pt) })
        } else {
          panBy(-d.x, -d.y)
        }
      },
      { passive: false, signal },
    )

    // Safari pinch: zoom from the viewport captured at gesturestart, around the last pointer position.
    el.addEventListener(
      'gesturestart',
      (e) => {
        e.preventDefault()
        gestureStart = el.dataset.boardDrag ? null : store.getState().ui.viewport
      },
      { signal },
    )
    el.addEventListener(
      'gesturechange',
      (e) => {
        e.preventDefault()
        if (!gestureStart || el.dataset.boardDrag) return
        const pt = last ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 }
        store.setUi({
          viewport: zoomAt(gestureStart, gestureStart.zoom * (e as GestureEvent).scale, pt),
        })
      },
      { signal },
    )
    el.addEventListener(
      'gestureend',
      () => {
        gestureStart = null
      },
      { signal },
    )

    el.addEventListener(
      'pointerdown',
      (e) => {
        // Space + press during a draw moves the shape instead of panning, so it never starts a pan.
        if (el.dataset.boardDrag) return
        const spacePan = e.button === 0 && spaceHeld && !el.dataset.drawing
        if (!(e.button === 1 || spacePan)) return
        e.preventDefault() // stops middle-click autoscroll
        el.setPointerCapture(e.pointerId)
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
        syncCursor()
      },
      { signal },
    )
    el.addEventListener(
      'pointermove',
      (e) => {
        local(e)
        // Keeps the cursor current after a draw ends: the tool clears data-drawing on pointerup, which comes later.
        syncCursor()
        if (!drag || e.pointerId !== drag.id) return
        panBy(e.clientX - drag.x, e.clientY - drag.y)
        drag.x = e.clientX
        drag.y = e.clientY
      },
      { signal },
    )
    const endDrag = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const id = drag.id
      drag = null
      if (el.hasPointerCapture(id)) el.releasePointerCapture(id)
      syncCursor()
    }
    el.addEventListener('pointerup', endDrag, { signal })
    el.addEventListener('pointercancel', endDrag, { signal })
    el.addEventListener('lostpointercapture', endDrag, { signal })

    // Space is hold-to-pan, not a shortcut, so it is handled here rather than in use-shortcuts. Ignored in fields
    // and with Cmd, Ctrl or Alt held. Fit, 100% and grid live in the shortcut table.
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return
        if (e.key !== ' ') return
        e.preventDefault() // no page scroll
        if (!e.repeat) {
          spaceHeld = true
          syncCursor()
        }
      },
      { signal },
    )
    window.addEventListener(
      'keyup',
      (e) => {
        if (e.code !== 'Space') return
        spaceHeld = false
        syncCursor()
      },
      { signal },
    )
    // A Space keyup missed while the window is unfocused would leave the pan cursor stuck on.
    window.addEventListener(
      'blur',
      () => {
        spaceHeld = false
        syncCursor()
      },
      { signal },
    )

    return () => {
      controller.abort()
      delete el.dataset.pan
    }
  }, [ref, store])
}
