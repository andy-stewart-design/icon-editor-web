import { activeContent, createEditorStore } from '../store'
import { artboardWorkspace } from '../test-fixtures/artboard-workspace'
import { describe, expect, it } from 'vitest'
import { boardContent, parseIconDoc, type PathNode, type PathShape, type Subpath } from '../model'
import { legacyIconDoc, legacyIconSvg } from '../test-fixtures/legacy-icon-doc'
import { serializeSvg, type SvgInput } from '.'

const corner = (id: string, x: number, y: number): PathNode => ({ id, p: { x, y }, mode: 'corner' })
const sub = (id: string, nodes: PathNode[], closed = false): Subpath => ({ id, nodes, closed })
const shape = (id: string, subpaths: Subpath[], style: PathShape['style'] = {}): PathShape => ({
  id,
  type: 'path',
  subpaths,
  style,
})
const sharedStroke = { strokeWidth: 1.5, linecap: 'round', linejoin: 'round' } as const
const svgWith = (shapes: PathShape[], size = 24): SvgInput => ({ ...sharedStroke, size, shapes })

const ROOT_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'

describe('serializeSvg', () => {
  it('matches the full legacy SVG without cropping or reordering paths', () => {
    const parsed = parseIconDoc(legacyIconDoc)
    if (parsed.kind !== 'ok') throw new Error('expected legacy migration')
    expect(serializeSvg(boardContent(parsed.doc, parsed.doc.boards[0]))).toBe(legacyIconSvg)
  })

  it('exports each board independently even when their local paths overlap', () => {
    const line = (id: string, x: number, y: number) =>
      shape(id, [sub(`${id}-path`, [corner(`${id}-start`, 4, 4), corner(`${id}-end`, x, y)])])
    const small = svgWith([line('first', 30, 4), line('second', -3, 4)])
    const large = svgWith([line('other', 4, 60)], 48)
    const largeRoot = ROOT_OPEN.replaceAll('24', '48')

    expect(serializeSvg(small)).toBe(
      `${ROOT_OPEN}\n  <path d="M4 4L30 4"/>\n  <path d="M4 4L-3 4"/>\n</svg>`,
    )
    expect(serializeSvg(large)).toBe(`${largeRoot}\n  <path d="M4 4L4 60"/>\n</svg>`)
  })

  it('takes all and only the active board paths despite selection', () => {
    const store = createEditorStore(artboardWorkspace)
    store.setSelection({ shapeIds: ['small-interior'], nodes: [] })
    expect(serializeSvg(activeContent(store.getState()))).toBe(
      `${ROOT_OPEN}\n  <path d="M3 8L34 8"/>\n  <path d="M8 14L18 19"/>\n</svg>`,
    )
    store.activateBoard('large')
    store.setSelection({ shapeIds: ['large-overflow'], nodes: [] })
    expect(serializeSvg(activeContent(store.getState()))).toBe(
      `${ROOT_OPEN.replaceAll('24', '32')}\n  <path d="M-12 15L24 15"/>\n</svg>`,
    )
  })

  it('matches the spec example exactly', () => {
    const line = shape('s1', [sub('sp1', [corner('n1', 4, 4), corner('n2', 20, 20)])])
    expect(serializeSvg(svgWith([line]))).toBe(`${ROOT_OPEN}\n  <path d="M4 4L20 20"/>\n</svg>`)
  })

  it('is deterministic, and the empty document has no children', () => {
    const line = shape('s1', [sub('sp1', [corner('n1', 4, 4), corner('n2', 20, 20)])])
    const doc = svgWith([line])
    expect(serializeSvg(doc)).toBe(serializeSvg(doc))

    const empty = serializeSvg(svgWith([]))
    expect(empty).toBe(`${ROOT_OPEN}</svg>`)
    expect(empty).not.toContain('<path')

    // A shape whose subpaths have no nodes is not emitted either.
    const hollow = serializeSvg(svgWith([shape('s2', [sub('sp2', [])])]))
    expect(hollow).toBe(`${ROOT_OPEN}</svg>`)
  })

  it('writes stroke-width only on the shape that overrides it, with rounded numbers', () => {
    const a = shape('a', [sub('spa', [corner('n1', 3.14159, -0.001), corner('n2', 1.005, 2)])])
    const b = shape('b', [sub('spb', [corner('n3', 0, 0), corner('n4', 1, 1)])], { strokeWidth: 2 })
    const out = serializeSvg(svgWith([a, b]))
    expect(out).toBe(
      `${ROOT_OPEN}\n  <path d="M3.14 0L1.01 2"/>\n  <path d="M0 0L1 1" stroke-width="2"/>\n</svg>`,
    )
    expect(out).not.toMatch(/-0(?![.\d])/)
    expect(out).not.toMatch(/\.\d{3,}/)
  })

  it('draws a curved closing segment as C before Z, and a straight one as Z alone', () => {
    const corners = [corner('a', 0, 0), corner('b', 10, 0), corner('c', 10, 10), corner('d', 0, 10)]
    const straight = serializeSvg(svgWith([shape('s', [sub('sp', corners, true)])]))
    expect(straight).toContain('<path d="M0 0L10 0L10 10L0 10Z"/>')

    const [a, b, c, d] = corners
    const handle = { x: -2, y: 5 }
    const curvedNodes = [{ ...a, hIn: handle }, b, c, { ...d, hOut: handle }]
    const curved = serializeSvg(svgWith([shape('s', [sub('sp', curvedNodes, true)])]))
    expect(curved).toContain('<path d="M0 0L10 0L10 10L0 10C-2 5 -2 5 0 0Z"/>')
  })

  it('never emits transform, id, class or style attributes', () => {
    const doc = svgWith([
      shape(
        's1',
        [sub('sp1', [corner('n1', 1, 1), { ...corner('n2', 5, 5), hIn: { x: 4, y: 4 } }], true)],
        {
          strokeWidth: 3,
          linecap: 'square',
          linejoin: 'bevel',
        },
      ),
    ])
    expect(serializeSvg(doc)).not.toMatch(/transform|\bid=|class=|style=/)
  })
})
