import { newId } from './ids'

export type Pt = { x: number; y: number }
export type NodeMode = 'corner' | 'smooth' | 'symmetric'

export type PathNode = {
  id: string
  p: Pt // anchor, board-local coordinates
  hIn?: Pt // incoming handle, absolute; absent = at anchor
  hOut?: Pt // outgoing handle, absolute; absent = at anchor
  mode: NodeMode
  // Reserved post-MVP: cornerRadius?: number (live corners)
}

export type Subpath = { id: string; nodes: PathNode[]; closed: boolean }

export type Linecap = 'butt' | 'round' | 'square'
export type Linejoin = 'miter' | 'round' | 'bevel'

export type Style = {
  strokeWidth?: number // absent = inherit document default
  linecap?: Linecap
  linejoin?: Linejoin
  fill?: 'none' // widened post-MVP
}

export type PathShape = { id: string; type: 'path'; subpaths: Subpath[]; style: Style }
export type Shape = PathShape // union kept for future widening

export type StrokeDefaults = { strokeWidth: number; linecap: Linecap; linejoin: Linejoin }
export type BoardContent = StrokeDefaults & { size: number; shapes: Shape[] }
export type Artboard = Pick<BoardContent, 'size' | 'shapes'> & {
  id: string
  name: string
  origin: Pt
}
export type IconDoc = StrokeDefaults & { id: string; version: 2; boards: [Artboard, ...Artboard[]] }
export type LegacyIconDoc = BoardContent & { id: string; version: 1 }

export const CURRENT_VERSION = 2

export function artboardFor(doc: IconDoc, id?: string): Artboard {
  return doc.boards.find((board) => board.id === id) ?? doc.boards[0]
}

export function boardContent(doc: StrokeDefaults, { size, shapes }: Artboard): BoardContent {
  const { strokeWidth, linecap, linejoin } = doc
  return { size, shapes, strokeWidth, linecap, linejoin }
}

export type ParseResult =
  | { kind: 'ok'; doc: IconDoc }
  | { kind: 'invalid'; reason: string }
  | { kind: 'newerVersion'; version: number }

export function createDefaultDoc(): IconDoc {
  const id = newId()
  return {
    id,
    version: CURRENT_VERSION,
    boards: [
      { id: `${id}:board`, name: 'Artboard 1', origin: { x: 0, y: 0 }, size: 24, shapes: [] },
    ],
    strokeWidth: 1.5,
    linecap: 'round',
    linejoin: 'round',
  }
}

class InvalidDoc extends Error {}

function check(cond: unknown, reason: string): asserts cond {
  if (!cond) throw new InvalidDoc(reason)
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isPosNum = (v: unknown): v is number => isNum(v) && v > 0
const oneOf =
  <T extends string>(vals: readonly T[]) =>
  (v: unknown): v is T =>
    typeof v === 'string' && (vals as readonly string[]).includes(v)
const isLinecap = oneOf(['butt', 'round', 'square'] as const)
const isLinejoin = oneOf(['miter', 'round', 'bevel'] as const)
const isNodeMode = oneOf(['corner', 'smooth', 'symmetric'] as const)

function checkPt(v: unknown, where: string): void {
  check(isObj(v) && isNum(v.x) && isNum(v.y), `${where}: expected finite {x, y}`)
}

function checkNode(v: unknown, where: string): void {
  check(isObj(v) && isId(v.id), `${where}: expected node with non-empty id`)
  checkPt(v.p, `${where}.p`)
  if (v.hIn !== undefined) checkPt(v.hIn, `${where}.hIn`)
  if (v.hOut !== undefined) checkPt(v.hOut, `${where}.hOut`)
  check(isNodeMode(v.mode), `${where}.mode: invalid mode`)
}

function checkStyle(v: unknown, where: string): void {
  check(isObj(v), `${where}: expected object`)
  if (v.strokeWidth !== undefined)
    check(isPosNum(v.strokeWidth), `${where}.strokeWidth: expected positive number`)
  if (v.linecap !== undefined) check(isLinecap(v.linecap), `${where}.linecap: invalid value`)
  if (v.linejoin !== undefined) check(isLinejoin(v.linejoin), `${where}.linejoin: invalid value`)
  if (v.fill !== undefined) check(v.fill === 'none', `${where}.fill: invalid value`)
}

function checkShape(v: unknown, where: string): void {
  check(isObj(v) && isId(v.id), `${where}: expected shape with non-empty id`)
  check(v.type === 'path', `${where}.type: expected 'path'`)
  check(Array.isArray(v.subpaths), `${where}.subpaths: expected array`)
  for (const [i, sp] of v.subpaths.entries()) {
    const w = `${where}.subpaths[${i}]`
    check(isObj(sp) && isId(sp.id), `${w}: expected subpath with non-empty id`)
    check(Array.isArray(sp.nodes), `${w}.nodes: expected array`)
    for (const [j, n] of sp.nodes.entries()) checkNode(n, `${w}.nodes[${j}]`)
    check(typeof sp.closed === 'boolean', `${w}.closed: expected boolean`)
  }
  checkStyle(v.style, `${where}.style`)
}

function checkContent(v: Record<string, unknown>, where: string): void {
  // Stored sizes retain v1's positive finite range; the resize field is deliberately stricter.
  check(isPosNum(v.size), `${where}.size: expected positive number`)
  check(Array.isArray(v.shapes), `${where}.shapes: expected array`)
  for (const [i, shape] of v.shapes.entries()) checkShape(shape, `${where}.shapes[${i}]`)
}

export function parseIconDoc(input: unknown): ParseResult {
  if (isObj(input) && typeof input.version === 'number' && input.version > CURRENT_VERSION) {
    return { kind: 'newerVersion', version: input.version }
  }
  try {
    check(isObj(input), 'expected object')
    const { id, version, strokeWidth, linecap, linejoin } = input
    check(isId(id), 'id: expected non-empty string')
    check(isPosNum(strokeWidth), 'strokeWidth: expected positive number')
    check(isLinecap(linecap), 'linecap: invalid value')
    check(isLinejoin(linejoin), 'linejoin: invalid value')
    if (version === 1) {
      checkContent(input, 'document')
      const { size, shapes } = input as LegacyIconDoc
      return {
        kind: 'ok',
        doc: {
          id,
          version: CURRENT_VERSION,
          strokeWidth,
          linecap,
          linejoin,
          boards: [{ id: `${id}:board`, name: 'Artboard 1', origin: { x: 0, y: 0 }, size, shapes }],
        },
      }
    }
    check(version === CURRENT_VERSION, 'unsupported version')
    check(Array.isArray(input.boards) && input.boards.length > 0, 'boards: expected nonempty array')
    const ids = new Set<string>()
    const shapeOwners = new Map<string, string>()
    for (const board of input.boards as unknown[]) {
      check(
        isObj(board) && isId(board.id) && !ids.has(board.id),
        'boards: expected unique board id',
      )
      ids.add(board.id)
      check(typeof board.name === 'string', 'board.name: expected string')
      checkPt(board.origin, 'board.origin')
      checkContent(board, 'board')
      for (const shape of (board as Artboard).shapes) {
        const owner = shapeOwners.get(shape.id)
        check(owner === undefined || owner === board.id, 'shape id belongs to multiple boards')
        shapeOwners.set(shape.id, board.id)
      }
    }
    const { boards } = input as IconDoc
    return { kind: 'ok', doc: { id, version, boards, strokeWidth, linecap, linejoin } }
  } catch (e) {
    if (e instanceof InvalidDoc) return { kind: 'invalid', reason: e.message }
    throw e
  }
}
