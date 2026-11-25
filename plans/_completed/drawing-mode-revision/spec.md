# Drawing Mode Revision Specification

## Status

- Readiness: Ready for planning
- Blocking decisions: None
- Overview: [overview.md](overview.md)
- Source: Drawing modes design interview and scope wrap-up

## Problem and intended outcome

Icon authors can draw an open contour and later edit its nodes, but the editor cannot resume drawing from either endpoint once the contour is committed. Drawing over an existing path also needs two distinct meanings: create a separate shape, or add geometry to the shape being edited. The user should choose that meaning explicitly, not have hover decide it.

## Scope

Included:

- Separate the Shape/Node editing mode from the Select/Pen action.
- In Node + Pen, resume an open contour or add a disconnected contour to the same selected shape.
- Preserve familiar Pen gestures, finish behavior, and a single undoable edit per finished operation.

Non-goals:

- Per-point drawing history or undo/redo within a live draft.
- Joining two existing contours, whether in one shape or across shapes.
- New SVG formats, fill rules, or node-mode variants of Line, Rect, or Ellipse.

## Current behavior and evidence

Static source and test inspection only; no runtime verification was performed.

- [Store](../../src/core/store.ts), [toolbar](../../src/components/toolbar/index.tsx), and [shortcuts](../../src/hooks/use-shortcuts.ts) currently represent Select, Node, Pen, Line, Rect, and Ellipse as mutually exclusive tools. [Node](../../src/core/tools/nodeTool.ts) can edit anchors and insert nodes on segments; it cannot resume drawing.
- [Pen](../../src/core/tools/penTool.ts) holds a draft locally and creates a new shape on finish. Enter, Escape, and deactivation finish an open draft; clicking its first anchor can close it. [Existing Pen tests](../../src/core/tools/penTool.test.ts) cover these gestures and short-draft handling.
- The [path model](../../src/core/model.ts) and [serializer](../../src/core/serialize/index.ts) already support multiple subpaths in one shape: one SVG `<path>`, with an `M` for each nonempty contour and a `Z` for each closed one. Adding a disconnected contour does not require a schema or SVG format change.

## Requirements and invariants

- **R1 — Mode and tool are independent.** The editor exposes and indicates Shape or Node mode separately from Select or Pen. `V` and `P` choose the tool without changing the mode. Hover can identify a target but never changes the active mode or tool.
- **R2 — Shape + Pen only creates.** Drawing produces a separate shape, even when starting over an existing path or its endpoint. Existing shapes are never changed by this action.
- **R3 — Node + Pen only edits its target.** With one selected shape, starting on an open endpoint resumes its contour; starting elsewhere creates a disconnected contour in that same shape. A draft cannot create a separate shape, retarget to another shape, or join existing contours.
- **R4 — Selection and primitive creation keep their roles.** Select acts on shapes in Shape mode and on nodes in Node mode. Line, Rect, and Ellipse still create independent shapes.
- **R5 — Finish and history stay predictable.** Enter, Escape, or switching away from the active drawing context finish the draft, not cancel it. A finished drawing change is one undoable edit. No-op or invalid drafts produce no document or history change.
- **R6 — Preserve existing geometry outside the edit.** A Node + Pen edit preserves the target shape’s identity, style, and stacking position, every existing segment of the edited contour, and all unrelated contours and shapes.

## Behavior and contracts

| Mode | Select | Pen |
| --- | --- | --- |
| Shape | Select and manipulate whole shapes. | Start a new shape without targeting existing paths. |
| Node | Select and edit nodes with the existing Node interactions. | Extend an open contour or add a disconnected contour to the selected shape. |

**Controls.** Default to Shape + Select. The mode control preserves Select or Pen when switching between Shape and Node. For v1, keep `A` as direct entry to Node + Select; keep the existing Enter mode toggle where eligible in Select and the idle Escape exit from Node + Select. In Pen, Enter and Escape finish without also switching mode. Choosing Line, Rect, or Ellipse by shortcut or toolbar enters Shape mode. Node + Pen must make eligible endpoints discoverable and distinguish an endpoint-resume hover from a new-contour hover. It must not dispatch Node + Select actions such as segment insertion.

**Starting Node + Pen.** Require exactly one selected shape. With no shape or multiple shapes selected, canvas presses do not start a draft or change geometry. An eligible endpoint is either end of an open contour in the selected shape; closed contours, interior nodes, segments, and other shapes are not resume targets. Starting anywhere other than an eligible endpoint places the first point of a new contour. Resuming alone does not move or restyle the existing endpoint.

**While drawing.** After starting, subsequent presses add points to the same contour, not additional `M` commands. Preserve current Pen snapping, click-for-corner and drag-for-curve behavior for new points, and closure at the starting anchor for newly drawn contours. A resumed contour grows from the clicked end without reversing or altering existing segments. The closure target for a resumed contour is its original opposite endpoint; clicking it closes that contour without duplicating the endpoint. Other contours’ endpoints do not join or retarget the draft.

**Finishing.** Enter, Escape, or leaving the drawing context finish using placed points, not an unfinished press. Changing modes while remaining on Pen finishes in the old mode before subsequent drawing uses the new one. A new contour needs at least two placed points; resuming and finishing without extending or closing is a no-op. A pointer cancellation drops the current press without discarding previously placed points. On a successful Node + Pen finish the target remains the selected shape; the result is still one SVG path for that shape, whether it gained segments, a `Z`, or an additional `M`.

## Ownership and boundaries

The editor owns the editing mode and active tool. Pen owns the live draft and fixes its destination when drawing starts: a new shape, an existing shape, or a specific contour within that shape. Subsequent selection changes must not redirect the draft. If the target is gone or its geometry changed before finish, discard the draft rather than overwrite the new geometry or create a new shape. Only the finished edit enters document history. Canvas rendering and SVG export continue using the existing path model.

## Acceptance criteria

| ID | Requirement(s) | Starting condition / action | Expected outcome | Verification approach |
| --- | --- | --- | --- | --- |
| AC1 | R1, R4 | Start a fresh editor; select a path, enter Node mode, and press `P`, then `V`. Exercise the Select-mode Enter toggle and idle Node + Select Escape. | The editor starts in Shape + Select; the toolbar indicates both mode and tool; `P` and `V` preserve Node mode, and the Select-mode toggles still work. | UI |
| AC2 | R1, R2 | In Shape + Pen, start on an existing open endpoint, add a point, and finish. | No hover-triggered mode change; a distinct, selected shape is added and the original path is unchanged. | Tool test and UI |
| AC3 | R1, R3, R6 | In Node + Pen with one selected curved open path, hover and extend from each end in separate trials. | The hover cue identifies a resume target without changing tool. Finishing adds segments at the clicked end, preserving the existing curve and the shape’s identity, styling, and stacking position. | Geometry/tool test and UI |
| AC4 | R3, R6 | In Node + Pen with one selected shape, start away from an eligible endpoint, add another point, and finish. | The result still has the same shape count and a single SVG path for the target; its `d` contains the unchanged original contour and the new disconnected contour starting with another `M`. | Tool/serialization test and UI |
| AC5 | R3 | Try to begin in Node + Pen with zero or multiple selected shapes; then try with one selected shape containing an interior node, a closed contour, or another contour near the pointer. | With zero or multiple selections, no draft or geometry edit starts. Interior and closed-contour nodes are not resume targets, and an active draft cannot join to or switch to another contour. | Tool test |
| AC6 | R3, R5, R6 | Close a new contour at its start; separately, resume an existing open contour and click its opposite endpoint. | Each closes only its own contour and emits `Z`; closing the resumed contour does not modify its original segments or duplicate its endpoint. | Geometry/tool test |
| AC7 | R1, R5 | With a valid draft, finish via Enter, Escape, a tool switch, or a mode switch in separate trials. Cancel an unfinished press during a draft. | Each finish records one edit under the original rules; Enter/Escape do not toggle mode in Pen. A canceled press contributes no point and leaves placed points available to finish. | Tool test and UI |
| AC8 | R3, R5 | Finish a one-point new contour or an untouched resumption. Separately, finish after removing or changing the target geometry mid-draft. Then undo and redo a valid finished extension or disconnected contour. | No-op and invalid drafts leave history and the document unchanged by the draft. One Undo restores the pre-drawing geometry and one Redo restores the whole edit. | Tool/history test |
| AC9 | R4 | Move a shape with Shape + Select and a node with Node + Select. From Node mode choose each primitive tool and draw. | Selection gestures retain their respective behavior. Choosing a primitive switches to Shape mode; drawing creates and selects a distinct shape rather than modifying the previously selected path. | UI |
| AC10 | R3, R5, R6 | Start a Node + Pen contour on shape A; place a snapped corner by clicking and a curved point by dragging. Change selection to shape B without changing A or leaving the drawing context, then finish. | The snapped corner and curve are added to A in one edit. A is selected on finish; B is unchanged. | Tool/history test |

## Assumptions

These are v1 defaults from the wrap-up or parity-based inferences, not separately approved product decisions:

- Exactly one selected shape is required for Node + Pen. Validate the disabled/no-target affordance in a UI walkthrough.
- Keep the existing shortcuts where they fit the two-axis model, and keep primitives in Shape mode. Validate discoverability in the toolbar and shortcut walkthrough.
- A resumed contour can close at the opposite endpoint; no other join is implied. When eligible endpoints overlap, the hover cue and press must resolve to the same target; no dedicated disambiguation UI is assumed.
- One history entry per finished edit preserves the current Pen granularity until per-point history is designed.

## Risks and open decisions

- Blocking: None.
- Non-blocking: Extending from the first endpoint changes which direction the Pen adds geometry; test curved endpoints at both ends to catch flipped handles or changes to existing segments. Overlapping endpoints may be hard to distinguish visually; check the hover cue against the actual click target.

## Deferred work

- Per-point drawing history, including undo/redo before finishing a contour.
- Joining two existing contours and a disambiguation control if overlapping endpoints prove difficult to target.
