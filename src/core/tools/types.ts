import type { Command } from '../commands'
import type { PathShape, Pt } from '../model'
import type { SnapResult } from '../snap'

// Built by the host for each pointer event (see buildSnapFn). It already honors suspendSnap.
export type SnapFn = (pt: Pt) => SnapResult

export type ToolEvent = {
  pt: Pt // pointer position in document space
  zoom: number
  shift: boolean
  alt: boolean
  space: boolean // Space held: the shape being drawn moves instead of resizing
  suspendSnap: boolean // Cmd/Ctrl held: snapping is off for this event
  snap: SnapFn
}

// Plain data in document space. The UI layer decides how to draw each primitive.
export type OverlayPrimitive =
  | { kind: 'draft'; shape: PathShape }
  | { kind: 'snapPoint'; p: Pt } // an anchor target was hit
  | { kind: 'snapLine'; axis: 'x' | 'y'; value: number } // a straight target (edge, center or guide) was hit

// The store satisfies this structurally. Each tool commit is one dispatch, so it is one history entry.
export type ToolHost = {
  dispatch: (command: Command) => void
}

export interface Tool {
  readonly cursor: string
  pointerDown(e: ToolEvent): void
  pointerMove(e: ToolEvent): void
  pointerUp(e: ToolEvent): void
  pointerCancel(): void
  keyDown(key: string): void // 'Escape' cancels the draft without committing
  overlay(): OverlayPrimitive[]
}
