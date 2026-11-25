import { drawContour } from '../commands/nodes'
import { newId } from '../ids'
import type { PathNode, PathShape, Pt, Subpath } from '../model'
import { toolContext, type EditorStore } from '../store'
import type { SnapResult } from '../snap'
import { addShapeCommand, snapIndicator } from './dragTool'
import { extendPenContour, resolvePenEndpoint } from './penTarget'
import { DRAG_THRESHOLD_PX, HIT_TOLERANCE_PX } from './selectTool'
import type { OverlayPrimitive, PenContext, Tool, ToolEvent, ToolHost } from './types'

type Endpoint = NonNullable<ReturnType<typeof resolvePenEndpoint>>
type Destination = { shape: PathShape; endpoint: Endpoint | null }
type Targets = SnapResult['targets']

// A pending first press carries its destination until release. Resuming and closing an existing
// contour do not place or modify an anchor; other drags pull the outgoing handle after the dead zone.
type Press = {
  start?: Destination
  node: PathNode
  closing: boolean
  origin: Pt
  dragged: boolean
  handle: Pt | null
}

// The node with its outgoing handle at `handle` and the incoming handle mirrored through the anchor. Null leaves it as is.
function withHandle(node: PathNode, handle: Pt | null): PathNode {
  if (!handle) return node
  const { p } = node
  return {
    ...node,
    mode: 'symmetric',
    hOut: handle,
    hIn: { x: 2 * p.x - handle.x, y: 2 * p.y - handle.y },
  }
}

// Single-subpath path with an empty style, so it inherits the document defaults. Ids come from newId().
function committedPath(nodes: PathNode[], closed: boolean): PathShape {
  return { id: newId(), type: 'path', style: {}, subpaths: [{ id: newId(), nodes, closed }] }
}

// Preview of the path in progress. Ids are placeholders: the preview is never stored.
function previewPath(nodes: PathNode[]): PathShape {
  return { id: 'draft', type: 'path', style: {}, subpaths: [{ id: 'draft', nodes, closed: false }] }
}

// Shape Pen creates; Node Pen appends or extends against a fixed destination. Both share the
// snapped click/drag gestures; only releases write geometry.
export function createPenTool(
  host: ToolHost & Pick<EditorStore, 'getState' | 'setUi'>,
  context: PenContext = { mode: 'shape' },
): Tool {
  let destination: Destination | undefined
  let lastHover: ToolEvent | null = null
  let provisional: PathNode | undefined
  let fresh = false
  let transitioning = false
  let press: Press | null = null
  let rubber: Pt | null = null // snapped pointer while no press is active; the rubber band ends here
  let hoverNearClose = false // no press: the pointer is in the close hit zone
  let targets: Targets | null = null // snap targets hit by the press or the hover

  const selectedShape = (): PathShape | undefined => {
    if (context.mode !== 'node') return
    const { doc, selection } = host.getState()
    if (selection.shapeIds.length === 1)
      return doc.shapes.find((s) => s.id === selection.shapeIds[0])
  }

  const closeAnchor = (): PathNode | undefined => {
    const endpoint = destination?.endpoint
    if (!endpoint || endpoint.subpath.nodes.length < 2) return
    const old = endpoint.subpath.nodes
    return old[endpoint.end === 'head' ? old.length - 1 : 0]
  }

  const nearClose = (pt: Pt, zoom: number): boolean => {
    const anchor = closeAnchor()
    return !!anchor && Math.hypot(pt.x - anchor.p.x, pt.y - anchor.p.y) <= HIT_TOLERANCE_PX / zoom
  }

  const resetHover = (): void => {
    lastHover = null
    rubber = null
    hoverNearClose = false
    targets = null
  }

  const finish = (): void => {
    provisional = undefined
    destination = undefined
    fresh = false
    press = null
    resetHover()
  }

  const currentShape = (id: string) => host.getState().doc.shapes.find((s) => s.id === id)
  const validate = () => {
    if (transitioning) return true
    const pinned = destination ?? press?.start
    if (!pinned || currentShape(pinned.shape.id)?.subpaths === pinned.shape.subpaths) return true
    finish()
    return false
  }

  const attach = (shapeId: string, contourId: string, end: Endpoint['end'], expected?: Subpath) => {
    const shape = currentShape(shapeId)
    const subpath = shape?.subpaths.find((sp) => sp.id === contourId)
    if (
      !shape ||
      !subpath ||
      subpath.closed ||
      !subpath.nodes.length ||
      (expected && subpath !== expected)
    ) {
      finish()
      return
    }
    const node = subpath.nodes[end === 'head' ? 0 : subpath.nodes.length - 1]
    destination = { shape, endpoint: { subpath, end, node } }
  }

  const commit = (contour: Subpath, e: ToolEvent, newShape?: PathShape) => {
    const pinned = destination
    const shapeId = newShape?.id ?? pinned?.shape.id
    const { doc, tx } = host.getState()
    const command = newShape
      ? addShapeCommand('Draw path', newShape)
      : pinned && drawContour(doc, pinned.shape, contour, pinned.endpoint?.subpath)
    if (!shapeId || !command || tx) {
      finish()
      return
    }
    transitioning = true
    try {
      host.dispatch(command)
    } finally {
      transitioning = false
    }
    // A subscriber may have retired this tool while the command was notifying listeners.
    if (destination !== pinned || (!pinned && !provisional)) return
    provisional = undefined
    attach(shapeId, contour.id, pinned?.endpoint?.end ?? 'tail', contour)
    if (!contour.closed && destination) track(e)
  }

  const track = (e: ToolEvent): void => {
    lastHover = e
    const s = e.snap(e.pt)
    rubber = s.point
    targets = s.targets
    hoverNearClose = nearClose(e.pt, e.zoom)
  }

  const move = (e: ToolEvent): void => {
    const p = press
    if (!p || p.start?.endpoint || (p.closing && !fresh)) return
    if (
      !p.dragged &&
      Math.hypot(e.pt.x - p.origin.x, e.pt.y - p.origin.y) * e.zoom >= DRAG_THRESHOLD_PX
    )
      p.dragged = true
    if (!p.dragged) return
    const s = e.snap(e.pt)
    p.handle = s.point
    targets = s.targets
  }

  return {
    cursor: 'crosshair',

    pointerDown(e) {
      if (press) return
      validate()
      resetHover()
      let start: Destination | undefined
      if (context.mode === 'node' && !destination) {
        const shape = selectedShape()
        if (!shape) return
        start = { shape, endpoint: resolvePenEndpoint(shape, e.pt, e.zoom) }
        if (start.endpoint) {
          press = {
            start,
            node: start.endpoint.node,
            closing: false,
            origin: e.pt,
            dragged: false,
            handle: null,
          }
          return
        }
      }
      const anchor = closeAnchor()
      if (anchor && nearClose(e.pt, e.zoom)) {
        press = { node: anchor, closing: true, origin: e.pt, dragged: false, handle: null }
        return
      }
      const s = e.snap(e.pt)
      press = {
        start,
        node: { id: newId(), p: s.point, mode: 'corner' },
        closing: false,
        origin: e.pt,
        dragged: false,
        handle: null,
      }
      targets = s.targets
    },

    pointerMove(e) {
      move(e)
    },

    pointerUp(e) {
      const p = press
      if (!p || !validate()) return
      move(e)
      press = null
      if (p.start) destination = p.start
      if (p.start?.endpoint) {
        track(e)
        return
      }
      const endpoint = destination?.endpoint
      if (p.closing && endpoint) {
        let contour = extendPenContour(endpoint.subpath, endpoint.end, [], true)
        if (fresh && p.handle)
          contour = {
            ...contour,
            nodes: [withHandle(contour.nodes[0], p.handle), ...contour.nodes.slice(1)],
          }
        commit(contour, e)
        return
      }
      // A duplicate of the active anchor would add a zero-length segment.
      const last = endpoint?.node ?? provisional
      if (last && Math.hypot(last.p.x - p.node.p.x, last.p.y - p.node.p.y) < 1e-9) {
        track(e)
        return
      }
      const node = withHandle(p.node, p.handle)
      if (endpoint) commit(extendPenContour(endpoint.subpath, endpoint.end, [node], false), e)
      else if (provisional) {
        const path = committedPath([provisional, node], false)
        commit(path.subpaths[0], e, context.mode === 'shape' ? path : undefined)
      } else {
        provisional = node
        fresh = true
        track(e)
      }
    },

    pointerCancel() {
      // Drops the press only. Placed nodes stay, so the path can still be finished.
      press = null
      resetHover()
    },

    keyDown(key) {
      if (key === 'Enter' || key === 'Escape') finish()
    },

    // Called by the host on plain moves, when no press is active.
    hover(e) {
      if (press || transitioning) return
      validate()
      track(e)
    },

    refreshHover() {
      if (transitioning) return
      validate()
      if (!press && lastHover) track(lastHover)
    },

    // Changing tools ends the live session without writing geometry.
    deactivate() {
      finish()
    },

    beforeHistory(direction) {
      validate()
      press = null
      resetHover()
      if (direction === 'undo' && provisional) {
        finish()
        return true
      }
      transitioning = true
      return false
    },

    afterHistory(applied, direction) {
      transitioning = false
      if (!applied) return
      const pinned = destination
      if (pinned?.endpoint) attach(pinned.shape.id, pinned.endpoint.subpath.id, pinned.endpoint.end)
      else finish()
      // Reconcile the pinned contour first: an attachment can still draw without a selection.
      if (direction === 'undo' && context.mode === 'node' && !destination?.endpoint) {
        const { ui, selection } = host.getState()
        if (toolContext(ui) === 'node-pen' && selection.shapeIds.length === 0) {
          host.setUi({ mode: 'shape' })
        }
      }
    },

    overlay() {
      const out: OverlayPrimitive[] = []
      const waitingForTarget = context.mode === 'node' && !destination && !press
      const idleShape = waitingForTarget ? selectedShape() : undefined
      if (waitingForTarget && !idleShape) return out
      const resume =
        idleShape && lastHover && resolvePenEndpoint(idleShape, lastHover.pt, lastHover.zoom)
      if (idleShape) {
        for (const subpath of idleShape.subpaths) {
          if (subpath.closed || !subpath.nodes.length) continue
          const head = subpath.nodes[0]
          out.push({ kind: 'penEndpoint', p: head.p })
          if (subpath.nodes.length > 1)
            out.push({ kind: 'penEndpoint', p: subpath.nodes[subpath.nodes.length - 1].p })
        }
        if (resume) out.push({ kind: 'penResume', p: resume.node.p })
      }
      const endpoint = destination?.endpoint ?? press?.start?.endpoint
      const closing = press?.closing === true
      const close = closeAnchor()
      const pending =
        press && !closing && !press.start?.endpoint ? withHandle(press.node, press.handle) : null
      const first = closing && fresh && close ? withHandle(close, press?.handle ?? null) : null
      // Preview in drawing order, with just the new segments and their attachment anchors.
      const inDrawingOrder = (n: PathNode): PathNode =>
        endpoint?.end === 'head' ? { ...n, hIn: n.hOut, hOut: n.hIn } : n
      const placed = endpoint ? [inDrawingOrder(endpoint.node)] : provisional ? [provisional] : []
      const trailing =
        (closing || hoverNearClose) && close
          ? inDrawingOrder(first ?? close)
          : !press && rubber && placed.length > 0
            ? ({ id: 'rubber', p: rubber, mode: 'corner' } as const)
            : null
      const from = placed[0]
      const to = pending ?? trailing
      if (from && to && Math.hypot(from.p.x - to.p.x, from.p.y - to.p.y) >= 1e-9)
        out.push({ kind: 'draft', shape: previewPath([from, to]) })

      for (const n of [...placed, ...(pending ? [pending] : [])])
        out.push({ kind: 'anchor', p: n.p })

      const handleNodes = [
        placed[placed.length - 1],
        pending && press?.dragged ? pending : null,
        first,
      ]
      for (const n of handleNodes) {
        if (!n) continue
        if (n.hIn) out.push({ kind: 'handle', from: n.p, to: n.hIn })
        if (n.hOut) out.push({ kind: 'handle', from: n.p, to: n.hOut })
      }

      if (close && (closing || (!press && hoverNearClose)))
        out.push({ kind: 'closeTarget', p: close.p })
      if (targets && !resume) out.push(...snapIndicator(targets))
      return out
    },
  }
}
