# Pen Point History and Endpoint Handles Specification

## Status

- Readiness: Ready for planning
- Blocking decisions: None
- Overview: [overview.md](overview.md)
- Source: Pen point history and endpoint-handle design interview. The [completed drawing mode specification](../_completed/drawing-mode-revision/spec.md) describes the baseline; this follow-up supersedes its finish-time history rules and adds a drag gesture to endpoint resumption. It does not revise the completed feature documents.

## Problem and intended outcome

Undo currently removes an entire Pen contour or extension at once. While drawing, authors need to undo a misplaced point and keep drawing from the restored endpoint. When resuming an open contour, they also need to set the direction of the next curve without bending the one they already drew.

## Scope

Included:

- Point-by-point document history in Shape + Pen and Node + Pen, with a provisional first point for any new contour.
- Undo and Redo behavior during a Pen session.
- Dragging an existing open endpoint in Node + Pen to save an independent handle for the next curve.

Non-goals:

- Saving lone points drawn with Pen, or migrating or rejecting existing one-node contours.
- Changing Shape/Node targeting rules, Node + Select interactions, contour joining, or endpoint disambiguation.
- Changing the document schema, SVG format, or autosave mechanism.

## Current behavior and evidence

Static source inspection only; no runtime verification was performed for this specification.

- [Pen](../../src/core/tools/penTool.ts) keeps placed points in a local draft and commits on finish or closure. A new contour with fewer than two points is discarded. Dragging an existing open endpoint currently resumes without changing its handles.
- [Shortcuts](../../src/hooks/use-shortcuts.ts) invoke document Undo and Redo. The [command layer](../../src/core/commands.ts) restores document and selection snapshots, but those snapshots do not capture Pen's local press or attachment state.
- [Pen targeting and assembly](../../src/core/tools/penTarget.ts) already distinguish head from tail. [Segment geometry](../../src/core/geometry/segments.ts) uses the source node's outgoing handle and destination node's incoming handle. The other handle at an open endpoint can be changed without altering its current segment.

## Requirements and invariants

- **R1 — A lone new point is provisional.** It is visible during drawing but must not appear in the document, exported SVG, autosave, or history. The second valid released point commits both as a single edit.
- **R2 — Released drawing edits are independently undoable.** After the initial pair, each valid point placement and contour closure is one document edit. On resuming an already committed contour, the first new point can commit immediately. Preview, unfinished presses, and finish actions do not themselves create history entries.
- **R3 — Undo preserves viable attachment.** While drawing, Undo keeps Pen attached to the same end of the restored contour if it still exists and is open. If the contour disappears or is no longer a valid destination, Pen returns to idle. History navigation must not let a late pointer release write against stale geometry.
- **R4 — Endpoint drag adjusts only the continuation by default.** On resuming an open endpoint in Node + Pen, a drag sets it to **Free**, changes only the handle used by the next segment, and commits on release as one edit even if no point follows. It does not move the anchor or change existing segments. During an active drag past the threshold, unmodified, non-repeating `M` opts into Free → Symmetric → Smooth → Free cycling. This may change the adjacent segment in the live preview; release saves the resulting mode and handles in the same single edit. A plain resume click does not write an edit.
- **R5 — Keep current mode and target boundaries.** Shape + Pen creates a separate shape; Node + Pen starts from exactly one selected shape and resumes or adds a contour within it. An active drawing session cannot silently retarget after a selection change or an invalidation.

## Behavior and contracts

| Action | Canvas and document result | History result |
| --- | --- | --- |
| Release the first point of a new contour | Show a provisional point, including any dragged handles; no committed contour yet. | No entry or Redo invalidation. |
| Release the second valid point | Create the shape in Shape + Pen, or append the contour inside the pinned shape in Node + Pen. Continue from the second point. | One edit for the pair. Undo removes both; Redo restores both. |
| Release another valid point on a committed open contour | Add one point at the active end, including its dragged handles, and update the preview from it. | One edit for that point. |
| Close the active contour | Close at the existing Pen close target without adding a duplicate anchor. | One edit, including any handle changes made by the existing fresh-contour closing gesture. |
| Press Enter or Esc, or leave the drawing context | End the session. Drop any unfinished press or lone provisional point. Keep everything already committed. | No additional edit. |
| Cancel the pointer press | Drop only that press; retain any previously released points or handle edits. | No edit. |

**Drawing and closure.** Preserve the existing snapping, drag threshold, click-for-corner and drag-for-curve gestures for new points. An ignored duplicate placement does not count toward the initial pair or add history. A newly drawn contour closes at its start; a resumed contour closes at its original opposite endpoint and preserves its existing segments. Neither action joins a different contour. In Node + Pen, an empty-canvas start still creates a disconnected contour within the single selected shape.

**History navigation.** For an attached Pen, a document Undo or Redo reconciles the session with the current document and preserves the drawing direction: head remains head, tail remains tail. Rebuild the preview from the restored endpoint; do not reuse a pre-history press or geometry snapshot. Undoing the initial pair returns Pen to idle with no provisional point. Redo that restores a closed contour ends attachment; Redo while idle restores the document without starting a Pen session. With only a provisional first point, Undo clears that point without moving either document history stack. An applied document Redo discards any provisional point. Cancel an unfinished press on history navigation and ignore its later release.

**Endpoint handle.** When starting from an existing open endpoint in Node + Pen, a normal click attaches with no edit. A drag past the Pen threshold previews a snapped continuation handle. Release commits the endpoint's Free mode and the handle, and leaves Pen attached. At the tail, write the outgoing handle; at the head, write the incoming handle. The other handle, anchor, existing curves, and unrelated geometry stay unchanged. A real handle edit remains committed after Enter, Esc, or a tool switch, and is available the next time the endpoint is resumed. Canceling or finishing during the press does not save it. An unchanged Free endpoint does not create a duplicate history entry.

## Ownership and boundaries

Pen owns provisional points, in-flight presses, preview, and live attachment; document history owns committed geometry and selection snapshots. History is not a replay of Pen gestures. The document remains the source of truth for the contour after each committed edit and history step. Keep each active destination pinned to its original shape and contour (or owning shape before contour creation); selection changes do not redirect it. If an external edit invalidates the session or press target, end the affected session safely without overwriting the newer geometry or creating a fallback shape. Committed releases participate in normal autosave; release does not imply a synchronous disk write.

## Acceptance criteria

| ID | Requirement(s) | Starting condition / action | Expected outcome | Verification approach |
| --- | --- | --- | --- | --- |
| AC1 | R1, R2 | In each Pen mode, place one point; separately try Enter, Esc, and a context switch before placing a second. Start with an available Redo branch in one trial. | A provisional marker is visible while drawing, then disappears. The point never enters the document snapshot that feeds SVG export and autosave; neither history stack changes. | Store/serialization and UI |
| AC2 | R1, R2, R5 | In each Pen mode, place two distinct points with a drag on one, then add a third and finish. | The first two points and their handles form one history edit, the third another, and finish adds none. Shape + Pen creates a separate shape; Node + Pen adds a contour inside its pinned shape. Undo/Redo move by those edits. | Tool/history |
| AC3 | R2, R5 | Resume an existing contour in Node + Pen; add one point, then close at the opposite end. Separately close a newly drawn contour at its start. | One new point on the resumed contour commits without waiting for a second. Closure creates a separate entry without a duplicate anchor; the resumed contour's prior segments remain unchanged. Undo closure reopens the contour. | Geometry/history |
| AC4 | R2, R3 | While drawing, undo a later point, then place a replacement; repeat when extending from the head and tail. Separately undo the initial pair and redo it. | The replacement goes at the restored end of the same contour. Undoing the pair leaves no ghost point or active contour; Redo restores the pair without restarting Pen. | Tool/history and UI |
| AC5 | R1, R3 | With earlier document history available, use Undo with only a provisional point. In a separate trial, navigate history during a held point press, then release. | Local Undo removes only the provisional point. The late release does not commit a point against the restored document. | Tool/history and UI |
| AC6 | R4 | In Node + Pen, drag and release without pressing `M` at each end of an existing curved path; press Esc without adding a point. Undo and Redo the handle edit, then resume the endpoint again. | On release the endpoint becomes Free and only the continuation handle changes. The current segments remain identical. Esc leaves the edit intact, Undo/Redo restore both mode and handle in one step, and the resumed preview uses the saved handle. | Geometry/history and UI |
| AC7 | R2, R4 | Plain-click an existing open endpoint; separately drag it and cancel or finish before release. Repeat an unchanged drag on an already-Free endpoint. | No new document edit in these cases. A plain click still attaches; normal cancellation discards only its press. | Tool/history |
| AC8 | R5 | Start on shape A in Node + Pen, then select B before the next valid release. Separately remove or invalidate A during a held press and release. | Selection changes alone do not redirect the edit. The invalidated press does not write to A or B, create another shape, or overwrite newer geometry. | Tool/history |
| AC9 | R3 | Redo a point during an attached session, then apply Redo of a closure in a separate trial. | Pen follows the restored open contour after point Redo. Closure Redo restores the closed geometry and leaves no open attachment. | Tool/history |

## Assumptions

These are defaults inferred from the interview, not additional user-approved decisions:

- Undo with only a provisional point is local and does not create draft Redo. Redo remains document history only; if applied from idle it restores geometry without reattaching. Validate both shortcuts in a browser with available document history.
- An invalidated target ends the session rather than trying to recover against unrelated changes. Verify removal and changed geometry between press and release.
- The endpoint-drag gesture applies when resuming an existing open endpoint, not as a new editing gesture on arbitrary anchors mid-draw.

## Risks and open decisions

- Blocking: None.
- Non-blocking: At the head, the future handle is the incoming one; visual direction and stored handle direction must agree. Verify both ends, including curved paths. Check that history during pointer capture cannot accept a late release and that a provisional point never leaks into exported or autosaved data.

## Deferred work

- No separate draft history stack or broader anchor-editing gestures in Pen.
