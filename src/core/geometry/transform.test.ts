import { describe, expect, it } from 'vitest'
import type { IconDoc, PathShape, Pt } from '../model'
import { makeEllipse, makeLine, makeRect } from './shapes'
import { flipH, flipV, rotateAbout, scaleAbout, scaleDoc } from './transform'

// Every anchor and handle, in node order, for coordinate comparisons.
const allPoints = (s: PathShape): Pt[] =>
  s.subpaths.flatMap((sp) =>
    sp.nodes.flatMap((n) => [n.p, ...(n.hIn ? [n.hIn] : []), ...(n.hOut ? [n.hOut] : [])]),
  )

const maxDiff = (a: Pt[], b: Pt[]): number => {
  expect(a).toHaveLength(b.length)
  return Math.max(0, ...a.map((p, i) => Math.max(Math.abs(p.x - b[i].x), Math.abs(p.y - b[i].y))))
}

const sample = (): PathShape => {
  const rect = makeRect(2, 3, 10, 6, 2)
  if (!rect) throw new Error('expected a rect')
  return rect
}

describe('scaling (AC24)', () => {
  it('200% about the origin doubles coordinates and keeps the stroke-width override', () => {
    const shape = { ...sample(), style: { strokeWidth: 2 } }
    const out = scaleAbout(shape, 2, 2, { x: 0, y: 0 })
    expect(out.style).toEqual({ strokeWidth: 2 })
    const before = allPoints(shape)
    expect(maxDiff(allPoints(out), before.map((p) => ({ x: p.x * 2, y: p.y * 2 })))).toBeLessThan(1e-9)
  })
})

describe('flips (AC25)', () => {
  it('flipping H twice and V twice is the identity within 1e-9', () => {
    const shape = makeEllipse(12, 12, 8, 5)
    if (!shape) throw new Error('expected a shape')
    const out = flipV(flipV(flipH(flipH(shape, 7.3), 7.3), 11.1), 11.1)
    expect(maxDiff(allPoints(out), allPoints(shape))).toBeLessThan(1e-9)
  })
})

describe('rotation', () => {
  it('rotating by an angle and back returns the original geometry within 1e-9', () => {
    const shape = sample()
    const origin = { x: 7, y: 6 }
    const theta = (15 * Math.PI) / 180 * 3
    const out = rotateAbout(rotateAbout(shape, theta, origin), -theta, origin)
    expect(maxDiff(allPoints(out), allPoints(shape))).toBeLessThan(1e-9)
  })
})

describe('scaleDoc (artboard resize)', () => {
  it('scales coordinates by new/old size and leaves stroke widths alone', () => {
    const line = makeLine({ x: 2, y: 2 }, { x: 22, y: 22 })
    if (!line) throw new Error('expected a line')
    const doc: IconDoc = {
      id: 'd',
      version: 1,
      size: 24,
      strokeWidth: 1.5,
      linecap: 'round',
      linejoin: 'round',
      shapes: [{ ...line, style: { strokeWidth: 3 } }],
    }
    const out = scaleDoc(doc, 32)
    expect(out.size).toBe(32)
    expect(out.strokeWidth).toBe(1.5)
    expect(out.shapes[0].style).toEqual({ strokeWidth: 3 })
    const [a, b] = out.shapes[0].subpaths[0].nodes
    expect(a.p.x).toBeCloseTo(2 * 32 / 24, 12)
    expect(b.p.x).toBeCloseTo(22 * 32 / 24, 12)
  })
})
