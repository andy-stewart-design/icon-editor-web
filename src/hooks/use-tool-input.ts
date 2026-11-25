import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import {
  buildSnapFn,
  createEllipseTool,
  createLineTool,
  createNodeTool,
  createPenTool,
  createRectTool,
  createSelectTool,
  screenToDoc,
  isNodeSelect,
  toolContext,
  type EditorStore,
  type OverlayPrimitive,
  type Pt,
  type Tool,
  type ToolEvent,
} from '../core'
import { isEditable } from './editable'
import { useEditorStore } from './use-editor'

// Modifier flags shared by pointer and keyboard events.
type Modifiers = Pick<MouseEvent, 'shiftKey' | 'altKey' | 'metaKey' | 'ctrlKey'>

// The active pointer press that a tool is following. `local` is the last position in canvas px, so the
// document point can be recomputed against the current viewport when a modifier key changes mid-drag.
// `el` is the canvas element, which is marked with data-drawing while the press lasts.
type Gesture = { id: number; local: Pt; el: HTMLDivElement }

export type ToolInput = {
  handlers: {
    onDoubleClick: (e: ReactMouseEvent<HTMLDivElement>) => void
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void
    onPointerLeave: (e: ReactPointerEvent<HTMLDivElement>) => void
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void
    onLostPointerCapture: (e: ReactPointerEvent<HTMLDivElement>) => void
  }
  cursor: string | undefined // CSS cursor of the active tool; undefined when no drawing tool is active
  primitives: OverlayPrimitive[] // tool feedback in document space, for ToolOverlay
}

const MODIFIER_KEYS = new Set(['Shift', 'Alt', 'Meta', 'Control'])
// Keys whose change re-sends the last position, so the preview updates without the pointer moving.
const RESEND_KEYS = new Set(MODIFIER_KEYS)
// Space is matched by code: with Option held, macOS reports a different `key` for it.
const isSpace = (e: KeyboardEvent): boolean => e.code === 'Space'
const shouldResend = (e: KeyboardEvent): boolean => RESEND_KEYS.has(e.key) || isSpace(e)

// Forget the gesture before releasing capture: lostpointercapture must not finish it again.
function releaseGesture(ref: { current: Gesture | null }): void {
  const g = ref.current
  ref.current = null
  if (!g) return
  delete g.el.dataset.drawing
  if (g.el.hasPointerCapture(g.id)) g.el.releasePointerCapture(g.id)
}

function createTool(
  store: EditorStore,
  context: ReturnType<typeof toolContext>,
  rectRadius: number,
): Tool {
  switch (context) {
    case 'line':
      return createLineTool(store)
    case 'rect':
      return createRectTool({ host: store, radius: () => rectRadius })
    case 'ellipse':
      return createEllipseTool(store)
    case 'shape-pen':
      return createPenTool(store)
    case 'node-pen':
      return createPenTool(store, { mode: 'node' })
    case 'shape-select':
      return createSelectTool(store)
    case 'node-select':
      return createNodeTool(store)
  }
}

// Builds the ToolEvent for one moment: the doc point under the canvas-local position, under the current viewport.
function toolEvent(store: EditorStore, local: Pt, mods: Modifiers, space: boolean): ToolEvent {
  const state = store.getState()
  const { viewport } = state.ui
  const suspendSnap = mods.metaKey || mods.ctrlKey
  return {
    pt: screenToDoc(viewport, local),
    zoom: viewport.zoom,
    shift: mods.shiftKey,
    alt: mods.altKey,
    space,
    suspendSnap,
    snap: buildSnapFn(state, viewport.zoom, suspendSnap),
  }
}

// Pointer and key input for the drawing tools. Pointer events come from the canvas element (see the handlers
// returned here); keyboard events are window-level, as in use-viewport-input. Tool state changes are shown
// by bumping a version counter, which re-renders the canvas with fresh primitives.
export function useToolInput(): ToolInput {
  const store = useEditorStore()
  const [tool, setTool] = useState<Tool | null>(null)
  const toolRef = useRef<Tool | null>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const hoverRef = useRef<{ local: Pt; mods: Modifiers } | null>(null)
  // Space is tracked for the whole session, so a tool change cannot miss the release.
  const spaceRef = useRef(false)
  const [, bump] = useReducer((n: number) => n + 1, 0)

  useLayoutEffect(() => {
    let previous = store.getState()
    let context = toolContext(previous.ui)
    let radius = previous.ui.rectRadius
    let switching = false

    const install = () => {
      previous = store.getState()
      context = toolContext(previous.ui)
      radius = previous.ui.rectRadius
      const next = createTool(store, context, radius)
      toolRef.current = next
      setTool(next)
    }
    const retire = () => {
      const old = toolRef.current
      toolRef.current = null
      hoverRef.current = null
      releaseGesture(gestureRef)
      old?.pointerCancel()
      old?.deactivate?.()
    }

    install()
    let historyTool: Tool | null = null
    const unbindHistory = store.bindHistoryInput({
      before(direction) {
        const current = toolRef.current
        if (!current?.beforeHistory) return false
        historyTool = current
        releaseGesture(gestureRef)
        return current.beforeHistory(direction)
      },
      after(applied, direction) {
        const current = historyTool
        historyTool = null
        if (!current || current !== toolRef.current) return
        current.afterHistory?.(applied, direction)
        if (current !== toolRef.current) return
        const hover = hoverRef.current
        if (hover) current.hover?.(toolEvent(store, hover.local, hover.mods, spaceRef.current))
        bump()
      },
    })
    // A store transition is synchronous. Retire the old context before exposing the new tool to
    // any event handler, including Pen -> Pen. Finishing may dispatch and notify us recursively.
    const unsubscribe = store.subscribe(() => {
      if (switching) return
      const next = store.getState()
      if (
        toolContext(next.ui) !== context ||
        (context === 'rect' && next.ui.rectRadius !== radius)
      ) {
        switching = true
        try {
          retire()
          install()
        } finally {
          switching = false
        }
        return
      }
      const refresh =
        next.doc !== previous.doc ||
        next.selection !== previous.selection ||
        next.ui.viewport !== previous.ui.viewport ||
        next.ui.snapEnabled !== previous.ui.snapEnabled ||
        next.ui.snapIncrement !== previous.ui.snapIncrement
      const previousDoc = previous.doc
      previous = next
      if (!refresh) return
      const current = toolRef.current
      if (gestureRef.current) {
        if (current?.beforeHistory && next.doc !== previousDoc) {
          current.refreshHover?.() // validate a held Pen target against external geometry edits
          bump()
        }
        return
      }
      const hover = hoverRef.current
      if (hover) current?.hover?.(toolEvent(store, hover.local, hover.mods, spaceRef.current))
      else current?.refreshHover?.()
      bump()
    })
    return () => {
      unbindHistory()
      unsubscribe()
      retire()
    }
  }, [store])

  // Space state. Listeners are registered before the tool's keyboard listeners, so spaceRef is already
  // current when a Space event re-sends the pointer position below.
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    window.addEventListener(
      'keydown',
      (e) => {
        if (isSpace(e) && !(e.metaKey || e.ctrlKey) && !isEditable(e.target))
          spaceRef.current = true
      },
      { signal },
    )
    window.addEventListener(
      'keyup',
      (e) => {
        if (isSpace(e)) spaceRef.current = false
      },
      { signal },
    )
    // A Space keyup missed while the window is unfocused must not leave Space stuck on.
    window.addEventListener('blur', () => (spaceRef.current = false), { signal })
    return () => controller.abort()
  }, [])

  const handlers = useMemo<ToolInput['handlers']>(() => {
    // Canvas-local position of a pointer event, in CSS px.
    const localOf = (e: ReactMouseEvent<HTMLDivElement>): Pt => {
      const r = e.currentTarget.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    return {
      onDoubleClick(e) {
        const { ui, tx } = store.getState()
        if (
          e.button !== 0 ||
          gestureRef.current ||
          tx ||
          !isNodeSelect(ui) ||
          e.currentTarget.dataset.pan
        )
          return
        const tool = toolRef.current
        if (!tool?.doubleClick || !ui.canvasSize.width || !ui.canvasSize.height) return
        tool.doubleClick(toolEvent(store, localOf(e), e, spaceRef.current))
        bump()
      },
      onPointerDown(e) {
        const tool = toolRef.current
        if (!tool || e.button !== 0 || gestureRef.current) return
        // Viewport pan (middle button or Space drag) owns the pointer. Its listener runs before this one.
        if (e.currentTarget.dataset.pan) return
        // Before the first measurement the view is not fitted, so drawing there would place shapes wrongly.
        const { canvasSize } = store.getState().ui
        if (canvasSize.width === 0 || canvasSize.height === 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const local = localOf(e)
        hoverRef.current = null
        gestureRef.current = { id: e.pointerId, local, el: e.currentTarget }
        e.currentTarget.dataset.drawing = 'true'
        tool.pointerDown(toolEvent(store, local, e, spaceRef.current))
        bump()
      },
      onPointerMove(e) {
        const tool = toolRef.current
        const g = gestureRef.current
        // Plain moves (no press) reach only tools with a hover method: the select highlight and the pen rubber band.
        if (tool && !g && e.buttons === 0 && tool.hover) {
          const local = localOf(e)
          const { altKey, ctrlKey, metaKey, shiftKey } = e
          hoverRef.current = { local, mods: { altKey, ctrlKey, metaKey, shiftKey } }
          tool.hover(toolEvent(store, local, e, spaceRef.current))
          bump()
          return
        }
        if (!tool || !g || e.pointerId !== g.id) return
        g.local = localOf(e)
        tool.pointerMove(toolEvent(store, g.local, e, spaceRef.current))
        bump()
      },
      onPointerLeave() {
        hoverRef.current = null
        if (gestureRef.current) return
        const { ui } = store.getState()
        if (isNodeSelect(ui)) toolRef.current?.deactivate?.() // clear hover, not the static selection
        else if (ui.activeTool === 'pen') toolRef.current?.pointerCancel()
        else return
        bump()
      },
      onPointerUp(e) {
        const tool = toolRef.current
        const g = gestureRef.current
        // Only the left button commits. Releasing another button while the left one is held does not.
        if (!tool || !g || e.pointerId !== g.id || e.button !== 0) return
        releaseGesture(gestureRef)
        tool.pointerUp(toolEvent(store, localOf(e), e, spaceRef.current))
        bump()
      },
      onPointerCancel(e) {
        const tool = toolRef.current
        const g = gestureRef.current
        if (!tool || !g || e.pointerId !== g.id) return
        releaseGesture(gestureRef)
        tool.pointerCancel()
        bump()
      },
      // The browser can release capture slightly before the pointerup that ends the press, at the same position.
      // That is the release, so commit here at this position; the later pointerup finds no gesture and does nothing.
      // A real cancel (or lost Pen capture with the left button still down) drops the press.
      // After a normal pointerup the gesture is already cleared, so this does nothing.
      onLostPointerCapture(e) {
        const tool = toolRef.current
        const g = gestureRef.current
        if (!tool || !g || e.pointerId !== g.id) return
        releaseGesture(gestureRef)
        if (tool.beforeHistory && e.buttons & 1) tool.pointerCancel()
        else tool.pointerUp(toolEvent(store, localOf(e), e, spaceRef.current))
        bump()
      },
    }
  }, [store])

  // Window-level keys. Escape cancels the draft (the Pen tool finishes its path instead), and Enter is forwarded
  // for the Pen tool to finish. Modifier changes during a press re-send the last position so the preview picks up
  // the new shift, alt, and snap state without the pointer moving.
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    window.addEventListener(
      'keydown',
      (e) => {
        const tool = toolRef.current
        if (!tool) return
        const { ui } = store.getState()
        if (
          e.key.toLowerCase() === 'm' &&
          gestureRef.current &&
          !e.repeat &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey &&
          !e.shiftKey &&
          !spaceRef.current &&
          !gestureRef.current.el.dataset.pan &&
          !isEditable(e.target) &&
          tool.cycleHandleMode?.()
        ) {
          e.preventDefault()
          bump()
          return
        }
        if (e.key === 'Escape' || e.key === 'Enter') {
          if (isEditable(e.target)) return
          // Select Enter belongs exclusively to the app shortcut table. In Pen, suppress
          // native activation of a focused toolbar button so finishing cannot also switch context.
          if (e.key === 'Enter' && ui.activeTool !== 'pen') return
          if (ui.activeTool === 'pen') e.preventDefault()
          if (e.repeat) return
          const pressed = gestureRef.current !== null
          releaseGesture(gestureRef)
          hoverRef.current = null
          tool.keyDown(e.key)
          if (e.key === 'Escape' && !pressed && isNodeSelect(ui)) store.setUi({ mode: 'shape' })
          bump()
          return
        }
        const g = gestureRef.current
        if (!g || !shouldResend(e)) return
        if (isSpace(e)) e.preventDefault() // no page scroll, and the viewport hook skips Space while Option is held
        tool.pointerMove(toolEvent(store, g.local, e, spaceRef.current))
        bump()
      },
      { signal },
    )
    window.addEventListener(
      'keyup',
      (e) => {
        const tool = toolRef.current
        if (!tool) return
        const g = gestureRef.current
        if (!g || !shouldResend(e)) return
        tool.pointerMove(toolEvent(store, g.local, e, spaceRef.current))
        bump()
      },
      { signal },
    )

    return () => controller.abort()
  }, [store])

  return {
    handlers,
    cursor: tool?.cursor,
    primitives: tool ? tool.overlay() : [],
  }
}
