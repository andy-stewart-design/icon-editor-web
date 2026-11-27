import type { IconDoc, Pt } from './model'

// zoom = CSS px per doc unit (1 = 100%, 32 = 3200%); pan = screen position of the doc origin in the canvas element.
export type Viewport = { zoom: number; panX: number; panY: number }
export type Size = { width: number; height: number }

export const MIN_ZOOM = 1
export const MAX_ZOOM = 32

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export function docToScreen(vp: Viewport, pt: Pt): Pt {
  return { x: pt.x * vp.zoom + vp.panX, y: pt.y * vp.zoom + vp.panY }
}

export function screenToDoc(vp: Viewport, pt: Pt): Pt {
  return { x: (pt.x - vp.panX) / vp.zoom, y: (pt.y - vp.panY) / vp.zoom }
}

// Keeps the doc point under screenPt fixed on screen while the zoom changes.
export function zoomAt(vp: Viewport, nextZoom: number, screenPt: Pt): Viewport {
  const zoom = clampZoom(nextZoom)
  const doc = screenToDoc(vp, screenPt)
  return { zoom, panX: screenPt.x - doc.x * zoom, panY: screenPt.y - doc.y * zoom }
}

// Centers a width × height artboard in the canvas at the largest zoom that fits within padding.
export function fitViewport(size: Size, width: number, height: number, padding = 48): Viewport {
  const fit = Math.min((size.width - 2 * padding) / width, (size.height - 2 * padding) / height)
  return centeredViewport(size, width, height, clampZoom(fit))
}

export function actualSizeViewport(size: Size, width: number, height: number): Viewport {
  return centeredViewport(size, width, height, 1)
}

// Grid lines are hidden when their on-screen spacing would fall below 6 CSS px.
export const gridSpacingVisible = (zoom: number, unit: number): boolean => zoom * unit >= 6

function centeredViewport(size: Size, width: number, height: number, zoom: number): Viewport {
  return {
    zoom,
    panX: (size.width - width * zoom) / 2,
    panY: (size.height - height * zoom) / 2,
  }
}

// Projects board-local geometry through the workspace viewport.
export function boardViewport(vp: Viewport, origin: Pt): Viewport {
  const { x, y } = docToScreen(vp, origin)
  return { zoom: vp.zoom, panX: x, panY: y }
}

// Converts a centered board-local view back to workspace coordinates.
export function workspaceViewport(vp: Viewport, origin: Pt): Viewport {
  return boardViewport(vp, { x: -origin.x, y: -origin.y })
}

export function initialWorkspaceViewport(canvas: Size, doc: IconDoc) {
  const first = doc.boards[0]
  const fitFirst = () =>
    workspaceViewport(fitViewport(canvas, first.size, first.size), first.origin)
  if (doc.boards.length === 1) return fitFirst()
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity
  for (const { origin, size } of doc.boards) {
    left = Math.min(left, origin.x)
    top = Math.min(top, origin.y)
    right = Math.max(right, origin.x + size)
    bottom = Math.max(bottom, origin.y + size)
  }
  const width = right - left,
    height = bottom - top
  if (!Number.isFinite(width) || !Number.isFinite(height)) return fitFirst()
  return workspaceViewport(fitViewport(canvas, width, height), { x: left, y: top })
}
