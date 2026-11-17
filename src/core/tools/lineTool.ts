import { constrainAngle45, makeLine } from '../geometry/shapes'
import { createDragTool } from './dragTool'
import type { Tool, ToolHost } from './types'

// Drag from start to end. Shift constrains the angle to multiples of 45°.
export function createLineTool(host: ToolHost): Tool {
  return createDragTool({
    host,
    label: 'Draw line',
    constrain: (anchor, p, e) => (e.shift ? constrainAngle45(anchor, p) : p),
    shape: (anchor, end) => makeLine(anchor, end),
  })
}
