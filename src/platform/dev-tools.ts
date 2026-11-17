import {
  createCounterIdGen,
  serializeDoc,
  type EditorStore,
  type IconDoc,
  type IdGen,
  type NodeMode,
  type PathNode,
  type PathShape,
  type Pt,
  type Shape,
  type Style,
  type Subpath,
} from '../core'

export type IconEditorDevTools = {
  store: EditorStore
  doc: () => IconDoc
  svg: () => string
  loadFixture: () => void
}

declare global {
  interface Window {
    iconEditor?: IconEditorDevTools
  }
}

const KAPPA = 0.5523 // cubic handle length for a quarter circle, as a fraction of the radius

function fixtureShapes(ids: IdGen): Shape[] {
  const node = (x: number, y: number, mode: NodeMode = 'corner', handles: { hIn?: Pt; hOut?: Pt } = {}): PathNode => ({
    id: ids.next(),
    p: { x, y },
    mode,
    ...handles,
  })
  const sub = (nodes: PathNode[], closed = false): Subpath => ({ id: ids.next(), nodes, closed })
  const path = (subpaths: Subpath[], style: Style = {}): PathShape => ({ id: ids.next(), type: 'path', subpaths, style })

  const c = 12
  const r = 6
  const k = r * KAPPA
  const circle = sub(
    [
      node(c, c - r, 'smooth', { hIn: { x: c - k, y: c - r }, hOut: { x: c + k, y: c - r } }),
      node(c + r, c, 'smooth', { hIn: { x: c + r, y: c - k }, hOut: { x: c + r, y: c + k } }),
      node(c, c + r, 'smooth', { hIn: { x: c + k, y: c + r }, hOut: { x: c - k, y: c + r } }),
      node(c - r, c, 'smooth', { hIn: { x: c - r, y: c + k }, hOut: { x: c - r, y: c - k } }),
    ],
    true,
  )

  return [
    path([sub([node(4, 4), node(20, 20)])]),
    // The closing segment (last → first) is curved because the last node has hOut and the first has hIn.
    path([
      sub(
        [
          node(8, 4, 'corner', { hIn: { x: 2, y: 8 } }),
          node(20, 4),
          node(20, 20),
          node(8, 20, 'corner', { hOut: { x: 2, y: 16 } }),
        ],
        true,
      ),
    ]),
    path([circle]),
    path([sub([node(2, 2), node(6, 2), node(6, 6)])], { strokeWidth: 2 }),
    path([sub([node(14, 20), node(28, 20)])]),
  ]
}

export function installDevTools(store: EditorStore): void {
  window.iconEditor = {
    store,
    doc: () => store.getState().doc,
    svg: () => serializeDoc(store.getState().doc),
    loadFixture: () =>
      store.dispatch({
        label: 'Load fixture',
        recipe: (d) => {
          d.shapes = fixtureShapes(createCounterIdGen('fx'))
        },
      }),
  }
}
