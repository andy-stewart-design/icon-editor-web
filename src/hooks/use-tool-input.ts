import { useEffect, useMemo, useReducer, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import {
  buildSnapFn,
  createEllipseTool,
  createLineTool,
  createRectTool,
  createSelectTool,
  type SelectTool,
  screenToDoc,
  type ActiveTool,
  type EditorStore,
  type OverlayPrimitive,
  type Pt,
  type Tool,
  type ToolEvent,
} from '../core'
import { isEditable } from './editable'
import { useEditor, useEditorStore } from './use-editor'

// Modifier flags shared by pointer and keyboard events.
type Modifiers = Pick<MouseEvent, 'shiftKey' | 'altKey' | 'metaKey' | 'ctrlKey'>

// The active pointer press that a tool is following. `local` is the last position in canvas px, so the
// document point can be recomputed against the current viewport when a modifier key changes mid-drag.
// `el` is the canvas element, which is marked with data-drawing while the press lasts.
type Gesture = { id: number; local: Pt; el: HTMLDivElement }

export type ToolInput = {
  handlers: {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void
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

// Ends a gesture: forgets the press and clears the canvas marker that tells the viewport a draw is in progress.
function clearGesture(g: Gesture | null): void {
  if (g) delete g.el.dataset.drawing
}

// Tools for the activeTool values that have one. Other values have no tool, so pointer input does nothing.
// The rect radius is captured here; the tool is recreated when it changes.
function createTool(store: EditorStore, activeTool: ActiveTool, rectRadius: number): Tool | null {
  switch (activeTool) {
    case 'line':
      return createLineTool(store)
    case 'rect':
      return createRectTool({ host: store, radius: () => rectRadius })
    case 'ellipse':
      return createEllipseTool(store)
    case 'select':
      return createSelectTool(store)
    default:
      return null
  }
}

const isSelectTool = (tool: Tool): tool is SelectTool => 'hover' in tool

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
  const activeTool = useEditor((s) => s.ui.activeTool)
  // Only the rect tool reads the radius, so other tools are not recreated when it changes.
  const rectRadius = useEditor((s) => (s.ui.activeTool === 'rect' ? s.ui.rectRadius : 0))
  const tool = useMemo(() => createTool(store, activeTool, rectRadius), [store, activeTool, rectRadius])

  const gestureRef = useRef<Gesture | null>(null)
  // Space is held. Tracked for the whole session, not per tool, so a tool change cannot miss the release.
  const spaceRef = useRef(false)
  const [, bump] = useReducer((n: number) => n + 1, 0)

  // Changing the tool drops any draft in progress and forgets the press it was following.
  useEffect(
    () => () => {
      clearGesture(gestureRef.current)
      gestureRef.current = null
      tool?.pointerCancel()
    },
    [tool],
  )

  // Space state. Listeners are registered before the tool's keyboard listeners, so spaceRef is already
  // current when a Space event re-sends the pointer position below.
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    window.addEventListener(
      'keydown',
      (e) => {
        if (isSpace(e) && !(e.metaKey || e.ctrlKey) && !isEditable(e.target)) spaceRef.current = true
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
    const localOf = (e: ReactPointerEvent<HTMLDivElement>): Pt => {
      const r = e.currentTarget.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    return {
      onPointerDown(e) {
        if (!tool || e.button !== 0 || gestureRef.current) return
        // Viewport pan (middle button or Space drag) owns the pointer. Its listener runs before this one.
        if (e.currentTarget.dataset.pan) return
        // Before the first measurement the view is not fitted, so drawing there would place shapes wrongly.
        const { canvasSize } = store.getState().ui
        if (canvasSize.width === 0 || canvasSize.height === 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const local = localOf(e)
        gestureRef.current = { id: e.pointerId, local, el: e.currentTarget }
        e.currentTarget.dataset.drawing = 'true'
        tool.pointerDown(toolEvent(store, local, e, spaceRef.current))
        bump()
      },
      onPointerMove(e) {
        const g = gestureRef.current
        // Plain moves reach only the select tool, so its hover highlight follows the pointer.
        if (tool && !g && isSelectTool(tool)) {
          tool.hover(toolEvent(store, localOf(e), e, spaceRef.current))
          bump()
          return
        }
        if (!tool || !g || e.pointerId !== g.id) return
        g.local = localOf(e)
        tool.pointerMove(toolEvent(store, g.local, e, spaceRef.current))
        bump()
      },
      onPointerUp(e) {
        const g = gestureRef.current
        // Only the left button commits. Releasing another button while the left one is held does not.
        if (!tool || !g || e.pointerId !== g.id || e.button !== 0) return
        gestureRef.current = null
        clearGesture(g)
        if (e.currentTarget.hasPointerCapture(g.id)) e.currentTarget.releasePointerCapture(g.id)
        tool.pointerUp(toolEvent(store, localOf(e), e, spaceRef.current))
        bump()
      },
      onPointerCancel(e) {
        const g = gestureRef.current
        if (!tool || !g || e.pointerId !== g.id) return
        gestureRef.current = null
        clearGesture(g)
        tool.pointerCancel()
        bump()
      },
      // The browser can release capture slightly before the pointerup that ends the press, at the same position.
      // That is the release, so commit here at this position; the later pointerup finds no gesture and does nothing.
      // A real cancel still goes through onPointerCancel and discards the draft.
      // After a normal pointerup the gesture is already cleared, so this does nothing.
      onLostPointerCapture(e) {
        const g = gestureRef.current
        if (!tool || !g || e.pointerId !== g.id) return
        gestureRef.current = null
        clearGesture(g)
        tool.pointerUp(toolEvent(store, localOf(e), e, spaceRef.current))
        bump()
      },
    }
  }, [store, tool])

  // Window-level keys. Escape cancels the draft. Modifier changes during a press re-send the last position
  // so the preview picks up the new shift, alt, and snap state without the pointer moving.
  useEffect(() => {
    if (!tool) return
    const controller = new AbortController()
    const { signal } = controller

    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') {
          clearGesture(gestureRef.current)
          gestureRef.current = null
          tool.keyDown('Escape')
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
        const g = gestureRef.current
        if (!g || !shouldResend(e)) return
        tool.pointerMove(toolEvent(store, g.local, e, spaceRef.current))
        bump()
      },
      { signal },
    )

    return () => controller.abort()
  }, [store, tool])

  return {
    handlers,
    cursor: tool?.cursor,
    primitives: tool ? tool.overlay() : [],
  }
}
