import { newId } from '../ids'
import type { PathNode, PathShape, Pt } from '../model'
import type { SnapResult } from '../snap'
import { addShapeCommand, snapIndicator } from './dragTool'
import { DRAG_THRESHOLD_PX, HIT_TOLERANCE_PX } from './selectTool'
import type { OverlayPrimitive, Tool, ToolEvent, ToolHost } from './types'

type Targets = SnapResult['targets']

// A press in progress. A press that is not on the first node places `node`, a new corner node at the snapped press point.
// A press on the first node (closing) leaves the node list alone until release. `handle` is the snapped pointer once the
// press has left the dead zone, and it pulls the node's outgoing handle.
type Press = { node: PathNode; closing: boolean; origin: Pt; dragged: boolean; handle: Pt | null }

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

// Pen tool. Click places a corner node; press-drag places a symmetric node whose outgoing handle follows the pointer.
// A press on the first node closes the path once it has two or more nodes. Enter and Esc finish an open path. Switching
// tools finishes it too (see deactivate). Placed nodes live in this tool's state. The document changes only when a path
// is finished, and that is one history entry that also selects the new shape. Snapping applies to anchors and handles.
// Esc during a press drops the press (its node is not placed) and finishes the path with the nodes placed so far.
export function createPenTool(host: ToolHost): Tool {
  let nodes: PathNode[] = []
  let press: Press | null = null
  let rubber: Pt | null = null // snapped pointer while no press is active; the rubber band ends here
  let hoverNearFirst = false // no press: the pointer is in the close hit zone of the first node
  let targets: Targets | null = null // snap targets hit by the press or the hover

  // Within the hit tolerance of the first node, and only once there are two nodes to close.
  const nearFirst = (pt: Pt, zoom: number): boolean =>
    nodes.length >= 2 && Math.hypot(pt.x - nodes[0].p.x, pt.y - nodes[0].p.y) <= HIT_TOLERANCE_PX / zoom

  const resetHover = (): void => {
    rubber = null
    hoverNearFirst = false
    targets = null
  }

  // Commits the nodes as one path and returns to the empty state. Fewer than two nodes are discarded silently.
  const finish = (closed: boolean): void => {
    if (nodes.length >= 2) host.dispatch(addShapeCommand('Draw path', committedPath(nodes, closed)))
    nodes = []
    press = null
    resetHover()
  }

  const track = (e: ToolEvent): void => {
    const s = e.snap(e.pt)
    rubber = s.point
    targets = s.targets
    hoverNearFirst = nearFirst(e.pt, e.zoom)
  }

  const move = (e: ToolEvent): void => {
    const p = press
    if (!p) return
    if (!p.dragged && Math.hypot(e.pt.x - p.origin.x, e.pt.y - p.origin.y) * e.zoom >= DRAG_THRESHOLD_PX)
      p.dragged = true
    if (!p.dragged) return
    const s = e.snap(e.pt)
    p.handle = s.point
    targets = s.targets
  }

  return {
    cursor: 'crosshair',

    pointerDown(e) {
      resetHover()
      if (nearFirst(e.pt, e.zoom)) {
        press = { node: nodes[0], closing: true, origin: e.pt, dragged: false, handle: null }
        return
      }
      const s = e.snap(e.pt)
      press = {
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
      if (p.closing) {
        nodes[0] = withHandle(nodes[0], p.handle)
        finish(true)
        return
      }
      // A click on the spot of the last node would add a zero-length segment, so it is ignored.
      const last = nodes[nodes.length - 1]
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

    // The tool is being replaced by another tool, so the path in progress is finished the same way as Enter.
    deactivate() {
      finish(false)
    },

    overlay() {
      const out: OverlayPrimitive[] = []
      const closing = press?.closing === true
      const pending: PathNode | null = press && !closing ? withHandle(press.node, press.handle) : null
      // While closing, the first node previews the handle being dragged.
      const first = closing && nodes.length > 0 ? withHandle(nodes[0], press?.handle ?? null) : null
      const placed = first ? [first, ...nodes.slice(1)] : nodes
      const rubberNode: PathNode | null =
        !press && rubber && nodes.length > 0 ? { id: 'rubber', p: rubber, mode: 'corner' } : null

      const preview = [...placed, ...(pending ? [pending] : []), ...(rubberNode ? [rubberNode] : [])]
      if (preview.length >= 2) out.push({ kind: 'draft', shape: previewPath(preview, closing) })

      for (const n of [...placed, ...(pending ? [pending] : [])]) out.push({ kind: 'anchor', p: n.p })

      // Handles of the last node, and of the node being dragged.
      const handleNodes = [
        placed[placed.length - 1],
        pending && press?.dragged ? pending : null,
        closing && press?.dragged ? first : null,
      ]
      for (const n of handleNodes) {
        if (!n) continue
        if (n.hIn) out.push({ kind: 'handle', from: n.p, to: n.hIn })
        if (n.hOut) out.push({ kind: 'handle', from: n.p, to: n.hOut })
      }

      if (closing || (!press && hoverNearFirst)) out.push({ kind: 'closeTarget', p: nodes[0].p })
      if (targets) out.push(...snapIndicator(targets))
      return out
    },
  }
}
