import { describe, expect, it } from 'vitest'
import type { PathShape, Pt } from '../model'
import { sampleSegment, segmentsOf } from './segments'
import { constrainAngle45, makeEllipse, makeRect } from './shapes'

const subpath = (s: PathShape) => s.subpaths[0]
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

describe('makeRect (AC14, AC15)', () => {
  it('radius 2 on 10x6 gives 8 nodes: 4 straight edges and 4 radius-2 quarter arcs', () => {
    const shape = makeRect(0, 0, 10, 6, 2)
    if (!shape) throw new Error('expected a shape')
    const { nodes, closed } = subpath(shape)
    expect(closed).toBe(true)
    expect(nodes).toHaveLength(8)

    const segs = segmentsOf(subpath(shape))
    expect(segs.filter((s) => s.straight)).toHaveLength(4)
    const centres: Pt[] = [
      { x: 2, y: 2 },
      { x: 8, y: 2 },
      { x: 8, y: 4 },
      { x: 2, y: 4 },
    ]
    for (const seg of segs.filter((s) => !s.straight)) {
      const c = centres.find(
        (k) => Math.abs(dist(seg.from.p, k) - 2) < 1e-9 && Math.abs(dist(seg.to.p, k) - 2) < 1e-9,
      )
      if (!c) throw new Error('arc has no matching centre')
      for (const p of sampleSegment(seg, 64)) {
        expect(Math.abs(dist(p, c) - 2)).toBeLessThan(0.002)
      }
    }
  })

  it('radius 5 on 10x6 clamps to 3 and leaves no zero-length segments', () => {
    const shape = makeRect(0, 0, 10, 6, 5)
    if (!shape) throw new Error('expected a shape')
    const { nodes } = subpath(shape)
    expect(nodes.map((n) => [n.p.x, n.p.y])).toEqual([
      [3, 0],
      [7, 0],
      [10, 3],
      [7, 6],
      [3, 6],
      [0, 3],
    ])
    for (const seg of segmentsOf(subpath(shape))) {
      expect(dist(seg.from.p, seg.to.p)).toBeGreaterThan(0)
    }
  })
})

describe('makeEllipse (AC17)', () => {
  it('r = 8 circle has 4 smooth nodes and radial error under 0.1% at 64 samples per segment', () => {
    const shape = makeEllipse(12, 12, 8, 8)
    if (!shape) throw new Error('expected a shape')
    const { nodes } = subpath(shape)
    expect(nodes).toHaveLength(4)
    expect(nodes.every((n) => n.mode === 'smooth')).toBe(true)

    const centre = { x: 12, y: 12 }
    for (const seg of segmentsOf(subpath(shape))) {
      for (const p of sampleSegment(seg, 64)) {
        expect(Math.abs(dist(p, centre) - 8) / 8).toBeLessThan(0.001)
      }
    }
  })
})

describe('generated ids', () => {
  it('gives the shape, its subpath and every node a distinct non-empty id', () => {
    const shape = makeRect(0, 0, 10, 6, 2)
    if (!shape) throw new Error('expected a shape')
    const ids = [shape.id, shape.subpaths[0].id, ...shape.subpaths[0].nodes.map((n) => n.id)]
    expect(ids.every((id) => id.length > 0)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('constrainAngle45 (AC13 math)', () => {
  it('snaps a 40° drag to exactly 45° and keeps its length', () => {
    const anchor = { x: 0, y: 0 }
    const p = { x: 10 * Math.cos(Math.PI * (40 / 180)), y: 10 * Math.sin(Math.PI * (40 / 180)) }
    const out = constrainAngle45(anchor, p)
    expect(out.x).toBeCloseTo(10 * Math.SQRT1_2, 12)
    expect(out.y).toBeCloseTo(10 * Math.SQRT1_2, 12)
  })
})
