import { boardContent, createDefaultDoc, type IconDoc, type PathShape, type Pt } from '../model'

export function workspaceWithShapes(shapes: PathShape[]): IconDoc {
  const doc = createDefaultDoc()
  doc.boards[0].shapes = shapes
  return doc
}

export const contentOfFirstBoard = (doc: IconDoc) => boardContent(doc, doc.boards[0])

const line = (id: string, a: Pt, b: Pt): PathShape => ({
  id,
  type: 'path',
  style: {},
  subpaths: [
    {
      id: `${id}-path`,
      closed: false,
      nodes: [a, b].map((p, i) => ({ id: `${id}-${i}`, mode: 'corner', p })),
    },
  ],
})

export const artboardWorkspace: IconDoc = {
  id: 'workspace-fixture',
  version: 2,
  strokeWidth: 1.5,
  linecap: 'round',
  linejoin: 'round',
  boards: [
    {
      id: 'small',
      name: 'Small',
      size: 24,
      origin: { x: -12.25, y: 8.25 },
      shapes: [
        line('small-overflow', { x: 3, y: 8 }, { x: 34, y: 8 }),
        line('small-interior', { x: 8, y: 14 }, { x: 18, y: 19 }),
      ],
    },
    {
      id: 'large',
      name: 'Large',
      size: 32,
      origin: { x: 16.25, y: 6.5 },
      shapes: [line('large-overflow', { x: -12, y: 15 }, { x: 24, y: 15 })],
    },
  ],
}
