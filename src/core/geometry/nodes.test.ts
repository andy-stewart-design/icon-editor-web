import { describe, expect, it } from 'vitest'
import type { PathNode, PathShape, Pt, Subpath } from '../model'
import { sampleSegment, segmentsOf, toBezier } from './segments'
import {
  breakAtNodes,
  cutSegmentAt,
  deleteNodes,
  enforceNodeModes,
  insertNodeAt,
  moveAnchor,
  moveHandle,
  nearestSegment,
  projectToSegment,
  applyNodeMode,
  retractHandles,
  setNodeMode,
} from './nodes'
import { scaleAbout } from './transform'

const node = (id: string, p: Pt, extra: Partial<PathNode> = {}): PathNode => ({ id, p, mode: 'corner', ...extra })
const shapeOf = (subpaths: Subpath[]): PathShape => ({ id: 's', type: 'path', subpaths, style: {} })
const near = (a: Pt, b: Pt, eps = 1e-9) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(eps)
  expect(Math.abs(a.y - b.y)).toBeLessThan(eps)
}
const angleOf = (v: Pt) => Math.atan2(v.y, v.x)
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const len = (v: Pt) => Math.hypot(v.x, v.y)

// Distance from a point to the nearest point of a polyline built from samples of the curves.
function distToPolyline(pt: Pt, poly: Pt[]): number {
  let best = Infinity
  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i]
    const b = poly[i + 1]
    const d = sub(b, a)
    const l2 = d.x * d.x + d.y * d.y
    const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((pt.x - a.x) * d.x + (pt.y - a.y) * d.y) / l2))
    best = Math.min(best, len(sub(pt, { x: a.x + d.x * t, y: a.y + d.y * t })))
  }
  return best
}

const cubicSub = (): Subpath => ({
  id: 'sp',
  closed: false,
  nodes: [
    node('a', { x: 0, y: 0 }, { hOut: { x: 0, y: 10 } }),
    node('b', { x: 20, y: 0 }, { hIn: { x: 20, y: 10 } }),
  ],
})

describe('projectToSegment', () => {
  it('projects onto a straight segment and clamps to the ends', () => {
    const a = node('a', { x: 0, y: 0 })
    const b = node('b', { x: 10, y: 0 })
    const hit = projectToSegment(a, b, { x: 4, y: 3 })
    expect(hit.t).toBeCloseTo(0.4, 9)
    near(hit.point, { x: 4, y: 0 })
    expect(hit.distance).toBeCloseTo(3, 9)
    expect(projectToSegment(a, b, { x: -5, y: 0 }).t).toBe(0)
  })
})

describe('insertNodeAt', () => {
  it('AC20: split at t = 0.5 keeps 64 samples of the original curve within 0.01', () => {
    const sp = cubicSub()
    const orig = segmentsOf(sp)[0]
    const curveSamples = sampleSegment(orig, 64)

    const out = insertNodeAt(sp, 0, 0.5)
    expect(out.nodes).toHaveLength(3)
    const [s1, s2] = segmentsOf(out)
    const poly = [...sampleSegment(s1, 64), ...sampleSegment(s2, 64)]
    for (const p of curveSamples) expect(distToPolyline(p, poly)).toBeLessThan(0.01)
    // The split point is on the original curve.
    near(out.nodes[1].p, toBezier(orig).compute(0.5), 1e-9)
  })

  it('inserts smooth on a curve and corner on a straight segment', () => {
    const curve = insertNodeAt(cubicSub(), 0, 0.5)
    expect(curve.nodes[1].mode).toBe('smooth')
    const m = curve.nodes[1]
    // Collinear: the handles lie on opposite sides of the anchor.
    const cross = (m.hIn!.x - m.p.x) * (m.hOut!.y - m.p.y) - (m.hIn!.y - m.p.y) * (m.hOut!.x - m.p.x)
    expect(Math.abs(cross)).toBeLessThan(1e-9)

    const line: Subpath = {
      id: 'l',
      closed: false,
      nodes: [node('a', { x: 0, y: 0 }), node('b', { x: 10, y: 0 })],
    }
    const straight = insertNodeAt(line, 0, 0.25)
    expect(straight.nodes).toHaveLength(3)
    expect(straight.nodes[1].mode).toBe('corner')
    near(straight.nodes[1].p, { x: 2.5, y: 0 })
    expect(straight.nodes[1].hIn).toBeUndefined()
    expect(straight.nodes[1].hOut).toBeUndefined()
  })

  it('inserts on the closing segment of a closed subpath by appending', () => {
    const tri: Subpath = {
      id: 'c',
      closed: true,
      nodes: [node('a', { x: 0, y: 0 }), node('b', { x: 10, y: 0 }), node('c', { x: 0, y: 10 })],
    }
    const out = insertNodeAt(tri, 2, 0.5)
    expect(out.closed).toBe(true)
    expect(out.nodes).toHaveLength(4)
    expect(out.nodes[3].mode).toBe('corner')
    near(out.nodes[3].p, { x: 0, y: 5 })
    expect(out.nodes[0].id).toBe('a')
    // Closing segment is now c -> new -> a; the shape is unchanged.
    const segs = segmentsOf(out)
    expect(segs).toHaveLength(4)
    expect(segs[3].to.id).toBe('a')
  })

  it('preserves the curve on a closing cubic segment', () => {
    const sp: Subpath = {
      id: 'c',
      closed: true,
      nodes: [
        node('a', { x: 0, y: 0 }, { hOut: { x: 5, y: 10 } }),
        node('b', { x: 20, y: 0 }),
        node('c', { x: 10, y: 20 }, { hOut: { x: 0, y: 20 }, hIn: { x: 15, y: 25 } }),
      ],
    }
    const orig = segmentsOf(sp)[2]
    const out = insertNodeAt(sp, 2, 0.3)
    const segs = segmentsOf(out)
    const poly = [...sampleSegment(segs[2], 64), ...sampleSegment(segs[3], 64)]
    for (const p of sampleSegment(orig, 64)) expect(distToPolyline(p, poly)).toBeLessThan(0.01)
  })

  it('returns the input for an invalid segment index or t', () => {
    const sp = cubicSub()
    expect(insertNodeAt(sp, 5, 0.5)).toBe(sp)
    expect(insertNodeAt(sp, 0, 0)).toBe(sp)
  })
})

describe('nearestSegment', () => {
  it('finds the nearest segment including the closing one', () => {
    const shape = shapeOf([
      {
        id: 'c',
        closed: true,
        nodes: [node('a', { x: 0, y: 0 }), node('b', { x: 10, y: 0 }), node('c', { x: 0, y: 10 })],
      },
    ])
    const hit = nearestSegment(shape, { x: -1, y: 5 })
    expect(hit).not.toBeNull()
    expect(hit!.segIndex).toBe(2)
    expect(hit!.distance).toBeCloseTo(1, 9)
    expect(nearestSegment(shapeOf([]), { x: 0, y: 0 })).toBeNull()
  })
})

describe('moveHandle', () => {
  const base = node('n', { x: 10, y: 10 }, { hIn: { x: 6, y: 10 }, hOut: { x: 14, y: 10 } })

  it('corner moves only the dragged handle', () => {
    const out = moveHandle({ ...base, mode: 'corner' }, 'out', { x: 10, y: 20 })
    near(out.hOut!, { x: 10, y: 20 })
    near(out.hIn!, { x: 6, y: 10 })
  })

  it('AC21: symmetric mirrors length and direction', () => {
    const out = moveHandle({ ...base, mode: 'symmetric' }, 'out', { x: 10, y: 13 })
    near(out.hOut!, { x: 10, y: 13 })
    near(out.hIn!, { x: 10, y: 7 })
    expect(len(sub(out.hIn!, out.p))).toBeCloseTo(len(sub(out.hOut!, out.p)), 12)
  })

  it('AC21: smooth mirrors direction only and keeps the opposite length', () => {
    const n: PathNode = { ...base, hIn: { x: 4, y: 10 }, mode: 'smooth' } // hIn length 6
    const out = moveHandle(n, 'out', { x: 10, y: 13 }) // hOut length 3, pointing down
    near(out.hOut!, { x: 10, y: 13 })
    // Opposite direction, still length 6.
    expect(angleOf(sub(out.hIn!, out.p))).toBeCloseTo(angleOf({ x: 0, y: -1 }), 12)
    expect(len(sub(out.hIn!, out.p))).toBeCloseTo(6, 12)
  })

  it('smooth leaves an absent opposite handle absent', () => {
    const n: PathNode = { id: 'n', p: { x: 0, y: 0 }, mode: 'smooth', hOut: { x: 1, y: 0 } }
    const out = moveHandle(n, 'out', { x: 0, y: 2 })
    expect(out.hIn).toBeUndefined()
  })
})

describe('applyNodeMode', () => {
  it('smooth aligns both handles to the averaged direction and keeps lengths', () => {
    // Out points east (length 2), in points north-west-ish: hIn = p + (0,-4)... i.e. outward b = (0,4) direction north.
    const n: PathNode = { id: 'n', p: { x: 0, y: 0 }, mode: 'corner', hOut: { x: 2, y: 0 }, hIn: { x: 0, y: -4 } }
    const out = applyNodeMode(n, 'smooth')
    expect(out.mode).toBe('smooth')
    // Averaged outward direction: normalize((1,0) + (0,1)) = (1,1)/sqrt2.
    const s = Math.SQRT1_2
    near(out.hOut!, { x: 2 * s, y: 2 * s }, 1e-9)
    near(out.hIn!, { x: -4 * s, y: -4 * s }, 1e-9)
  })

  it('symmetric also equalises lengths to the average', () => {
    const n: PathNode = { id: 'n', p: { x: 0, y: 0 }, mode: 'corner', hOut: { x: 2, y: 0 }, hIn: { x: -6, y: 0 } }
    const out = applyNodeMode(n, 'symmetric')
    near(out.hOut!, { x: 4, y: 0 })
    near(out.hIn!, { x: -4, y: 0 })
  })

  it('corner only changes the mode', () => {
    const n: PathNode = { id: 'n', p: { x: 0, y: 0 }, mode: 'smooth', hOut: { x: 2, y: 0 }, hIn: { x: 0, y: -4 } }
    expect(applyNodeMode(n, 'corner')).toEqual({ ...n, mode: 'corner' })
  })

  it('with one handle, symmetric mirrors it and smooth leaves the other absent', () => {
    const n: PathNode = { id: 'n', p: { x: 1, y: 1 }, mode: 'corner', hOut: { x: 3, y: 1 } }
    const sym = applyNodeMode(n, 'symmetric')
    near(sym.hIn!, { x: -1, y: 1 })
    const sm = applyNodeMode(n, 'smooth')
    expect(sm.hIn).toBeUndefined()
    near(sm.hOut!, { x: 3, y: 1 })
  })
})

describe('moveAnchor', () => {
  it('translates handles with the anchor; absent handles stay absent', () => {
    const n: PathNode = { id: 'n', p: { x: 0, y: 0 }, mode: 'smooth', hOut: { x: 1, y: 2 } }
    const out = moveAnchor(n, { x: 5, y: -1 })
    near(out.p, { x: 5, y: -1 })
    near(out.hOut!, { x: 6, y: 1 })
    expect(out.hIn).toBeUndefined()
    expect(n.p).toEqual({ x: 0, y: 0 }) // input not mutated
  })
})

describe('deleteNodes', () => {
  const open3 = (): PathShape =>
    shapeOf([
      {
        id: 'sp',
        closed: false,
        nodes: [
          node('a', { x: 0, y: 0 }, { hOut: { x: 1, y: 1 } }),
          node('b', { x: 5, y: 0 }, { hIn: { x: 4, y: 1 }, hOut: { x: 6, y: -1 } }),
          node('c', { x: 10, y: 0 }, { hIn: { x: 9, y: 1 } }),
        ],
      },
    ])

  it('AC22: deleting down to one node removes the shape', () => {
    const s = open3()
    const one = deleteNodes(s, new Set(['b']))
    expect(one).not.toBeNull()
    expect(one!.subpaths[0].nodes.map((n) => n.id)).toEqual(['a', 'c'])
    expect(deleteNodes(one!, new Set(['a']))).toBeNull()
    expect(deleteNodes(s, new Set(['a', 'b']))).toBeNull()
  })

  it('neighbours keep their outer handles, and the reconnected segment uses them', () => {
    const out = deleteNodes(open3(), new Set(['b']))!
    const [a, c] = out.subpaths[0].nodes
    near(a.p, { x: 0, y: 0 })
    near(a.hOut!, { x: 1, y: 1 })
    near(c.p, { x: 10, y: 0 })
    near(c.hIn!, { x: 9, y: 1 })
    expect(segmentsOf(out.subpaths[0])).toHaveLength(1)
  })

  it('deleting from a closed path keeps it closed', () => {
    const s = shapeOf([
      {
        id: 'c',
        closed: true,
        nodes: [node('a', { x: 0, y: 0 }), node('b', { x: 10, y: 0 }), node('c', { x: 0, y: 10 })],
      },
    ])
    const out = deleteNodes(s, new Set(['b']))!
    expect(out.subpaths[0].closed).toBe(true)
    expect(out.subpaths[0].nodes.map((n) => n.id)).toEqual(['a', 'c'])
  })

  it('does not mutate its input', () => {
    const s = open3()
    const snapshot = JSON.stringify(s)
    deleteNodes(s, new Set(['b']))
    expect(JSON.stringify(s)).toBe(snapshot)
  })
})

describe('breakAtNodes', () => {
  const closed4 = (): PathShape =>
    shapeOf([
      {
        id: 'sp',
        closed: true,
        nodes: [
          node('a', { x: 0, y: 0 }, { hOut: { x: 1, y: 0 } }),
          node('b', { x: 10, y: 0 }, { hIn: { x: 9, y: 0 }, hOut: { x: 11, y: 0 } }),
          node('c', { x: 10, y: 10 }, { hIn: { x: 11, y: 10 }, hOut: { x: 9, y: 10 } }),
          node('d', { x: 0, y: 10 }, { hIn: { x: 1, y: 10 }, hOut: { x: 0, y: 9 } }),
        ],
      },
    ])
  const open5 = (): PathShape =>
    shapeOf([
      {
        id: 'sp',
        closed: false,
        nodes: ['a', 'b', 'c', 'd', 'e'].map((id, i) =>
          node(id, { x: i * 10, y: 0 }, { hIn: { x: i * 10 - 1, y: 1 }, hOut: { x: i * 10 + 1, y: 1 } }),
        ),
      },
    ])
  const ids = (sp: Subpath) => sp.nodes.map((n) => n.id)

  it('closed 4-node subpath, one node removed: one open 3-node subpath in order after the removal', () => {
    const out = breakAtNodes(closed4(), new Set(['a']))!
    expect(out.subpaths).toHaveLength(1)
    expect(out.subpaths[0].closed).toBe(false)
    expect(out.subpaths[0].id).toBe('sp')
    expect(ids(out.subpaths[0])).toEqual(['b', 'c', 'd'])
  })

  it('closed subpath: the new ends drop their outward handle and keep the other one', () => {
    const [first, , last] = breakAtNodes(closed4(), new Set(['a']))!.subpaths[0].nodes
    expect(first.hIn).toBeUndefined()
    expect(first.hOut).toEqual({ x: 11, y: 0 })
    expect(last.hOut).toBeUndefined()
    expect(last.hIn).toEqual({ x: 1, y: 10 })
  })

  it('open 5-node path, interior node removed: two open subpaths of 2 and 2 nodes', () => {
    const out = breakAtNodes(open5(), new Set(['c']))!
    expect(out.subpaths.map(ids)).toEqual([
      ['a', 'b'],
      ['d', 'e'],
    ])
    expect(out.subpaths.every((sp) => !sp.closed)).toBe(true)
    expect(out.subpaths[0].id).toBe('sp')
    expect(out.subpaths[1].id).not.toBe('sp')
    const [a, b] = out.subpaths[0].nodes
    expect(a.hIn).toBeUndefined()
    expect(b.hOut).toBeUndefined()
    expect(b.hIn).toEqual({ x: 9, y: 1 })
    const [d, e] = out.subpaths[1].nodes
    expect(d.hIn).toBeUndefined()
    expect(d.hOut).toEqual({ x: 31, y: 1 })
    expect(e.hOut).toBeUndefined()
  })

  it('removing an open end node just shortens the path', () => {
    const out = breakAtNodes(open5(), new Set(['a']))!
    expect(out.subpaths).toHaveLength(1)
    expect(ids(out.subpaths[0])).toEqual(['b', 'c', 'd', 'e'])
    expect(out.subpaths[0].nodes[0].hIn).toBeUndefined()
  })

  it('only single-node pieces left: the subpath is gone, so the result is null', () => {
    expect(breakAtNodes(open5(), new Set(['b', 'd']))).toBeNull()
  })

  it('a piece under two nodes is dropped while the other survives', () => {
    const out = breakAtNodes(open5(), new Set(['b']))!
    expect(out.subpaths.map(ids)).toEqual([['c', 'd', 'e']])
    expect(out.subpaths[0].id).toBe('sp')
  })

  it('two removed nodes in a closed subpath give two open pieces', () => {
    const closed6 = shapeOf([
      {
        id: 'sp',
        closed: true,
        nodes: ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => node(id, { x: i, y: 0 })),
      },
    ])
    const out = breakAtNodes(closed6, new Set(['b', 'e']))!
    expect(out.subpaths.map((sp) => sp.closed)).toEqual([false, false])
    expect(out.subpaths.map(ids)).toEqual([
      ['c', 'd'],
      ['f', 'a'],
    ])
    expect(out.subpaths[0].id).toBe('sp')
    expect(out.subpaths[1].id).not.toBe('sp')
  })

  it('removing every node returns null; nothing matching returns the same shape', () => {
    expect(breakAtNodes(closed4(), new Set(['a', 'b', 'c', 'd']))).toBeNull()
    const s = closed4()
    expect(breakAtNodes(s, new Set(['zzz']))).toBe(s)
  })

  it('does not mutate its input', () => {
    const s = closed4()
    const snapshot = JSON.stringify(s)
    breakAtNodes(s, new Set(['a']))
    expect(JSON.stringify(s)).toBe(snapshot)
  })
})

describe('enforceNodeModes after non-uniform scale', () => {
  it('makes smooth nodes collinear and symmetric nodes collinear with equal lengths', () => {
    const shape = shapeOf([
      {
        id: 'sp',
        closed: false,
        nodes: [
          node('a', { x: 0, y: 0 }, { hOut: { x: 3, y: 0 } }),
          node('b', { x: 10, y: 10 }, { hIn: { x: 6, y: 10 }, hOut: { x: 10, y: 15 }, mode: 'smooth' }),
          node('c', { x: 20, y: 0 }, { hIn: { x: 22, y: 6 }, hOut: { x: 26, y: 1 }, mode: 'symmetric' }),
          node('d', { x: 30, y: 10 }, { hIn: { x: 27, y: 9 } }),
        ],
      },
    ])
    // Make b and c smooth/symmetric consistent first, then distort non-uniformly.
    const aligned = {
      ...shape,
      subpaths: shape.subpaths.map((sp) => ({
        ...sp,
        nodes: sp.nodes.map((n) => (n.mode === 'corner' ? n : applyNodeMode(n, n.mode))),
      })),
    }
    const scaled = scaleAbout(aligned, 2, 0.5, { x: 3, y: 1 })
    const fixed = enforceNodeModes(scaled)
    const [, b, c] = fixed.subpaths[0].nodes

    const check = (n: PathNode, equal: boolean) => {
      const va = sub(n.hOut!, n.p)
      const vb = sub(n.p, n.hIn!)
      const cross = va.x * vb.y - va.y * vb.x
      expect(Math.abs(cross)).toBeLessThan(1e-9)
      expect(va.x * vb.x + va.y * vb.y).toBeGreaterThan(0)
      if (equal) expect(Math.abs(len(va) - len(vb))).toBeLessThan(1e-9)
    }
    check(b, false)
    check(c, true)
    // Idempotent.
    const again = enforceNodeModes(fixed).subpaths[0].nodes
    fixed.subpaths[0].nodes.forEach((n, i) => {
      near(again[i].p, n.p)
      if (n.hIn) near(again[i].hIn!, n.hIn)
      if (n.hOut) near(again[i].hOut!, n.hOut)
    })
    // Corner node untouched.
    expect(fixed.subpaths[0].nodes[0]).toEqual(scaled.subpaths[0].nodes[0])
  })
})

describe('retractHandles', () => {
  it('removes both handle keys and keeps mode and anchor', () => {
    const n: PathNode = { id: 'n', p: { x: 2, y: 3 }, mode: 'symmetric', hIn: { x: 0, y: 3 }, hOut: { x: 4, y: 3 } }
    const out = retractHandles(n)
    expect(out).toEqual({ id: 'n', p: { x: 2, y: 3 }, mode: 'symmetric' })
    expect('hIn' in out).toBe(false)
    expect('hOut' in out).toBe(false)
    expect(n.hIn).toEqual({ x: 0, y: 3 }) // input not mutated
  })
})

describe('setNodeMode (subpath)', () => {
  const open3 = (): Subpath => ({
    id: 'sp',
    closed: false,
    nodes: [node('a', { x: 0, y: 0 }), node('b', { x: 3, y: 4 }), node('c', { x: 10, y: 0 })],
  })
  const closed3 = (): Subpath => ({
    id: 'sp',
    closed: true,
    nodes: [node('a', { x: 0, y: 0 }), node('b', { x: 10, y: 0 }), node('c', { x: 0, y: 10 })],
  })
  const byId = (sp: Subpath, id: string) => sp.nodes.find((n) => n.id === id)!
  const hasKey = (n: PathNode, k: 'hIn' | 'hOut') => Object.prototype.hasOwnProperty.call(n, k)

  it('unknown nodeId returns the input unchanged', () => {
    const sp = open3()
    expect(setNodeMode(sp, 'zzz', 'smooth')).toBe(sp)
  })

  it('smooth on a handle-less middle node creates collinear handles of length dist/3 to each neighbour', () => {
    // b = (3,4); prev a = (0,0) dist 5; next c = (10,0) dist sqrt(65). Direction = unit(c - a) = (1,0).
    const out = setNodeMode(open3(), 'b', 'smooth')
    const b = byId(out, 'b')
    expect(b.mode).toBe('smooth')
    const dN = Math.hypot(7, 4)
    const dP = 5
    near(b.hOut!, { x: 3 + dN / 3, y: 4 }, 1e-9)
    near(b.hIn!, { x: 3 - dP / 3, y: 4 }, 1e-9)
    expect(byId(out, 'a')).toEqual(byId(open3(), 'a'))
    expect(byId(out, 'c')).toEqual(byId(open3(), 'c'))
  })

  it('symmetric on a handle-less middle node creates equal-length collinear handles', () => {
    const out = setNodeMode(open3(), 'b', 'symmetric')
    const b = byId(out, 'b')
    expect(b.mode).toBe('symmetric')
    const L = (5 / 3 + Math.hypot(7, 4) / 3) / 2
    near(b.hOut!, { x: 3 + L, y: 4 }, 1e-9)
    near(b.hIn!, { x: 3 - L, y: 4 }, 1e-9)
    expect(len(sub(b.hOut!, b.p))).toBeCloseTo(len(sub(b.hIn!, b.p)), 12)
  })

  it('closed subpath wraps neighbours (first node uses last node as prev)', () => {
    // a = (0,0): prev = c (0,10), next = b (10,0). dir = unit(b - c) = (1,-1)/sqrt2. dN = dP = 10.
    const s = Math.SQRT1_2
    const smooth = byId(setNodeMode(closed3(), 'a', 'smooth'), 'a')
    near(smooth.hOut!, { x: (10 / 3) * s, y: (-10 / 3) * s }, 1e-9)
    near(smooth.hIn!, { x: (-10 / 3) * s, y: (10 / 3) * s }, 1e-9)
    const sym = byId(setNodeMode(closed3(), 'a', 'symmetric'), 'a')
    near(sym.hOut!, { x: (10 / 3) * s, y: (-10 / 3) * s }, 1e-9)
    near(sym.hIn!, { x: (-10 / 3) * s, y: (10 / 3) * s }, 1e-9)
  })

  it('open first endpoint gets only hOut toward next, length dist/3, no mirror', () => {
    for (const mode of ['smooth', 'symmetric'] as const) {
      const a = byId(setNodeMode(open3(), 'a', mode), 'a')
      expect(a.mode).toBe(mode)
      // next = b (3,4), dist 5: dir (3,4)/5, length 5/3 => (1, 4/3).
      near(a.hOut!, { x: 1, y: 4 / 3 }, 1e-9)
      expect(hasKey(a, 'hIn')).toBe(false)
    }
  })

  it('open last endpoint gets only hIn toward prev, length dist/3, no mirror', () => {
    for (const mode of ['smooth', 'symmetric'] as const) {
      const c = byId(setNodeMode(open3(), 'c', mode), 'c')
      expect(c.mode).toBe(mode)
      // prev = b (3,4), dist sqrt(65) from c: hIn = c + (b - c)/3 = (10 - 7/3, 4/3).
      near(c.hIn!, { x: 10 - 7 / 3, y: 4 / 3 }, 1e-9)
      expect(hasKey(c, 'hOut')).toBe(false)
    }
  })

  it('lone node and corner switch create nothing', () => {
    const lone: Subpath = { id: 'l', closed: false, nodes: [node('a', { x: 1, y: 1 })] }
    const out = byId(setNodeMode(lone, 'a', 'symmetric'), 'a')
    expect(out).toEqual({ id: 'a', p: { x: 1, y: 1 }, mode: 'symmetric' })

    const c = byId(setNodeMode(open3(), 'b', 'corner'), 'b')
    expect(c).toEqual({ id: 'b', p: { x: 3, y: 4 }, mode: 'corner' })
  })

  it('zero-distance neighbour creates nothing and only changes the mode', () => {
    const sp: Subpath = {
      id: 'sp',
      closed: false,
      nodes: [node('a', { x: 0, y: 0 }), node('b', { x: 0, y: 0 }), node('c', { x: 5, y: 0 })],
    }
    expect(byId(setNodeMode(sp, 'b', 'smooth'), 'b')).toEqual({ id: 'b', p: { x: 0, y: 0 }, mode: 'smooth' })
  })

  it('a node that already has handles behaves as before (applyNodeMode)', () => {
    const sp: Subpath = {
      id: 'sp',
      closed: false,
      nodes: [
        node('a', { x: 0, y: 0 }),
        node('b', { x: 0, y: 0 }, { hOut: { x: 2, y: 0 }, hIn: { x: -6, y: 0 } }),
        node('c', { x: 10, y: 0 }),
      ],
    }
    const out = setNodeMode(sp, 'b', 'symmetric')
    expect(byId(out, 'b')).toEqual(applyNodeMode(byId(sp, 'b'), 'symmetric'))
    near(byId(out, 'b').hOut!, { x: 4, y: 0 })
    near(byId(out, 'b').hIn!, { x: -4, y: 0 })
    expect(byId(out, 'a')).toBe(byId(sp, 'a'))
    expect(byId(sp, 'b').mode).toBe('corner')
  })
})

describe('cutSegmentAt', () => {
  const nodes = ['a', 'b', 'c', 'd'].map((id, i) => node(id, { x: 4 * i, y: 4 }, {
    hIn: { x: 4 * i - 1, y: 5 }, hOut: { x: 4 * i + 1, y: 3 },
  }))
  const sp = { id: 'sp', nodes, closed: false }
  const curves = (s: Subpath) => segmentsOf(s).map((seg) => [seg.from.p, seg.c1, seg.c2, seg.to.p])

  it('splits open runs without changing their Béziers and drops isolated endpoints', () => {
    const [left, right] = cutSegmentAt(sp, 1)
    expect(left.id).toBe(sp.id)
    expect(right.id).not.toBe(sp.id)
    expect(left.nodes[1].hOut).toBeUndefined()
    expect(right.nodes[0].hIn).toBeUndefined()
    expect([...curves(left), ...curves(right)]).toEqual([curves(sp)[0], curves(sp)[2]])
    expect(cutSegmentAt(sp, 0).map((s) => [s.id, ...s.nodes.map((n) => n.id)])).toEqual([['sp', 'b', 'c', 'd']])
    expect(cutSegmentAt(sp, 2)[0].nodes.map((n) => n.id)).toEqual(['a', 'b', 'c'])
    expect(cutSegmentAt({ ...sp, nodes: nodes.slice(0, 2) }, 0)).toEqual([])
  })

  it('opens a contour at either directed edge of a two-node loop', () => {
    const loop = { ...sp, nodes: nodes.slice(0, 2), closed: true }
    for (const i of [0, 1]) {
      const [opened] = cutSegmentAt(loop, i)
      expect(opened.closed).toBe(false)
      expect(opened.id).toBe(loop.id)
      expect(opened.nodes.map((n) => n.id)).toEqual(i === 0 ? ['b', 'a'] : ['a', 'b'])
      expect(curves(opened)).toEqual([curves(loop)[1 - i]])
    }
  })
})
