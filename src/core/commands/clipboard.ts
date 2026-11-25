import type { Command } from '../commands'
import { selectionBounds } from '../geometry/bounds'
import { translate } from '../geometry/transform'
import { resolveSegment, type Selection } from '../history'
import type { IconDoc, PathNode, PathShape, Pt } from '../model'
import { cloneWithNewIds, deleteSelection } from './arrange'
import { deleteSelectedNodes, selectedNodes } from './nodes'

export type Clipboard = { kind: 'shapes' | 'points'; shapes: PathShape[] }

export function captureClipboard(doc: IconDoc, sel: Selection, nodeSelect: boolean, cut: boolean) {
  if (!nodeSelect || (!sel.nodes.length && !sel.segment)) {
    const picked = new Set(sel.shapeIds)
    const shapes = doc.shapes.filter((shape) => picked.has(shape.id))
    if (!shapes.length) return
    // Document commands replace immutable snapshots, so these shapes survive later edits unchanged.
    return {
      payload: { kind: 'shapes', shapes } satisfies Clipboard,
      command: cut ? deleteSelection(sel) : undefined,
    }
  }

  const resolved = selectedNodes(doc, sel)
  if (!resolved.length) return
  const picked = new Set(resolved.map(({ node }) => node))
  const shapes: PathShape[] = []
  for (const shape of doc.shapes) {
    const subpaths: PathShape['subpaths'] = []
    for (const sp of shape.subpaths) {
      const runs: PathNode[][] = []
      let run: PathNode[] | undefined
      let count = 0
      for (const node of sp.nodes) {
        if (!picked.has(node)) {
          run = undefined
          continue
        }
        if (!run) runs.push((run = []))
        run.push(node)
        count++
      }
      if (!count) continue
      if (cut && sp.nodes.length - count === 1) return
      if (
        sp.closed &&
        runs.length > 1 &&
        picked.has(sp.nodes[0]) &&
        picked.has(sp.nodes[sp.nodes.length - 1])
      ) {
        // The seam run occupies the first run's slot, but traverses from its actual path start.
        runs[0] = [...runs[runs.length - 1], ...runs[0]]
        runs.pop()
      }
      const whole = count === sp.nodes.length
      for (const nodes of runs) {
        if (!whole && nodes.length > 1) {
          const first = { ...nodes[0] }
          const last = { ...nodes[nodes.length - 1] }
          delete first.hIn
          delete last.hOut
          nodes[0] = first
          nodes[nodes.length - 1] = last
        }
        subpaths.push({ ...sp, nodes, closed: sp.closed && whole })
      }
    }
    if (subpaths.length) shapes.push({ ...shape, subpaths })
  }
  return {
    payload: { kind: 'points', shapes } satisfies Clipboard,
    command: cut
      ? deleteSelectedNodes({ ...sel, nodes: resolved.map(({ ref }) => ref) }, 'join')
      : undefined,
  }
}

export function pasteClipboard(
  doc: IconDoc,
  sel: Selection,
  nodeSelect: boolean,
  payload: Clipboard,
  center: Pt | undefined,
): Command | undefined {
  const selectionAfter: Selection = { shapeIds: [], nodes: [] }
  const loose: PathNode[] = []
  const shapes: PathShape[] = []
  const points = payload.kind === 'points'
  const hasLoose =
    points && payload.shapes.some((shape) => shape.subpaths.some((sp) => sp.nodes.length === 1))
  const pickedNodes = points && nodeSelect ? selectedNodes(doc, sel) : []
  if (hasLoose && new Set(pickedNodes.map(({ node }) => node)).size !== 1) return
  const anchor = hasLoose ? pickedNodes[0] : undefined
  let owner = anchor?.shape
  if (points && nodeSelect && !anchor) {
    const explicitIds = new Set(pickedNodes.map(({ shape }) => shape.id))
    if (sel.segment && resolveSegment(doc, sel.segment)) explicitIds.add(sel.segment.shapeId)
    const candidates = explicitIds.size ? explicitIds : new Set(sel.shapeIds)
    const live = doc.shapes.filter((shape) => candidates.has(shape.id))
    if (live.length > 1) return
    owner = live[0]
  }
  const ownerIndex = owner ? doc.shapes.indexOf(owner) : -1

  // Include loose points in the same bounds before splitting them into their destination.
  const bounds = center && selectionBounds(payload.shapes)
  const offset = center &&
    bounds && {
      x: center.x - (bounds.x + bounds.w / 2),
      y: center.y - (bounds.y + bounds.h / 2),
    }
  for (const source of payload.shapes) {
    const clone = cloneWithNewIds(source)
    const shape = offset ? translate(clone, offset.x, offset.y) : clone
    if (points) {
      shape.subpaths = shape.subpaths.filter((sp) => {
        if (sp.nodes.length === 1) {
          loose.push(sp.nodes[0])
          return false
        }
        for (const node of sp.nodes) {
          selectionAfter.nodes.push({
            shapeId: owner?.id ?? shape.id,
            subpathId: sp.id,
            nodeId: node.id,
          })
        }
        return true
      })
      if (!shape.subpaths.length) continue
    }
    shapes.push(shape)
    if (!owner) selectionAfter.shapeIds.push(shape.id)
  }
  if (owner) selectionAfter.shapeIds.push(owner.id)
  const contours = owner ? shapes.flatMap((shape) => shape.subpaths) : []
  const insertion = anchor && {
    subpathIndex: anchor.shape.subpaths.indexOf(anchor.subpath),
    index: anchor.subpath.nodes.indexOf(anchor.node) + 1,
  }
  if (anchor) selectionAfter.nodes.unshift(...loose.map((n) => ({ ...anchor.ref, nodeId: n.id })))
  return {
    label: 'Paste',
    selectionAfter,
    recipe: (draft) => {
      if (ownerIndex < 0) {
        draft.shapes.push(...shapes)
        return
      }
      const { subpaths } = draft.shapes[ownerIndex]
      if (insertion) subpaths[insertion.subpathIndex].nodes.splice(insertion.index, 0, ...loose)
      subpaths.push(...contours)
    },
  }
}
