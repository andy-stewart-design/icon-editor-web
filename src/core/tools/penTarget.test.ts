import { describe, expect, it } from 'vitest'
import { segmentsOf } from '../geometry/segments'
import type { PathNode, PathShape, Subpath } from '../model'
import { extendPenContour, resolvePenEndpoint } from './penTarget'
import { HIT_TOLERANCE_PX } from './selectTool'

const pt = (x: number, y = 0) => ({ x, y })
const node = (id: string, x: number): PathNode => ({ id, p: pt(x), mode: 'corner' })
const contour = (id: string, nodes: PathNode[], closed = false): Subpath => ({ id, nodes, closed })
const shape = (...subpaths: Subpath[]): PathShape => ({
  id: 'shape',
  type: 'path',
  subpaths,
  style: {},
})

describe('resolvePenEndpoint', () => {
  it('ignores closed and empty contours, interior anchors, handles, and segment bodies', () => {
    const head = { ...node('a', 0), hOut: pt(9, 20) }
    const open = contour('open', [head, node('b', 20), node('c', 40)])
    const target = shape(
      open,
      contour('closed', [node('d', 70), node('e', 90)], true),
      contour('empty', []),
    )
    for (const point of [pt(20), pt(30), head.hOut, pt(70), pt(90)]) {
      expect(resolvePenEndpoint(target, point, 1)).toBeNull()
    }
    expect(resolvePenEndpoint(target, pt(40), 1)).toEqual({
      subpath: open,
      end: 'tail',
      node: open.nodes[2],
    })
  })

  it('chooses the nearest endpoint, keeping subpath order and preferring head on exact ties', () => {
    const first = contour('z', [node('head', 0), node('tail', 0)])
    const second = contour('a', [node('single', 2)])
    const target = shape(first, second)
    expect(resolvePenEndpoint(target, pt(0), 1)).toEqual({
      subpath: first,
      end: 'head',
      node: first.nodes[0],
    })
    expect(resolvePenEndpoint(target, pt(1), 1)?.subpath).toBe(first)
    expect(resolvePenEndpoint(target, pt(2), 1)).toEqual({
      subpath: second,
      end: 'head',
      node: second.nodes[0],
    })
  })

  it('uses inclusive screen-space tolerance on the raw pointer', () => {
    const target = shape(contour('single', [node('a', 0)]))
    expect(resolvePenEndpoint(target, pt(HIT_TOLERANCE_PX / 2), 2)).not.toBeNull()
    const outside = pt(HIT_TOLERANCE_PX / 2 + 0.01)
    expect(resolvePenEndpoint(target, outside, 2)).toBeNull()
    expect(resolvePenEndpoint(target, outside, 1)).not.toBeNull()
  })
})

describe('extendPenContour', () => {
  const a = Object.freeze({ ...node('a', 0), hIn: pt(-2, 1), hOut: pt(2, 3) })
  const b = Object.freeze({ ...node('b', 10), hIn: pt(8, 4), hOut: pt(12, 1) })
  const original = contour('original', [a, b])
  Object.freeze(original.nodes)
  Object.freeze(original)
  const c = Object.freeze({ ...node('c', 20), hIn: pt(18, 1), hOut: pt(22, 3) })
  const d = Object.freeze({ ...node('d', 30), hIn: pt(28, 2) })
  const placed = Object.freeze([c, d])
  const [old] = segmentsOf(original)
  const controls = (sp: Subpath) =>
    segmentsOf(sp).map(({ from, to, c1, c2 }) => [from.id, to.id, c1, c2])

  it.each(['head', 'tail'] as const)(
    'extends and closes at the %s without touching the original segment',
    (end) => {
      const head = end === 'head'
      const extended = extendPenContour(original, end, placed, false)
      const closed = extendPenContour(original, end, placed, true)
      const oldIndex = head ? 2 : 0
      expect(extended).toMatchObject({ id: original.id, closed: false })
      expect(closed.closed).toBe(true)
      expect(closed.nodes).toEqual(extended.nodes)
      for (const result of [extended, closed]) {
        expect(result.nodes[oldIndex]).toBe(a)
        expect(result.nodes[oldIndex + 1]).toBe(b)
        expect(segmentsOf(result)[oldIndex]).toEqual({ ...old, index: oldIndex })
      }
      expect(controls(extended)).toEqual(
        head
          ? [
              ['d', 'c', d.hIn, c.hOut],
              ['c', 'a', c.hIn, a.hIn],
              ['a', 'b', a.hOut, b.hIn],
            ]
          : [
              ['a', 'b', a.hOut, b.hIn],
              ['b', 'c', b.hOut, c.hIn],
              ['c', 'd', c.hOut, d.hIn],
            ],
      )
      expect(controls(closed)).toEqual([
        ...controls(extended),
        head ? ['b', 'd', b.hOut, d.p] : ['d', 'a', d.p, a.hIn],
      ])
    },
  )

  it('preserves no-ops, allows direct closure, and requires two nodes to close a singleton', () => {
    expect(extendPenContour(original, 'tail', [], false)).toBe(original)
    const direct = extendPenContour(original, 'head', [], true)
    expect(direct.nodes).toBe(original.nodes)
    expect(segmentsOf(direct)[0]).toEqual(old)
    expect(controls(direct)[1]).toEqual(['b', 'a', b.hOut, a.hIn])
    const single = contour('single', [a])
    expect(extendPenContour(single, 'head', [], true)).toBe(single)
    expect(extendPenContour(single, 'head', [c], true)).toMatchObject({
      closed: true,
      nodes: [{ id: 'c' }, a],
    })
  })
})
