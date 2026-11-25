import type { Command } from '../commands'
import type { Selection } from '../history'
import type { IconDoc, PathNode, PathShape } from '../model'
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
): Command | undefined {
  const selectionAfter: Selection = { shapeIds: [], nodes: [] }
  const loose: PathNode[] = []
  const shapes: PathShape[] = []
  const points = payload.kind === 'points'
  const hasLoose =
    points && payload.shapes.some((shape) => shape.subpaths.some((sp) => sp.nodes.length === 1))
  const anchors = hasLoose && nodeSelect ? selectedNodes(doc, sel) : []
  if (hasLoose && new Set(anchors.map(({ node }) => node)).size !== 1) return
  const anchor = anchors[0]

  for (const source of payload.shapes) {
    const shape = cloneWithNewIds(source)
    if (points) {
      shape.subpaths = shape.subpaths.filter((sp) => {
        if (sp.nodes.length === 1) {
          loose.push(sp.nodes[0])
          return false
        }
        for (const node of sp.nodes) {
          selectionAfter.nodes.push({ shapeId: shape.id, subpathId: sp.id, nodeId: node.id })
        }
        return true
      })
      if (!shape.subpaths.length) continue
    }
    shapes.push(shape)
    selectionAfter.shapeIds.push(shape.id)
  }
  let destination: { shapeIndex: number; subpathIndex: number; insertAt: number } | undefined
  if (anchor) {
    const { ref, shape, subpath, node } = anchor
    destination = {
      shapeIndex: doc.shapes.indexOf(shape),
      subpathIndex: shape.subpaths.indexOf(subpath),
      insertAt: subpath.nodes.indexOf(node) + 1,
    }
    selectionAfter.shapeIds.unshift(ref.shapeId)
    selectionAfter.nodes.unshift(...loose.map((n) => ({ ...ref, nodeId: n.id })))
  }
  return {
    label: 'Paste',
    selectionAfter,
    recipe: (draft) => {
      if (destination) {
        const { shapeIndex, subpathIndex, insertAt } = destination
        draft.shapes[shapeIndex].subpaths[subpathIndex].nodes.splice(insertAt, 0, ...loose)
      }
      draft.shapes.push(...shapes)
    },
  }
}
