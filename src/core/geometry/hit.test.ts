import { describe, expect, it } from 'vitest'
import { distanceToShape, segmentIntersectsRect, shapeIntersectsRect } from './hit'
import { makeEllipse, makeLine } from './shapes'

describe('hit distance and marquee intersection', () => {
  it('measures distance to lines and curves, and tests marquee intersection', () => {
    const line = makeLine({ x: 0, y: 0 }, { x: 10, y: 0 })
    if (!line) throw new Error('expected a line')
    expect(distanceToShape(line, { x: 5, y: 3 })).toBeCloseTo(3, 12)
    expect(distanceToShape(line, { x: 13, y: 4 })).toBeCloseTo(5, 12)

    // Point 12 units from the centre at 45°: the nearest curve point is 4 units out.
    const circle = makeEllipse(12, 12, 8, 8)
    if (!circle) throw new Error('expected a circle')
    const d = Math.SQRT1_2 * 12
    expect(distanceToShape(circle, { x: 12 + d, y: 12 + d })).toBeCloseTo(4, 2)

    const box = { x: 0, y: 0, w: 10, h: 10 }
    expect(segmentIntersectsRect({ x: -5, y: 5 }, { x: 15, y: 5 }, box)).toBe(true)
    expect(segmentIntersectsRect({ x: 11, y: 11 }, { x: 20, y: 20 }, box)).toBe(false)
    // The circle's left extreme is (4, 12). A marquee that reaches it hits; one that stops short doesn't.
    expect(shapeIntersectsRect(circle, { x: 3, y: 11, w: 2, h: 2 })).toBe(true)
    expect(shapeIntersectsRect(circle, { x: 0, y: 11, w: 3.5, h: 2 })).toBe(false)
  })
})
