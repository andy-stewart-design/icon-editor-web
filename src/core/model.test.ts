import { describe, expect, it } from 'vitest'
import { createDefaultDoc, parseIconDoc, type IconDoc } from './model'

const sampleDoc = (): IconDoc => ({
  id: 'doc1',
  version: 1,
  size: 24,
  strokeWidth: 1.5,
  linecap: 'round',
  linejoin: 'round',
  shapes: [
    {
      id: 's1',
      type: 'path',
      style: { strokeWidth: 2, linecap: 'butt' },
      subpaths: [
        {
          id: 'sp1',
          closed: false,
          nodes: [
            { id: 'n1', p: { x: 1.25, y: 2 }, hOut: { x: 3, y: 4 }, mode: 'smooth' },
            { id: 'n2', p: { x: 10, y: 10 }, hIn: { x: 8, y: 9.5 }, mode: 'corner' },
          ],
        },
        {
          id: 'sp2',
          closed: true,
          nodes: [
            { id: 'n3', p: { x: 0, y: 0 }, mode: 'corner' },
            { id: 'n4', p: { x: 5, y: 0 }, hIn: { x: 4, y: 1 }, hOut: { x: 6, y: -1 }, mode: 'symmetric' },
            { id: 'n5', p: { x: 5, y: 5 }, mode: 'corner' },
          ],
        },
      ],
    },
  ],
})

describe('createDefaultDoc', () => {
  it('uses the spec defaults', () => {
    const doc = createDefaultDoc()
    expect(doc).toEqual({
      id: expect.any(String),
      version: 1,
      size: 24,
      strokeWidth: 1.5,
      linecap: 'round',
      linejoin: 'round',
      shapes: [],
    })
  })
})

describe('parseIconDoc', () => {
  it('round-trips a non-trivial doc through JSON', () => {
    const doc = sampleDoc()
    const result = parseIconDoc(JSON.parse(JSON.stringify(doc)))
    expect(result).toEqual({ kind: 'ok', doc })
  })

  it.each([
    ['null', null],
    ['missing shapes', { ...sampleDoc(), shapes: undefined }],
    ['bad mode', { ...sampleDoc(), shapes: [{ ...sampleDoc().shapes[0], subpaths: [{ id: 'x', closed: false, nodes: [{ id: 'n', p: { x: 0, y: 0 }, mode: 'wobbly' }] }] }] }],
    ['NaN coordinate', { ...sampleDoc(), shapes: [{ ...sampleDoc().shapes[0], subpaths: [{ id: 'x', closed: false, nodes: [{ id: 'n', p: { x: NaN, y: 0 }, mode: 'corner' }] }] }] }],
  ])('rejects %s as invalid', (_name, input) => {
    expect(parseIconDoc(input).kind).toBe('invalid')
  })

  it('reports a newer version before validating', () => {
    expect(parseIconDoc({ version: 2 })).toEqual({ kind: 'newerVersion', version: 2 })
  })
})
