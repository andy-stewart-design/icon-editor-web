import { makeEllipse } from '../geometry/shapes'
import { createDragTool, squareFrom } from './dragTool'
import type { Tool, ToolHost } from './types'

// Drag from a corner of the bounding box, or with Alt from the center. Shift makes it a circle.
export function createEllipseTool(host: ToolHost): Tool {
  return createDragTool({
    host,
    label: 'Draw ellipse',
    constrain: (anchor, p, e) => (e.shift ? squareFrom(anchor, p) : p),
    shape: (anchor, end, e) => {
      const dx = end.x - anchor.x
      const dy = end.y - anchor.y
      if (e.alt) return makeEllipse(anchor.x, anchor.y, dx, dy)
      return makeEllipse(anchor.x + dx / 2, anchor.y + dy / 2, dx / 2, dy / 2)
    },
  })
}
