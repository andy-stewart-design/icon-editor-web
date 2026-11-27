import type { Command, Recipe } from '../commands'
import { newId } from '../ids'
import { artboardFor, type Artboard, type IconDoc } from '../model'
import { cloneWithNewIds } from './arrange'
import { translateRecipe } from './selection'

function insertArtboard(
  doc: IconDoc,
  activeId: string,
  name: string,
  size: number,
  shapes: Artboard['shapes'],
  label: string,
): Command {
  const active = artboardFor(doc, activeId)
  const gap = 8
  const y = active.origin.y
  let x = active.origin.x + active.size + gap
  // Scan right from the active board, skipping occupied intervals in this row.
  const row = doc.boards
    .filter((board) => y < board.origin.y + board.size + gap && y + size + gap > board.origin.y)
    .sort((a, b) => a.origin.x - b.origin.x)
  for (const board of row) {
    if (x + size + gap <= board.origin.x) break
    x = Math.max(x, board.origin.x + board.size + gap)
  }
  const board: Artboard = { id: newId(), name, size, shapes, origin: { x, y } }
  return {
    label,
    activeBoardAfter: board.id,
    recipe: (_, draft) => {
      draft.boards.push(board)
    },
  }
}

export function addArtboard(doc: IconDoc, activeId: string): Command {
  const names = new Set(doc.boards.map((board) => board.name))
  let number = 1
  while (names.has(`Artboard ${number}`)) number++
  return insertArtboard(doc, activeId, `Artboard ${number}`, 24, [], 'Add artboard')
}

export function duplicateArtboard(doc: IconDoc, activeId: string): Command {
  const source = artboardFor(doc, activeId)
  return insertArtboard(
    doc,
    activeId,
    `${source.name} copy`,
    source.size,
    source.shapes.map(cloneWithNewIds),
    'Duplicate artboard',
  )
}

export function renameArtboard(name: string): Command {
  const trimmed = name.trim()
  return {
    label: 'Rename artboard',
    recipe: (board) => {
      if (trimmed) board.name = trimmed
    },
  }
}

export function deleteArtboard(): Command {
  return {
    label: 'Delete artboard',
    recipe: (board, draft) => {
      if (draft.boards.length > 1) draft.boards.splice(draft.boards.indexOf(board), 1)
    },
  }
}

export function moveArtboard(origin: Artboard['origin']): Command {
  const { x, y } = origin
  return {
    label: 'Move artboard',
    recipe: (board) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      board.origin.x = x
      board.origin.y = y
    },
  }
}

// Rebase the already translated artwork, then append in source draw order above existing artwork.
export function transferShapesRecipe(ids: readonly string[], destinationId: string): Recipe {
  const selected = new Set(ids)
  return (source, draft) => {
    const destination = draft.boards.find(({ id }) => id === destinationId)
    if (!destination || source === destination) return
    translateRecipe(
      ids,
      source.origin.x - destination.origin.x,
      source.origin.y - destination.origin.y,
    )(source, draft)
    destination.shapes.push(...source.shapes.filter(({ id }) => selected.has(id)))
    source.shapes = source.shapes.filter(({ id }) => !selected.has(id))
  }
}
