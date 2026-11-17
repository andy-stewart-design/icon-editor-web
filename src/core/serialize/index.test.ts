import { describe, expect, it } from 'vitest'
import { createCounterIdGen } from '../ids'
import { createDefaultDoc, type IconDoc, type PathNode, type PathShape, type Subpath } from '../model'
import { serializeDoc } from '.'

const corner = (id: string, x: number, y: number): PathNode => ({ id, p: { x, y }, mode: 'corner' })
const sub = (id: string, nodes: PathNode[], closed = false): Subpath => ({ id, nodes, closed })
const shape = (id: string, subpaths: Subpath[], style: PathShape['style'] = {}): PathShape => ({
  id,
  type: 'path',
  subpaths,
  style,
})
const docWith = (shapes: PathShape[]): IconDoc => ({ ...createDefaultDoc(createCounterIdGen()), shapes })

const ROOT_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'

describe('serializeDoc', () => {
  it('matches the spec example exactly', () => {
    const line = shape('s1', [sub('sp1', [corner('n1', 4, 4), corner('n2', 20, 20)])])
    expect(serializeDoc(docWith([line]))).toBe(`${ROOT_OPEN}\n  <path d="M4 4L20 20"/>\n</svg>`)
  })

  it('is deterministic, and the empty document has no children', () => {
    const line = shape('s1', [sub('sp1', [corner('n1', 4, 4), corner('n2', 20, 20)])])
    const doc = docWith([line])
    expect(serializeDoc(doc)).toBe(serializeDoc(doc))

    const empty = serializeDoc(docWith([]))
    expect(empty).toBe(`${ROOT_OPEN}</svg>`)
    expect(empty).not.toContain('<path')

    // A shape whose subpaths have no nodes is not emitted either.
    const hollow = serializeDoc(docWith([shape('s2', [sub('sp2', [])])]))
    expect(hollow).toBe(`${ROOT_OPEN}</svg>`)
  })

  it('writes stroke-width only on the shape that overrides it, with rounded numbers', () => {
    const a = shape('a', [sub('spa', [corner('n1', 3.14159, -0.001), corner('n2', 1.005, 2)])])
    const b = shape('b', [sub('spb', [corner('n3', 0, 0), corner('n4', 1, 1)])], { strokeWidth: 2 })
    const out = serializeDoc(docWith([a, b]))
    expect(out).toBe(`${ROOT_OPEN}\n  <path d="M3.14 0L1.01 2"/>\n  <path d="M0 0L1 1" stroke-width="2"/>\n</svg>`)
    expect(out).not.toMatch(/-0(?![.\d])/)
    expect(out).not.toMatch(/\.\d{3,}/)
  })

  it('draws a curved closing segment as C before Z, and a straight one as Z alone', () => {
    const corners = [corner('a', 0, 0), corner('b', 10, 0), corner('c', 10, 10), corner('d', 0, 10)]
    const straight = serializeDoc(docWith([shape('s', [sub('sp', corners, true)])]))
    expect(straight).toContain('<path d="M0 0L10 0L10 10L0 10Z"/>')

    const [a, b, c, d] = corners
    const handle = { x: -2, y: 5 }
    const curvedNodes = [{ ...a, hIn: handle }, b, c, { ...d, hOut: handle }]
    const curved = serializeDoc(docWith([shape('s', [sub('sp', curvedNodes, true)])]))
    expect(curved).toContain('<path d="M0 0L10 0L10 10L0 10C-2 5 -2 5 0 0Z"/>')
  })

  it('never emits transform, id, class or style attributes', () => {
    const doc = docWith([
      shape('s1', [sub('sp1', [corner('n1', 1, 1), { ...corner('n2', 5, 5), hIn: { x: 4, y: 4 } }], true)], {
        strokeWidth: 3,
        linecap: 'square',
        linejoin: 'bevel',
      }),
    ])
    expect(serializeDoc(doc)).not.toMatch(/transform|\bid=|class=|style=/)
  })
})
