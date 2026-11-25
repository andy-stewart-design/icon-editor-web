import { drawContour } from '../commands/nodes'
import { newId } from '../ids'
import type { PathNode, PathShape, Pt, Subpath } from '../model'
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
function previewPath(nodes: PathNode[], closed: boolean): PathShape {
  return { id: 'draft', type: 'path', style: {}, subpaths: [{ id: 'draft', nodes, closed }] }
}

// Shape Pen creates; Node Pen appends or extends against a fixed destination. Both share the
// snapped click/drag gestures and finish with one edit. Finish drops any unfinished press.
export function createPenTool(host: ToolHost, context: PenContext = { mode: 'shape' }): Tool {
  let destination: Destination | undefined
  let lastHover: ToolEvent | null = null
  let nodes: PathNode[] = []
  let press: Press | null = null
  let rubber: Pt | null = null // snapped pointer while no press is active; the rubber band ends here
  let hoverNearClose = false // no press: the pointer is in the close hit zone
  let targets: Targets | null = null // snap targets hit by the press or the hover

  const selectedShape = (): PathShape | undefined => {
    if (context.mode !== 'node') return
    const { doc, selection } = context.getState()
    if (selection.shapeIds.length === 1)
      return doc.shapes.find((s) => s.id === selection.shapeIds[0])
  }

  const closeAnchor = (): PathNode | undefined => {
    const endpoint = destination?.endpoint
    if (!endpoint) return nodes.length >= 2 ? nodes[0] : undefined
    const old = endpoint.subpath.nodes
    if (old.length + nodes.length >= 2) return old[endpoint.end === 'head' ? old.length - 1 : 0]
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

  const finish = (closed: boolean): void => {
    const placed = nodes
    const pinned = destination
    nodes = []
    destination = undefined
    press = null
    resetHover()
    if (context.mode === 'shape') {
      if (placed.length >= 2)
        host.dispatch(addShapeCommand('Draw path', committedPath(placed, closed)))
      return
    }
    if (!pinned) return
    const endpoint = pinned.endpoint
    const contour: Subpath | undefined = endpoint
      ? extendPenContour(endpoint.subpath, endpoint.end, placed, closed)
      : placed.length >= 2
        ? { id: newId(), nodes: placed, closed }
        : undefined
    if (!contour || contour === endpoint?.subpath) return
    const command = drawContour(context.getState().doc, pinned.shape, contour, endpoint?.subpath)
    if (command) host.dispatch(command)
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
    if (!p || p.start?.endpoint || (p.closing && destination?.endpoint)) return
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
      if (!p) return
      move(e)
      press = null
      if (p.start) destination = p.start
      if (p.start?.endpoint) {
        track(e)
        return
      }
      if (p.closing) {
        if (!destination?.endpoint) nodes[0] = withHandle(nodes[0], p.handle)
        finish(true)
        return
      }
      // A click on the spot of the last node would add a zero-length segment, so it is ignored.
      const last = nodes[nodes.length - 1] ?? destination?.endpoint?.node
      if (last && Math.hypot(last.p.x - p.node.p.x, last.p.y - p.node.p.y) < 1e-9) return
      nodes.push(withHandle(p.node, p.handle))
      track(e) // the rubber band now starts from the node just placed
    },

    pointerCancel() {
      // Drops the press only. Placed nodes stay, so the path can still be finished.
      press = null
      resetHover()
    },

    keyDown(key) {
      if (key === 'Enter' || key === 'Escape') finish(false)
    },

    // Called by the host on plain moves, when no press is active.
    hover(e) {
      if (press) return
      track(e)
    },

    refreshHover() {
      if (!press && lastHover) track(lastHover)
    },

    // The tool is being replaced by another tool, so the path in progress is finished the same way as Enter.
    deactivate() {
      finish(false)
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
      const first = closing && !endpoint ? withHandle(nodes[0], press?.handle ?? null) : null
      // Preview in drawing order, with just the new segments and their attachment anchors.
      const inDrawingOrder = (n: PathNode): PathNode =>
        endpoint?.end === 'head' ? { ...n, hIn: n.hOut, hOut: n.hIn } : n
      const placed = endpoint
        ? [inDrawingOrder(endpoint.node), ...nodes]
        : first
          ? [first, ...nodes.slice(1)]
          : nodes
      const trailing =
        (closing || hoverNearClose) && endpoint && close
          ? inDrawingOrder(close)
          : !press && rubber && placed.length > 0
            ? ({ id: 'rubber', p: rubber, mode: 'corner' } as const)
            : null
      const preview = [...placed, ...(pending ? [pending] : []), ...(trailing ? [trailing] : [])]
      if (preview.length >= 2)
        out.push({ kind: 'draft', shape: previewPath(preview, !endpoint && closing) })

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
