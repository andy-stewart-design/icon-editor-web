import { formatNumber } from './format'
import type { PathNode, Pt, Shape, StrokeDefaults, Subpath } from '../model'

// One square board, with paths in paint order and coordinates local to the board.
export type SvgInput = StrokeDefaults & { size: number; shapes: readonly Shape[] }

type Attr = [string, string]

const pt = (p: Pt): string => `${formatNumber(p.x)} ${formatNumber(p.y)}`

// Only numbers and validated enum values reach attributes, but escape anyway so the output is always well-formed.
const escapeAttr = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

const attrString = (attrs: Attr[]): string =>
  attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('')

export function presentationAttributes(defaults: StrokeDefaults): Attr[] {
  return [
    ['fill', 'none'],
    ['stroke', 'currentColor'],
    ['stroke-width', formatNumber(defaults.strokeWidth)],
    ['stroke-linecap', defaults.linecap],
    ['stroke-linejoin', defaults.linejoin],
  ]
}

// Straight when both facing handles are absent; otherwise cubic, with a missing handle at its anchor.
function segment(from: PathNode, to: PathNode): string {
  if (from.hOut === undefined && to.hIn === undefined) return `L${pt(to.p)}`
  const c1 = from.hOut ?? from.p
  const c2 = to.hIn ?? to.p
  return `C${pt(c1)} ${pt(c2)} ${pt(to.p)}`
}

function subpathData(sp: Subpath): string {
  const { nodes } = sp
  if (nodes.length === 0) return ''
  let d = `M${pt(nodes[0].p)}`
  for (let i = 0; i + 1 < nodes.length; i++) d += segment(nodes[i], nodes[i + 1])
  if (sp.closed) {
    const last = nodes[nodes.length - 1]
    const first = nodes[0]
    // A straight closing segment is implied by Z; a curved one is drawn back to the first anchor first.
    const straight = last.hOut === undefined && first.hIn === undefined
    d += (straight ? '' : segment(last, first)) + 'Z'
  }
  return d
}

export function pathData(subpaths: Subpath[]): string {
  return subpaths.map(subpathData).join('')
}

export function shapeAttributes(shape: Shape): Attr[] {
  const attrs: Attr[] = [['d', pathData(shape.subpaths)]]
  const { strokeWidth, linecap, linejoin } = shape.style
  if (strokeWidth !== undefined) attrs.push(['stroke-width', formatNumber(strokeWidth)])
  if (linecap !== undefined) attrs.push(['stroke-linecap', linecap])
  if (linejoin !== undefined) attrs.push(['stroke-linejoin', linejoin])
  return attrs
}

// One <path/> per shape that has any geometry; shapes with no nodes are skipped.
const pathAttributes = (shapes: readonly Shape[]): Attr[][] =>
  shapes.map(shapeAttributes).filter((attrs) => attrs[0][1] !== '')

const pathElement = (attrs: Attr[]): string => `<path${attrString(attrs)}/>`

// The <path/> elements alone, with no separator and no root <svg>.
export function serializeBody({ shapes }: Pick<SvgInput, 'shapes'>): string {
  return pathAttributes(shapes).map(pathElement).join('')
}

export function serializeSvg(input: SvgInput): string {
  const size = formatNumber(input.size)
  const attrs: Attr[] = [
    ['xmlns', 'http://www.w3.org/2000/svg'],
    ['width', size],
    ['height', size],
    ['viewBox', `0 0 ${size} ${size}`],
    ...presentationAttributes(input),
  ]
  const open = `<svg${attrString(attrs)}>`
  const paths = pathAttributes(input.shapes)
  if (paths.length === 0) return `${open}</svg>`
  const body = paths.map((attrs) => `\n  ${pathElement(attrs)}`).join('')
  return `${open}${body}\n</svg>`
}
