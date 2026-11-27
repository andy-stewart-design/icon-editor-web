# Multiple Artboards Implementation Plan

## Governing source

- Governing spec: [spec.md](spec.md)
- Feature orientation: [overview.md](overview.md)

This plan is an execution contract. A checked box records work performed, not acceptance, approval, merge, or release. In supervised execution, manual approvals remain in extension state.

## Execution constraints

- Paths and commands are relative to the `icon-editor-web` repository root. Follow [AGENTS.md](../../AGENTS.md). Preserve unrelated work; no new packages or test harness are needed. Do not run `pnpm dev` without asking first.
- Freeze scope, steps, IDs, dependencies, expected files, verification definitions, gates, and acceptance mappings during routine execution. Change only task boxes. Escalate material conflicts before affected work; if the user agrees to a plan change, record what changed, why, and the actual agreement in `evidence/changes.md`.
- Check a verification task only when its checks and completion gate pass and evidence is recorded. Keep skipped, failed, blocked, and waived checks unchecked; record the reason, any known approval owner, and follow-up in the named evidence note. Keep notes to a few bullets or sentences with the check, outcome, and material caveats. No empty notes or plan status fields.
- The last recorded `pnpm check`, `pnpm lint`, and `pnpm format` passes were during the interview. There is no current test, build, or browser baseline; establish the automated baseline in Phase 0. No known blocker from static review.
- Existing `pnpm test <paths>` runs Vitest in Node. After Step 1.2, give the user a short checklist for testing through the normal app controls in their usual browser. No browser automation, special profiles, fixture seeding, or DevTools setup. Leave browser-dependent verification unchecked until the user reports results. Step 1.2's completed checks remain historical evidence.

## Phase overview and delivery boundary

| Phase | Outcome | Dependencies | Exit gate |
| --- | --- | --- | --- |
| 0 | Pin v1 export and restore behavior | Existing dependencies and local checkout | Current automated baseline and fixed legacy fixture |
| 1 | Versioned workspace, active-board editing and Copy SVG | Phase 0 gate | Model-to-browser fixture proof, including legacy parity |
| 2 | Board management, label movement and resizing | Phase 1 gate | Arrange and edit an icon set through normal controls |
| 3 | Cursor-based shape transfers and final acceptance | Phase 2 gate | Automated regression and complete browser workflow |

Delivery boundary: one feature-complete PR. Steps are review slices, not separate release units. **Atomic group:** Step 1.2 changes the document version, reader, writer, and existing consumers together. Do not merge, run against real saved data, or roll back only part of that group. Step 3.1 likewise puts ownership changes and undo in the same transaction, not a follow-up fix.

## Phase 0 — Lock the legacy baseline

Outcome: A fixed v1 record and expected SVG that do not depend on the new model factory or serializer.
Depends on: Local dependencies and existing test scripts.
Review boundary: Characterization only; no behavior or production changes.

### Step 0.1 — Characterize v1 restore and export

Requirements / acceptance: R6; AC9 (v1 baseline only; 1.2 proves migration, Phase 3 proves browser reload).
Depends on: None.
Review boundary: Legacy data and its existing SVG output.

Expected files:

- `src/core/test-fixtures/legacy-icon-doc.ts` — new literal v1 record and fixed expected SVG, reusable in tests and copyable into a browser fixture.
- `src/core/persistence.test.ts`, `src/core/serialize/index.test.ts` — existing fake storage and SVG assertions.

Tasks:

- [x] Characterize the legacy record with a non-default size, ordered paths, negative or overflowing coordinates, a curve with handles, and both inherited and overridden stroke styling. Pin the exact SVG from the v1 implementation, not output computed at test time from the migrated fixture.
- [x] Assert that the existing loader restores the literal record and Copy's serializer produces that expected SVG without cropping or reordering paths.
- [x] Satisfy verification and the completion gate, and record concise evidence.

Verification: Run `pnpm test src/core/persistence.test.ts src/core/serialize/index.test.ts`. The seeded `current` entry resolves to the expected document and the SVG matches exactly. Browser proof is not part of this characterization.

Completion gate: The portable fixture and pinned SVG pass against v1 as-is. Evidence: [evidence/step-0.1.md](evidence/step-0.1.md).

Phase exit gate: Run `pnpm test`, `pnpm check`, `pnpm lint`, and `pnpm format:check`. Require the fixed fixture and existing suite to pass; keep pre-existing failures separate from regressions and escalate a failed baseline before dependent work. Record in [step 0.1 evidence](evidence/step-0.1.md).

## Phase 1 — Switch to a board-owned workspace

Outcome: A valid workspace can restore, render, edit, and copy multiple boards, including boards at nonzero origins. A migrated single board still works as before.
Depends on: Phase 0 gate.
Review boundary: Model, persistence, and existing editing/export consumers. No board-management controls or drag transfer yet; use seeded documents for multi-board checks.

### Step 1.1 — Separate SVG content from document placement

Requirements / acceptance: R1, R5; AC8 and AC9 (serializer seam and legacy parity only; 1.2 wires active-board routing, Phase 3 verifies full reload).
Depends on: Phase 0 gate.
Review boundary: Serializer and its current consumers, without a storage format change.

Expected files:

- `src/core/serialize/{index.ts,index.test.ts}` — explicit board-sized SVG input and shared path/attribute output.
- `src/components/{canvas/content-layer,copy-svg-button}/index.tsx`, `src/platform/dev-tools.ts` — display, clipboard and development helper callers if their signatures change.

Tasks:

- [x] Give SVG serialization a narrow input: size, ordered paths, and shared stroke defaults. Keep board name, origin, selection, and workspace layout out of the standalone SVG input.
- [x] Point existing consumers at the narrow boundary without changing what the single-board editor displays or copies. Keep editor overflow presentation separate from export markup.
- [x] Extend serializer tests for two independent SVG inputs with different sizes and overlapping local geometry; keep the pinned v1 SVG assertion.
- [x] Satisfy verification and the completion gate, and record concise evidence.

Verification: Run `pnpm test src/core/serialize/index.test.ts` and `pnpm check`. Each size and path list serializes independently with full path geometry, no layout metadata, and unchanged v1 markup; affected callers type-check. No browser check is needed for this input-only refactor.

Completion gate: Display, Copy, and the dev helper still have a working serializer; the existing writer still writes v1. Evidence: [evidence/step-1.1.md](evidence/step-1.1.md).

### Step 1.2 — Adopt workspace storage and route existing editing by board

Requirements / acceptance: R1, R3, R5, R6; AC5 and AC8 (full, using a seeded workspace); AC9 (migration and round-trip portions; Phase 3 proves browser reload after management and transfer).
Depends on: Step 1.1.
Review boundary: Atomic schema/read/write/consumer cut. Existing tools and Copy work on seeded boards; management and cross-board transfer are not part of this cut.

Expected files:

- `src/core/{model,store,history,persistence,viewport}.ts`, `src/platform/{persistence,dev-tools}.ts` — workspace schema, validation, active/selection reconciliation, view coordinates, and storage/helper callers. Keep the IndexedDB store and key layout.
- `src/core/commands/{arrange,clipboard,document,nodes,selection,style,transform}.ts`, `src/core/geometry/transform.ts` — board-local commands and shared-style exceptions; `src/core/tools/` — existing tool context, shape and node picking, snap, and Pen/session routing.
- `src/hooks/{use-tool-input,use-shortcuts}.ts`, `src/components/canvas/`, `src/components/{toolbar,copy-svg-button,properties-panel/document-section}/index.tsx` — board-aware input, all-board rendering and overlays, Fit, resize field and Copy callers.
- `src/core/{model,history,persistence}.test.ts`, `src/core/serialize/index.test.ts`, existing tests in `src/core/{commands,tools,geometry}/`, `src/hooks/use-shortcuts.test.ts`, and new `src/core/test-fixtures/artboard-workspace.ts` — migrated consumers and a reusable populated workspace fixture.

Tasks:

- [x] Store ordered boards with stable IDs, names, square sizes, finite workspace origins, and owned board-local shape lists. Keep shared stroke defaults on the document and the active board out of the saved schema. Convert valid v1 to one stable board at the origin, preserving document/artwork IDs, style, order, and coordinates. Keep the legacy parser's positive finite size compatibility separate from the stricter resize field, including when a migrated record is later saved and read.
- [x] Switch restore and save with their callers. Do not overwrite a valid v1 record merely by opening it; subsequent committed saves use the new schema. Preserve recovery for malformed and future records, backup-key collision handling, and save ordering. Reconcile active board and selection on load, replacement, undo, and redo; route mutation to the owner, except for intentionally shared defaults.
- [x] Render all boards and overflow in the same order used for hits, and distinguish the active board. Keep world-to-board projection consistent for tools, overlays, guides, snap, and Fit/0. Route shape picks to the painted shape's owner, new drawing and marquee to the start interior or active board, and pin drawing/attachment to the correct board for the lifetime of the gesture or Pen draft.
- [x] Change Copy and the dev helper to pass only the active board's local SVG input. Replace old root `size` and `shapes` reads in existing consumers and tests in the same cut; do not leave writable aliases or lose non-active data in a single-board projection.
- [x] Add coverage for v1 exact SVG, valid workspace round-trip, invalid/future data recovery and preserved backups, committed-only saves, valid selection restoration, translated board input, and route/ownership cases. Seed two differently sized nonzero-position boards with overflowing strokes that do not completely hide either board.
- [x] Satisfy verification and the completion gate, and record concise evidence.

Verification:

- Automated: Run `pnpm check` and `pnpm test src/core/model.test.ts src/core/history.test.ts src/core/persistence.test.ts src/core/serialize/index.test.ts src/core/commands src/core/tools src/core/geometry src/hooks/use-shortcuts.test.ts`. The old fixture matches its exact SVG, uncommon valid legacy sizes survive re-save, valid v2 round-trips, unreadable records are recoverable without overwriting the original, and edits/undo preserve other boards. Cover shape or node hit coordinates, drawing ownership, short-lived previews, and an in-progress Pen path that must not silently change owners.
- Manual: In preview, seed the workspace fixture. Verify AC5 by picking overflow, clicking empty board space, using Fit (button and `0`), drawing on either board without switching tools to activate it, starting a gesture in blank space, crossing an edge mid-gesture, and using a marquee across both boards. Check drawing snap against the active origin. Verify AC8 by copying each board while some paths are selected: each SVG contains its own size and full paths only. Seed the raw v1 fixture separately; confirm it opens with the pinned SVG.

Completion gate: New and migrated data share one working reader/writer and consumer path, with every board visible and edits and copies correctly scoped. No production consumer requires the old root shape list. Evidence: [evidence/step-1.2.md](evidence/step-1.2.md).

Phase exit gate: After the focused gate, run `pnpm test`, `pnpm check`, `pnpm lint`, and `pnpm build`. Audit remaining v1 references in source: only compatibility, fixtures, and their verification should rely on the old schema. Require the seeded-browser and legacy Copy checks from the same build before advancing. Record in [step 1.2 evidence](evidence/step-1.2.md).

## Phase 2 — Manage boards directly

Outcome: Users can create, organize and resize an icon set without seeding a document or switching tools.
Depends on: Phase 1 gate.
Review boundary: Board commands and normal UI controls. Dragging a label moves the board; shape ownership does not yet change when dragging across boards.

### Step 2.1 — Add, rename, duplicate, and delete boards

Requirements / acceptance: R1, R2, R3, R6; AC1 and AC4.
Depends on: Phase 1 gate.
Review boundary: Board lifecycle, active-board fallback, and whole-workspace New.

Expected files:

- `src/core/commands/artboards.ts` and `src/core/commands/artboards.test.ts` — new lifecycle commands and focused tests.
- `src/core/{store,history,history.test}.ts`, `src/core/commands/document.ts` — lifecycle transactions, activation, and New.
- `src/components/{toolbar,properties-panel/document-section}/` — Add and active-board management controls and their styles.

Tasks:

- [ ] Add an empty named 24 × 24 board or duplicate the target with fresh identities and independent artwork. Place either in free space near the active board, then activate it. Keep **New** as a separate confirmed reset to one board.
- [ ] Wire Rename and Delete without a dedicated tool. Keep at least one board; otherwise remove only the target and its owned artwork, choose a valid active board, and make all lifecycle edits reversible.
- [ ] Test independent copies, free placement, active fallback, last-board protection, and deletion/restoration of owned overflow.
- [ ] Satisfy verification and the completion gate, and record concise evidence.

Verification:

- Automated: Run `pnpm test src/core/commands/artboards.test.ts src/core/history.test.ts` and `pnpm check`. Creation and duplication do not change the source SVG, duplicate editing is independent, and deletion and history preserve ownership and a valid active board.
- Manual: From a populated single board in the app, Add, Duplicate, rename and edit the copy. Delete active, undo and redo; return to one board and attempt deletion. Use **New** and confirm it resets the workspace instead of adding a board.

Completion gate: AC1 and AC4 can be demonstrated from app controls alone. Evidence: [evidence/step-2.1.md](evidence/step-2.1.md).

### Step 2.2 — Move boards by their labels and resize the active board

Requirements / acceptance: R1, R2, R5, R6; AC2 and AC3.
Depends on: Step 2.1.
Review boundary: Placement and sizing independently of shape transfer.

Expected files:

- `src/core/commands/{artboards,artboards.test,document,document-style.test}.ts`, `src/core/{validation,history.test}.ts`, `src/core/geometry/transform.ts` — move transaction and targeted resize behavior.
- `src/components/canvas/` (including new `artboard-labels/` if separated), `src/hooks/use-tool-input.ts`, `src/components/properties-panel/document-section/` — pointer handling, label presentation, and size field.

Tasks:

- [ ] Give the board label its own hit region. Click activates it; drag changes only its workspace origin, including when artwork overflows or the board ends on top of another. Keep label gestures out of shape drawing and commit one undoable move; canceled movement leaves the original layout.
- [ ] Apply the existing **Stay in place** and **Scale shapes** choices to the active board only. Retain integer 8–256 field validation and do not scale stroke widths. Keep guides and artwork aligned through moves and resizing.
- [ ] Test that the moved board exports identical SVG, neither move nor resize reassigns ownership, and invalid size input leaves both boards unchanged.
- [ ] Satisfy verification and the completion gate, and record concise evidence.

Verification:

- Automated: Run `pnpm test src/core/commands/artboards.test.ts src/core/commands/document-style.test.ts src/core/history.test.ts src/core/validation.test.ts` and `pnpm check`. Verify board origin, local coordinates, unchanged other board, export parity, history and field validation.
- Manual: In the app, copy a board with visible overflow, drag its label over another board, copy again, then undo/redo the move. Repeat a move while zoomed. Resize in both modes with another board visible; try an out-of-range and fractional value. Observe rendered paths, stroke widths, and active-board guides in each case.

Completion gate: AC2 and AC3 pass, and moving a board cannot be mistaken for moving or transferring a shape. Evidence: [evidence/step-2.2.md](evidence/step-2.2.md).

Phase exit gate: Run `pnpm check`, `pnpm lint`, `pnpm test src/core/commands src/core/history.test.ts src/core/serialize/index.test.ts`, and `pnpm build`. In the app, create a small set and a size variant, then move, resize, and copy the original and variant independently; a board move must not change either SVG. Record in [step 2.2 evidence](evidence/step-2.2.md).

## Phase 3 — Transfer artwork and verify the full workflow

Outcome: A shape drop transfers only when the actual cursor targets another board, with predictable preview, undo, and recovery.
Depends on: Phase 2 gate.
Review boundary: Whole-shape translation, its destination cue, and final acceptance. No batch export or multi-board selection.

### Step 3.1 — Transfer on release, preserving final placement

Requirements / acceptance: R1, R4, R6; AC6 and AC7; AC9 (transfer persistence and canceled preview at the Phase 3 gate).
Depends on: Phase 2 gate.
Review boundary: Shape Select translation and transfer, not rotations, resize handles, node edits, drawing, or label drags.

Expected files:

- `src/core/tools/{selectTool,selectTool.test,types}.ts`, `src/core/commands/{artboards,artboards.test}.ts`, `src/core/{store,history,history.test,persistence.test}.ts` — raw candidate lookup, geometry rebase, selection and one committed edit.
- `src/hooks/use-tool-input.ts`, `src/components/canvas/{index.tsx,tool-overlay/}` and the board presentation styles — hover cue and pointer lifecycle.

Tasks:

- [ ] Resolve a destination from the raw workspace cursor and rendered board stack. Use the same lookup for preview and release, counting the source board in the topmost test. Clear the cue on exit, cancellation or release; do not activate the hovered board before a successful transfer.
- [ ] Keep the drag in its source context until release. If the topmost target differs, apply the final translation and rebase anchors and handles into target-local coordinates without resnapping. Retain shape IDs and relative draw order, select the moved group in the active destination, and commit the move and ownership together.
- [ ] Treat blank space and source-topmost drops as moves only. Handle Escape and pointer termination without stale cues or double commits. Leave all non-translation edits out of the transfer path.
- [ ] Extend tests for offset grabs, blank space, both overlap orders, translation without a jump, a multi-shape group, history, and canceled previews not reaching the committed snapshot.
- [ ] Satisfy verification and the completion gate, and record concise evidence.

Verification:

- Automated: Run `pnpm test src/core/tools/selectTool.test.ts src/core/tools/nodeTool.test.ts src/core/commands/artboards.test.ts src/core/history.test.ts src/core/persistence.test.ts` and `pnpm check`. The raw pointer decides the result even when geometry overlaps another board, undo/redo restores coordinates and ownership in one step, and cancellation leaves no history or save.
- Manual: In the app, drag a group with the cursor offset from the center, drop in blank space, then transfer it onto a different board. Repeat at zoom. At an overlap, drag once from the lower board and once from the topmost board so that the topmost target is a different board in one case and the source in the other. Check the cue, unchanged placement at release, continued selection, and one undo/redo. Cancel with Escape and verify no transfer, then move a node across a board edge and verify its board still owns it.

Completion gate: AC6 and AC7 agree between the tool tests and real pointer interaction. Evidence: [evidence/step-3.1.md](evidence/step-3.1.md).

Phase exit gate: Run `pnpm format`, confirm it has not changed unrelated files, then run `pnpm check`, `pnpm lint`, `pnpm test`, and `pnpm build`. Ask the user to run the final browser workflow below in the app. Require every acceptance criterion to have its owning proof. Record command outcomes and cross-cutting browser proof in [evidence/final.md](evidence/final.md), not in the plan. Complete this gate before marking the feature ready for delivery review.

## Final acceptance

| Spec acceptance ID | Owning step / gate | Verification and expected result | Evidence location |
| --- | --- | --- | --- |
| AC1 | 2.1 | Add and duplicate yield active named boards; the copy is independent. | [step 2.1](evidence/step-2.1.md) |
| AC2 | 2.2 | Label move carries overflow and undoes once; before/after SVG and other board are unchanged. | [step 2.2](evidence/step-2.2.md) |
| AC3 | 2.2 | Both size modes target only one board; stroke widths and invalid-input behavior are preserved. | [step 2.2](evidence/step-2.2.md) |
| AC4 | 2.1 | Delete, undo, redo and final-board guard work, and New resets the workspace. | [step 2.1](evidence/step-2.1.md) |
| AC5 | 1.2 | Real board/shape clicks, drawing, marquee, guides, Fit and Copy use the right active board. | [step 1.2](evidence/step-1.2.md) |
| AC6 | 3.1 | Blank drop, transfer, continued selection, Escape, and single-step undo/redo agree in core and the app. | [step 3.1](evidence/step-3.1.md) |
| AC7 | 3.1 | Both overlap orders match the cue; node moves do not transfer. | [step 3.1](evidence/step-3.1.md) |
| AC8 | 1.2, Phase 3 exit | Each Copy has the selected board's dimensions and all and only its owned paths, including overflow. Recheck after transfer in the app. | [step 1.2](evidence/step-1.2.md), [final](evidence/final.md) |
| AC9 | Phase 3 exit, supported by 0.1 and 1.2 | Use the completed Step 1.2 evidence for exact legacy Copy. Manually verify that committed management and transfer survive reload and an interrupted drag does not. | [step 1.2](evidence/step-1.2.md), [final](evidence/final.md) |

Final browser workflow: In the app, add a second board, rename, move and resize the boards, and transfer an overflowing path. Copy both and check the sizes and paths. Give autosave a moment, then reload and check that names, positions, sizes, and artwork survived and Copy still gives the same SVGs. Start another drag and reload before releasing; the last saved layout should still be there. Use the existing legacy verification from Step 1.2 rather than setting up an old document again.

## Rollback and recovery

- Before a new-format write, revert Step 1.2 as a unit if needed; restoring v1 should not rewrite the original record at startup. UI-only slices do not require a data rollback. Keep test fixture restores isolated from existing browser data.
- The first successful v2 save can replace the v1 record under the same document ID. The prior app cannot reopen v2 as v1, and its recovery flow can point `current` elsewhere. Before testing a downgrade, preserve copies of `current` and the referenced document records separately. Restore the v1 record and pointer together to reopen with the old app. Keep the v2 copy to recover newer edits using a v2-capable build; do not silently flatten or discard other boards. No automatic downgrade is promised.
- The normal save writes the document before `current`. If the second write fails, preserve both records and inspect which persisted ID the pointer references before retrying; never fix a partial write by clearing IndexedDB. Keep existing recovery behavior for malformed or unsupported documents and separately verify that an interrupted gesture does not overwrite committed data.

## Planned deferred checks

- Third-party SVG embedding and clipping differences are outside the acceptance gate: verify complete path geometry and viewBox, not how every SVG consumer displays overflow.
- No production rollout, data downgrade utility, browser-matrix expansion, or published artifact checks are part of this plan. Revisit separately if a rollout needs them.

Execution-time blockers, skipped checks, and accepted deviations belong in evidence, not mutable plan fields.
