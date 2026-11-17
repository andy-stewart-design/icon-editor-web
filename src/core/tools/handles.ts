import type { HandleId } from '../commands/transform'
import type { Rect } from '../geometry/bounds'
import type { Pt } from '../model'

export const HANDLE_SIZE_PX = 8 // drawn size of a resize handle
export const HANDLE_HIT_PX = 7 // reach of a handle, in screen px
export const ROTATE_OFFSET_PX = 22 // rotate handle distance above the top edge

export type HandleHit = HandleId | 'rotate'

const HANDLE_IDS: readonly HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

// Position of a resize handle on the bounds, in doc units.
export function handlePoint(b: Rect, id: HandleId): Pt {
  const x = id.includes('w') ? b.x : id.includes('e') ? b.x + b.w : b.x + b.w / 2
  const y = id.includes('n') ? b.y : id.includes('s') ? b.y + b.h : b.y + b.h / 2
  return { x, y }
}

export function handlePoints(b: Rect): { id: HandleId; p: Pt }[] {
  return HANDLE_IDS.map((id) => ({ id, p: handlePoint(b, id) }))
}

// The rotate handle sits above the top-center, a fixed screen distance away.
export function rotateHandlePoint(b: Rect, zoom: number): Pt {
  return { x: b.x + b.w / 2, y: b.y - ROTATE_OFFSET_PX / zoom }
}

// The handle under pt, if any. Rotate wins ties, then corners over edges (corner ids come first in the check).
export function hitHandle(b: Rect, pt: Pt, zoom: number): HandleHit | null {
  const reach = HANDLE_HIT_PX / zoom
  const near = (p: Pt) => Math.abs(pt.x - p.x) <= reach && Math.abs(pt.y - p.y) <= reach
  if (near(rotateHandlePoint(b, zoom))) return 'rotate'
  const order: HandleId[] = ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w']
  for (const id of order) if (near(handlePoint(b, id))) return id
  return null
}
