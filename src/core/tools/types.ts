import type { Command } from '../commands'
import type { Rect } from '../geometry/bounds'
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
  | { kind: 'hover'; shapeId: string } // Select tool: the shape under the pointer, when no gesture is active
  | { kind: 'marquee'; rect: Rect } // Select tool: the marquee being dragged, in doc units
  | { kind: 'anchor'; p: Pt } // Pen tool: a placed node, drawn at a constant screen size
  | { kind: 'handle'; from: Pt; to: Pt } // a node's handle: a line from the anchor and a dot at the handle
  | { kind: 'closeTarget'; p: Pt } // Pen tool: ring on the first node while a click would close the path

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
  // 'Escape' cancels the draft without committing, except the Pen tool, which finishes its path. 'Enter' is sent to every tool.
  keyDown(key: string): void
  overlay(): OverlayPrimitive[]
  // Plain pointer moves with no button held. The host calls it only when the method exists (Select and Pen use it).
  hover?(e: ToolEvent): void
  // Called when the host replaces the tool (another tool is selected or the tool is torn down). Tools with work to
  // commit do it here. Other tools leave it out.
  deactivate?(): void
}
