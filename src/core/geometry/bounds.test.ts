import { describe, expect, it } from 'vitest'
import type { PathShape } from '../model'
import { shapeBounds } from './bounds'

describe('shapeBounds', () => {
  it('finds the exact interior extremum of a cubic (y peaks at 7.5 at t = 0.5), not just the anchors', () => {
    const shape: PathShape = {
      id: 's',
      type: 'path',
      style: {},
      subpaths: [
        {
          id: 'sp',
          closed: false,
          nodes: [
            { id: 'a', p: { x: 0, y: 0 }, hOut: { x: 0, y: 10 }, mode: 'corner' },
            { id: 'b', p: { x: 10, y: 0 }, hIn: { x: 10, y: 10 }, mode: 'corner' },
          ],
        },
      ],
    }
    const box = shapeBounds(shape)
    expect(box?.x).toBeCloseTo(0, 9)
    expect(box?.y).toBeCloseTo(0, 9)
    expect(box?.w).toBeCloseTo(10, 9)
    expect(box?.h).toBeCloseTo(7.5, 9)
  })
})
