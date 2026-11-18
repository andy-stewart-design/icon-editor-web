import type { Command } from '../commands'
import { scaleDoc } from '../geometry/transform'
import { isValidArtboardSize, isValidStrokeWidth } from '../validation'
import type { IconDoc, Linecap, Linejoin } from '../model'

// Document-level defaults. Each one is a single entry. Assigning the same value leaves the doc reference unchanged,
// so dispatch records nothing.
export function setDocStrokeWidth(width: number): Command {
  return {
    label: 'Document stroke width',
    recipe: (d) => {
      if (!isValidStrokeWidth(width) || d.strokeWidth === width) return
      d.strokeWidth = width
    },
  }
}

export function setDocLinecap(cap: Linecap): Command {
  return {
    label: 'Document linecap',
    recipe: (d) => {
      if (d.linecap !== cap) d.linecap = cap
    },
  }
}

export function setDocLinejoin(join: Linejoin): Command {
  return {
    label: 'Document linejoin',
    recipe: (d) => {
      if (d.linejoin !== join) d.linejoin = join
    },
  }
}

// 'keep' changes only doc.size, so coordinates stay put and shapes may extend past the artboard.
// 'scale' multiplies every coordinate by newSize / size about the origin (scaleDoc), and stroke widths stay as they are.
// Guides are derived from size, so they regenerate with no extra work here.
export type ResizeMode = 'keep' | 'scale'

export function resizeArtboard(size: number, mode: ResizeMode): Command {
  return {
    label: mode === 'keep' ? 'Resize artboard' : 'Resize artboard (scale)',
    recipe: (d) => {
      if (!isValidArtboardSize(size) || d.size === size) return
      if (mode === 'keep') {
        d.size = size
        return
      }
      // scaleDoc reads the draft and returns a new doc. Copying size and shapes back keeps the other fields intact.
      const next = scaleDoc(d as IconDoc, size)
      d.size = next.size
      d.shapes = next.shapes
    },
  }
}
