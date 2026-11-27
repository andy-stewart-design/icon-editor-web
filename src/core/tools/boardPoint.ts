import type { IconDoc, Pt } from '../model'

export const boardPoint = (world: Pt, origin: Pt): Pt => ({
  x: world.x - origin.x,
  y: world.y - origin.y,
})

export function boardAt(doc: IconDoc, world: Pt) {
  return doc.boards.findLast(({ origin, size }) => {
    const { x, y } = boardPoint(world, origin)
    return x >= 0 && y >= 0 && x <= size && y <= size
  })
}
