import { makeRect } from '../geometry/shapes'
import { createDragTool, squareFrom } from './dragTool'
import type { Tool, ToolHost } from './types'

export type RectToolOptions = {
  host: ToolHost
  radius: () => number // corner radius setting, read when a shape is built; makeRect clamps it to min(w, h) / 2
}

// Drag from one corner to the opposite one, or with Alt from the center. Shift makes it a square.
export function createRectTool({ host, radius }: RectToolOptions): Tool {
  return createDragTool({
    host,
    label: 'Draw rectangle',
    constrain: (anchor, p, e) => (e.shift ? squareFrom(anchor, p) : p),
    shape: (anchor, end, e) => {
      const dx = end.x - anchor.x
      const dy = end.y - anchor.y
      if (e.alt) return makeRect(anchor.x - dx, anchor.y - dy, dx * 2, dy * 2, radius())
      return makeRect(anchor.x, anchor.y, dx, dy, radius())
    },
  })
}
