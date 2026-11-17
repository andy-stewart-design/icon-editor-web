import type { IdGen } from './ids'

export type Pt = { x: number; y: number }
export type NodeMode = 'corner' | 'smooth' | 'symmetric'

export type PathNode = {
  id: string
  p: Pt // anchor, absolute document coordinates
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

export type IconDoc = {
  id: string
  version: 1
  size: number // artboard is size × size, default 24
  strokeWidth: number // default 1.5
  linecap: Linecap
  linejoin: Linejoin
  shapes: Shape[] // z-order, bottom to top
}

export const CURRENT_VERSION = 1

export type ParseResult =
  | { kind: 'ok'; doc: IconDoc }
  | { kind: 'invalid'; reason: string }
  | { kind: 'newerVersion'; version: number }

export function createDefaultDoc(ids: IdGen): IconDoc {
  return {
    id: ids.next(),
    version: CURRENT_VERSION,
    size: 24,
    strokeWidth: 1.5,
    linecap: 'round',
    linejoin: 'round',
    shapes: [],
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
  if (v.strokeWidth !== undefined) check(isPosNum(v.strokeWidth), `${where}.strokeWidth: expected positive number`)
  if (v.linecap !== undefined) check(isLinecap(v.linecap), `${where}.linecap: invalid value`)
  if (v.linejoin !== undefined) check(isLinejoin(v.linejoin), `${where}.linejoin: invalid value`)
  if (v.fill !== undefined) check(v.fill === 'none', `${where}.fill: invalid value`)
}

function checkShape(v: unknown, where: string): void {
  check(isObj(v) && isId(v.id), `${where}: expected shape with non-empty id`)
  check(v.type === 'path', `${where}.type: expected 'path'`)
  check(Array.isArray(v.subpaths), `${where}.subpaths: expected array`)
  v.subpaths.forEach((sp: unknown, i) => {
    const w = `${where}.subpaths[${i}]`
    check(isObj(sp) && isId(sp.id), `${w}: expected subpath with non-empty id`)
    check(Array.isArray(sp.nodes), `${w}.nodes: expected array`)
    sp.nodes.forEach((n: unknown, j: number) => checkNode(n, `${w}.nodes[${j}]`))
    check(typeof sp.closed === 'boolean', `${w}.closed: expected boolean`)
  })
  checkStyle(v.style, `${where}.style`)
}

function checkDoc(v: unknown): void {
  check(isObj(v), 'expected object')
  check(isId(v.id), 'id: expected non-empty string')
  check(v.version === CURRENT_VERSION, 'version: expected 1')
  check(isPosNum(v.size), 'size: expected positive number')
  check(isPosNum(v.strokeWidth), 'strokeWidth: expected positive number')
  check(isLinecap(v.linecap), 'linecap: invalid value')
  check(isLinejoin(v.linejoin), 'linejoin: invalid value')
  check(Array.isArray(v.shapes), 'shapes: expected array')
  v.shapes.forEach((s: unknown, i: number) => checkShape(s, `shapes[${i}]`))
}

export function parseIconDoc(input: unknown): ParseResult {
  if (isObj(input) && typeof input.version === 'number' && input.version > CURRENT_VERSION) {
    return { kind: 'newerVersion', version: input.version }
  }
  try {
    checkDoc(input)
    return { kind: 'ok', doc: input as IconDoc }
  } catch (e) {
    if (e instanceof InvalidDoc) return { kind: 'invalid', reason: e.message }
    throw e
  }
}
