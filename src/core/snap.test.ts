import { describe, expect, it } from 'vitest'
import { snapPoint, snapToleranceDoc, type SnapContext } from './snap'

const base: SnapContext = {
  enabled: true,
  increment: 0.5,
  tolerance: snapToleranceDoc(16),
  anchors: [],
  excludeAnchorIds: new Set(),
  bounds: [],
  guides: [],
}

describe('snapPoint (AC7 engine)', () => {
  it('snaps (3.3, 7.8) to the 0.5 grid at (3.5, 8) when no other target is in range', () => {
    const { point, targets } = snapPoint({ x: 3.3, y: 7.8 }, base)
    expect(point).toEqual({ x: 3.5, y: 8 })
    expect(targets).toEqual({ x: { kind: 'grid' }, y: { kind: 'grid' } })
  })
})

describe('snapPoint (AC9 engine)', () => {
  // Off-grid anchor at (3.0, 7.6): 0.36 doc units from the pointer, off the 0.5 grid.
  const anchors = [{ id: 'a', p: { x: 3.0, y: 7.6 } }]
  const pt = { x: 3.3, y: 7.8 }

  it('an off-grid anchor within tolerance beats the grid; 6 screen px is 6x smaller in doc units at 6x zoom', () => {
    // 400%: 6 px = 1.5 doc units, so the anchor (0.36 away) wins over the grid point (3.5, 8).
    const at400 = snapPoint(pt, { ...base, anchors, tolerance: snapToleranceDoc(4) })
    expect(at400.point).toEqual({ x: 3.0, y: 7.6 })
    expect(at400.targets).toEqual({
      x: { kind: 'anchor', p: { x: 3.0, y: 7.6 } },
      y: { kind: 'anchor', p: { x: 3.0, y: 7.6 } },
    })

    // 2400%: 6 px = 0.25 doc units, so the same anchor is out of range and the grid applies.
    expect(snapToleranceDoc(4) / snapToleranceDoc(24)).toBeCloseTo(6)
    const at2400 = snapPoint(pt, { ...base, anchors, tolerance: snapToleranceDoc(24) })
    expect(at2400.point).toEqual({ x: 3.5, y: 8 })
    expect(at2400.targets).toEqual({ x: { kind: 'grid' }, y: { kind: 'grid' } })
  })
})

describe('snapPoint per-axis (Step 2.2 review)', () => {
  // Tolerance at 16x zoom is 0.375 doc units. The pointer is (3.3, 7.8).
  // A rect's edges and center are its snap lines: x = 3.2, 5.2 (center), 7.2; y = 7.9, 9.9, 11.9.
  it('each axis snaps on its own: both axes when both lines are in range, and only x when only an x-line is in range', () => {
    const pt = { x: 3.3, y: 7.8 }

    // An x-line at 3.2 (0.1 away) and a y-line at 7.9 (0.1 away): both axes snap to a line.
    const both = snapPoint(pt, { ...base, bounds: [{ x: 3.2, y: 7.9, w: 4, h: 4 }] })
    expect(both.point).toEqual({ x: 3.2, y: 7.9 })
    expect(both.targets).toEqual({
      x: { kind: 'line', source: 'edge', axis: 'x', value: 3.2 },
      y: { kind: 'line', source: 'edge', axis: 'y', value: 7.9 },
    })

    // Only an x-line at 3.2 is in range (the rect's y-lines are at 20, 21 and 22): x snaps to the line, y to the grid.
    const onlyX = snapPoint(pt, { ...base, bounds: [{ x: 3.2, y: 20, w: 2, h: 2 }] })
    expect(onlyX.point).toEqual({ x: 3.2, y: 8 })
    expect(onlyX.targets).toEqual({
      x: { kind: 'line', source: 'edge', axis: 'x', value: 3.2 },
      y: { kind: 'grid' },
    })
  })
})

describe('snapPoint disabled', () => {
  it('returns the point unchanged, even with an anchor in range', () => {
    const pt = { x: 3.3, y: 7.8 }
    const result = snapPoint(pt, {
      ...base,
      enabled: false,
      anchors: [{ id: 'a', p: { x: 3.0, y: 7.6 } }],
      tolerance: 10,
    })
    expect(result).toEqual({ point: { x: 3.3, y: 7.8 }, targets: { x: null, y: null } })
    expect(result.point).toBe(pt)
  })
})
