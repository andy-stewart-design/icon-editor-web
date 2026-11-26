# Multiple Artboards Specification

## Status

- Readiness: Ready for planning
- Blocking decisions: None
- Overview: [overview.md](overview.md)
- Source: Artboard design interview and its wrap-up. The user agreed to separate icons, Copy SVG targeting the selected board, cursor-based transfer, and direct board controls. The remaining first-release defaults are identified below.

## Problem and intended outcome

The editor gives icon designers one fixed drawing and export surface. To work on a set or compare size variants, they need to keep several icons visible in one workspace, arrange them without changing their SVGs, and copy any icon on its own.

## Scope

- Included: Board creation, naming, duplication, deletion, movement, and resizing; one active board; cross-board shape dragging; per-board SVG copy; undo and saved-document compatibility.
- Non-goals: A dedicated Artboard tool, batch export, linked variants, non-square boards, or export windows that frame shared artwork.

## Current behavior and evidence

The following is based on static source and test inspection, not a runtime trial.

- [Document model](../../src/core/model.ts) has one square size, one shape list, and document-wide stroke defaults. **New** resets the document; it does not add a surface.
- [Artboard properties](../../src/components/properties-panel/document-section/index.tsx) and [resize commands](../../src/core/commands/document.ts) support **Stay in place** and **Scale shapes**. Scaling changes path coordinates, not stroke widths. The canvas [content layer](../../src/components/canvas/content-layer/styles.module.css) shows artwork beyond the board bounds.
- [Copy SVG](../../src/components/copy-svg-button/index.tsx) serializes the whole document using a [zero-origin square viewBox](../../src/core/serialize/index.ts). The serializer emits full paths rather than cutting them at the board edge.
- [Shape Select](../../src/core/tools/selectTool.ts) picks shapes back to front. [Existing drag tests](../../src/core/tools/selectTool.test.ts) cover one undo entry for a drag and cancellation with Escape. [Persistence](../../src/core/persistence.ts) saves committed document changes, not in-progress gestures.

## Requirements and invariants

- **R1 — Independent boards.** One workspace holds one or more named, square boards. Each shape belongs to exactly one board, even when drawn beyond its bounds. A board's canvas position and name do not affect its exported SVG.
- **R2 — Direct board controls.** Users can add, rename, duplicate, delete, move, and resize boards without changing tools. Moving a board carries all its shapes, including visible overflow; duplication makes an independent copy; resizing affects only the target board.
- **R3 — Active board.** The editor indicates one active board. Normal drawing can start on any visible board without a separate mode switch, and new artwork belongs to the board on which the drawing gesture starts.
- **R4 — Shape transfer.** A completed Shape Select drag moves its selected shapes to another board only if that board is the target at release. The editor previews the target and preserves the shapes' final canvas position through the transfer.
- **R5 — Copy SVG.** Copy SVG emits one standalone SVG for the active board, regardless of shape or node selection. Only shapes that board owns are included.
- **R6 — History and compatibility.** Board edits are undoable and redoable. A shape move and its transfer form one history entry. All boards and their ownership survive reload, and legacy single-board documents open without changing their SVG output.

## Behavior and contracts

**Board controls (R1–R2).** Use a distinct **Add Artboard** action; **New** retains its whole-document meaning and starts a fresh workspace with one board. Add creates an empty 24 × 24 board; Duplicate copies the board's size, shape order, artwork and styling. Both actions supply an initial name that can be edited. Add and Duplicate put the new board in free space near the active board and make it active. Drag the name label to move a board, including any shapes that extend beyond it. A size control retains the current 8–256 integer size range and both resize modes: **Stay in place** preserves positions relative to the board's origin, and **Scale shapes** scales coordinates around that origin without scaling stroke widths. Invalid sizes leave the board unchanged. Deleting a board removes its owned shapes; Undo recovers both. If the active board is deleted, another surviving board becomes active. The last board cannot be deleted.

**Activation and editing (R3).** Clicking a board label or its empty interior activates it. Picking an existing shape activates its owning board, even when the shape overflows. For new drawing gestures, the board under the start point is the target (topmost if stacked); if the start point is outside all boards, the active board remains the target. Crossing an edge mid-gesture does not retarget creation. Shape and node selections belong to one board at a time; switching boards clears selections from the prior board. A selection marquee targets only the board where it starts, or the active board if started outside all boards. Grid, keylines, and drawing snap are aligned to the active board and continue to use the existing editor settings. **Fit** frames the active board, not its overflow or the entire workspace.

**Shape drops (R4).** Use the cursor at release, not the shape's bounds, center, or overlap. Use the same board stacking order for rendering and determining the destination. Highlight a different receiving board while it is the target; remove the cue when there is no transfer target or the drag ends.

| Release or cancellation | Result |
| --- | --- |
| The cursor is over no board, or the source is the topmost board under it | The shapes move but remain with the source. |
| Another board is topmost under the cursor, even if the source also contains the cursor | Transfer all dragged shapes to that board, retaining their relative stacking order and final canvas placement. Make the destination active and keep the transferred shapes selected. |
| The drag is canceled, including with Escape | Restore the starting placement and ownership; do not add a history entry or save the preview. |

Only dragging whole shapes triggers transfer. Drawing, moving an individual node, and moving or resizing a board do not reassign artwork even when they create overlap. Transfer must not apply a second snap that shifts the shapes from the previewed position.

**Copy and restore (R5–R6).** Export uses the active board's dimensions and a `0 0 size size` viewBox. It writes full owned paths in stacking order, including geometry outside the board; it does not crop paths or add special clipping or overflow markup. Location, board name, guides, and other boards are not exported. Undo and redo restore board layout, content, and ownership as applicable, and always leave a valid active board. Save committed edits, not drag previews. On opening a legacy document, preserve its size, shape order, coordinates, and stroke defaults on one board at the workspace origin. A restored workspace opens with a valid active board; undo history need not survive reload.

## Ownership and boundaries

The saved document owns board identity, names, sizes, canvas placements, shape ownership, and the existing shared stroke defaults. Names are labels, not identifiers. Active board, selection, viewport, and hover previews are editor state, not artwork. Each board has its own export origin regardless of how positions are stored. Ownership governs export; neither the viewport nor geometric overlap assigns paths to an SVG.

## Acceptance criteria

| ID | Requirements | Starting condition / action | Expected outcome | Verification approach |
| --- | --- | --- | --- | --- |
| AC1 | R1, R2, R3 | Start with one populated board. Add a board, then duplicate and rename the populated board. Edit the duplicate. | Add produces an empty active board; Duplicate produces a populated active board of the same size and appearance in free space. Renaming and editing the duplicate do not alter the original. | Core and UI |
| AC2 | R1, R2, R5, R6 | Copy a board that owns an overflowing shape, then drag its label over a different board and copy again. Undo and redo. | The moved board and all its shapes, including visible overflow, translate together; no shape changes owners. The other board is unchanged, both copies match, and one undo or redo reverses or reapplies the board move. | Core and UI |
| AC3 | R1, R2 | Resize a populated board in each resize mode while another board is present. Also try an out-of-range or fractional size. | **Stay in place** preserves board-relative path coordinates; **Scale shapes** scales them but not stroke widths. The other board is unchanged, and invalid input does not resize either board. | Core and UI |
| AC4 | R2, R3, R6 | Delete the active board in a two-board workspace, undo, and redo. Try to delete the only remaining board. Separately, invoke **New** and confirm the reset. | Delete removes only that board and its owned shapes, leaves a valid active board, and is reversible. The last board cannot be deleted. **New** replaces the workspace with one empty board rather than adding one. | Core and UI |
| AC5 | R3, R5 | With two boards in different positions, pick an overflowing shape, click the other board and invoke Fit and Copy SVG, then draw on the first without switching tools. Start another drawing gesture on blank space and drag across a board edge. Start a selection marquee inside one board and extend it over both. | Picking activates the shape's owner, and clicking the other board changes the active indicator, guides and Fit target. Copy follows activation rather than shape selection. Drawing uses the start board, or the prior active board for a blank-space start, and does not retarget mid-gesture. A marquee spanning two boards selects only shapes owned by its start board. | UI |
| AC6 | R1, R4, R6 | Drag multiple shapes across a second board; first drop on blank space, then repeat and drop on the second board. Repeat with Escape before release. | Blank-space drop keeps source ownership. A transfer drop matches the highlighted target, has no positional jump, preserves relative stacking order, and makes the destination active with the shapes still selected. One undo/redo reverses or reapplies both the move and transfer. Escape restores the starting state without a history entry. | Core and UI |
| AC7 | R1, R4 | Release a shape where the source and destination boards overlap; repeat with the other board on top. Also move a node across a board edge. | Only the topmost board determines the transfer and preview: source on top means no transfer; destination on top means transfer. Node editing does not transfer ownership. | Core and UI |
| AC8 | R1, R5 | Arrange two differently sized boards so that an owned path from each extends over the other board. Copy each board, including one case with only a subset of shapes selected. | Each SVG has its own dimensions and zero-origin viewBox, contains all and only its owned paths in order, and keeps full path geometry. No other board's paths or board metadata are included. | Serializer and UI |
| AC9 | R6 | Open a saved single-board document and copy its SVG. Add, rename, move and resize boards; transfer artwork; reload after the changes are saved. Separately, interrupt a drag by reloading before release. | The legacy SVG matches its previous output, including overflow and styling. Reload restores committed names, positions, dimensions, and shape ownership, with a valid active board. The interrupted drag is not restored. | Persistence fixtures and browser reload |

## Assumptions

- Square boards, independent duplicates, and the create/rename/duplicate/delete scope carry forward from the interview wrap-up as first-release defaults. Keep document-wide stroke defaults; variants differ through their sizes and artwork rather than separate style settings.
- Defaults such as nearby placement, a 24 × 24 empty board, one-board selections, active-board Fit, and the last-board guard are inferred, not explicit user choices. Validate their usefulness by creating and editing a small icon set and a pair of size variants.
- Destination highlighting, topmost overlap precedence, and atomic undo carry forward from the interview's proposed drop behavior. Validate the overlap rule in a canvas prototype before polishing the interaction.

## Risks and open decisions

- Blocking: None.
- Non-blocking: When the cursor is near an edge or far from a dragged shape's center, the highlighted target is more important than the shape's visual overlap. Test with offset grabs, overlapping boards and zoomed views.
- Non-blocking: SVG consumers can show or clip overflow differently. Preserve the existing exported geometry and viewBox rather than promising that every consumer displays overflow the same way.

## Deferred work

Batch export, linked variants, rectangular boards, an Artboard tool, and multi-board selection or arrangement. Revisit if use with larger icon sets shows that single-board controls or copy are too slow.
