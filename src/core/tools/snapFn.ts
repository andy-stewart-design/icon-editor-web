import { shapeBounds, type Rect } from '../geometry/bounds'
import { guidesFor } from '../guides'
import { snapPoint, snapToleranceDoc, type SnapContext } from '../snap'
import type { EditorState } from '../store'
import type { SnapFn } from './types'

// The snap function for one pointer event. Anchors and bounds come from the doc, and guides only when keylines are shown.
// suspendSnap (held Cmd/Ctrl) turns snapping off for this event, and so does the snapEnabled toggle.
export function buildSnapFn(state: Pick<EditorState, 'doc' | 'ui'>, zoom: number, suspendSnap: boolean): SnapFn {
  const { doc, ui } = state
  const ctx: SnapContext = {
    enabled: ui.snapEnabled && !suspendSnap,
    increment: ui.snapIncrement,
    tolerance: snapToleranceDoc(zoom),
    anchors: doc.shapes.flatMap((s) => s.subpaths.flatMap((sp) => sp.nodes.map((n) => ({ id: n.id, p: n.p })))),
    excludeAnchorIds: new Set(),
    bounds: doc.shapes.map((s) => shapeBounds(s)).filter((r): r is Rect => r !== null),
    guides: ui.showKeylines ? guidesFor(doc.size) : [],
  }
  return (pt) => snapPoint(pt, ctx)
}
