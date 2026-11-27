import { describe, expect, it } from 'vitest'
import { createDefaultDoc, parseIconDoc } from './model'
import { artboardWorkspace } from './test-fixtures/artboard-workspace'

const [small, large] = artboardWorkspace.boards
const withBoards = (...boards: unknown[]) => ({ ...artboardWorkspace, boards })

describe('workspace schema', () => {
  it('creates one empty board at the origin with shared defaults', () => {
    const doc = createDefaultDoc()
    expect(doc).toEqual({
      id: expect.any(String),
      version: 2,
      strokeWidth: 1.5,
      linecap: 'round',
      linejoin: 'round',
      boards: [
        {
          id: expect.any(String),
          name: 'Artboard 1',
          size: 24,
          origin: { x: 0, y: 0 },
          shapes: [],
        },
      ],
    })
  })

  it('round-trips a non-trivial ordered workspace', () => {
    expect(parseIconDoc(JSON.parse(JSON.stringify(artboardWorkspace)))).toEqual({
      kind: 'ok',
      doc: artboardWorkspace,
    })
  })

  it.each([
    ['null', null],
    ['no boards', withBoards()],
    ['duplicate board id', withBoards(small, small)],
    ['shared shape identity', withBoards(small, { ...large, shapes: small.shapes })],
    ['nonfinite origin', withBoards({ ...small, origin: { x: 0, y: Infinity } })],
    ['nonpositive size', withBoards({ ...small, size: 0 })],
    ['missing shapes', withBoards({ ...small, shapes: undefined })],
    [
      'bad mode',
      withBoards({
        ...small,
        shapes: [
          {
            ...small.shapes[0],
            subpaths: [
              { id: 'sp', closed: false, nodes: [{ id: 'n', p: { x: 1, y: 2 }, mode: 'wobbly' }] },
            ],
          },
        ],
      }),
    ],
    [
      'NaN coordinate',
      withBoards({
        ...small,
        shapes: [
          {
            ...small.shapes[0],
            subpaths: [
              {
                id: 'sp',
                closed: false,
                nodes: [{ id: 'n', p: { x: NaN, y: 2 }, mode: 'corner' }],
              },
            ],
          },
        ],
      }),
    ],
  ])('rejects %s as invalid', (_name, input) => {
    expect(parseIconDoc(input).kind).toBe('invalid')
  })

  it('reports a newer version before validating', () => {
    expect(parseIconDoc({ version: 3 })).toEqual({ kind: 'newerVersion', version: 3 })
  })
})
