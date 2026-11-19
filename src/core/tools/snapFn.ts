import { shapeBounds, type Rect } from '../geometry/bounds'
import { guidesFor } from '../guides'
import { snapPoint, snapToleranceDoc, type SnapContext } from '../snap'
import type { EditorState } from '../store'
import type { SnapFn } from './types'

// The snap function for one pointer event. Anchors and bounds come from the doc, and guides only when keylines are shown.
// suspendSnap (held Cmd/Ctrl) turns snapping off for this event, and so does the snapEnabled toggle.
// `exclude` lists shape ids that are not targets, such as the shapes being moved, which would otherwise snap to themselves.
// `excludeNodeIds` lists single anchors that are not point targets (the nodes being dragged in the Node tool). Their
// shapes still count for the other anchors.
// `excludeBoundsIds` lists shapes whose bounds are not targets. While a node of a shape is dragged, the shape's own
// bounds move with it, so snapping to them would pin the pointer to itself and defeat the grid on that axis.
export function buildSnapFn(
  state: Pick<EditorState, 'doc' | 'ui'>,
  zoom: number,
  suspendSnap: boolean,
  exclude: ReadonlySet<string> = new Set(),
  excludeNodeIds: ReadonlySet<string> = new Set(),
  excludeBoundsIds: ReadonlySet<string> = new Set(),
): SnapFn {
  const { ui } = state
  const shapes = state.doc.shapes.filter((s) => !exclude.has(s.id))
  const ctx: SnapContext = {
    enabled: ui.snapEnabled && !suspendSnap,
    increment: ui.snapIncrement,
    tolerance: snapToleranceDoc(zoom),
    anchors: shapes.flatMap((s) => s.subpaths.flatMap((sp) => sp.nodes.map((n) => ({ id: n.id, p: n.p })))),
    excludeAnchorIds: excludeNodeIds,
    bounds: shapes
      .filter((s) => !excludeBoundsIds.has(s.id))
      .map((s) => shapeBounds(s))
      .filter((r): r is Rect => r !== null),
    guides: ui.showKeylines ? guidesFor(state.doc.size) : [],
  }
  return (pt) => snapPoint(pt, ctx)
}
