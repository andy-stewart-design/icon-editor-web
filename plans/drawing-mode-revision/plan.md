# Drawing Mode Revision Implementation Plan

## Governing source

- Governing spec: [spec.md](spec.md)
- Orientation: [overview.md](overview.md)

This plan is an execution contract. Scope, step IDs, dependencies, expected files, gates, and acceptance mappings remain fixed during routine execution. A checked task does not imply acceptance, approval, or release. In supervised execution, manual approvals remain in extension state.

## Execution constraints

- Run commands from the `icon-editor-web` repository root. Use the existing pnpm scripts, Node-only Vitest setup, and a local browser for UI verification. Browser access is required for the UI gate; the core suite is not a substitute.
- Preserve unrelated working-tree changes. Keep `src/core` independent of React, DOM, and browser adapters. No migration, new test harness, service access, or release work is needed.
- Static inspection confirmed the scripts and test seams; no green baseline is asserted. Capture the focused pre-change baseline specified in Step 1.1 and distinguish existing failures from regressions. If a failure prevents evaluating a required gate, stop before dependent work and record it.
- Routine edits to this plan are checkbox updates only. Escalate material conflicts before affected work; change the contract only with explicit user agreement and record the actual agreement and rationale in [evidence/changes.md](evidence/changes.md).
- Check a verification task only after its required checks and completion gate pass and evidence is recorded. Failed, skipped, waived, or blocked checks stay unchecked; note the outcome, reason, known approval owner where applicable, and follow-up. A waiver is not a pass.
- Write evidence at the designated locations when there is a result or blocker. Record the command or walkthrough, outcome, and material caveat in a few sentences or bullets. Do not create empty notes, paste transcripts, or maintain a second progress ledger.

## Phase overview and delivery boundary

| Phase | Outcome | Dependencies | Exit gate |
| --- | --- | --- | --- |
| 1 | Geometry and Pen core support disconnected contours and endpoint resumption through the existing document/history model. | None | Focused core composition checks and typecheck; editor still uses existing tool routing. |
| 2 | The editor exposes independent mode and tool controls and routes input and feedback to the verified Pen behavior. | Phase 1 exit gate | Browser workflow across modes plus full core regression, lint, and production build. |

Delivery boundary: one feature-complete PR. The two-axis store contract, toolbar, input wiring, and all affected consumers in Step 2.1 are an atomic change; do not land or revert pieces of that change separately. Phase 1 is reviewable without enabling a partially working Node + Pen UI.

## Phase 1 — Pen behavior and document edits

Outcome: Pen can target, assemble, and finish an edit against a selected shape without changing the editor's current canvas routing.

Depends on: None.

Review boundary: pure geometry, tool behavior, SVG serialization assertions, command/history behavior. No toolbar or shortcut changes.

### Step 1.1 — Resolve endpoints and assemble contour extensions

Requirements / acceptance: R3, R6; AC3, AC5, AC6 (endpoint eligibility and geometry only). Step 1.2 verifies tool behavior and SVG output; Step 2.1 verifies the AC3 browser cue.

Depends on: None.

Review boundary: deterministic targeting and contour assembly, without document mutation or new user-facing behavior.

Expected files:

- `src/core/tools/penTarget.ts` — proposed pure endpoint resolution and contour assembly helpers.
- `src/core/tools/penTarget.test.ts` — proposed focused geometry tests; use existing `src/core/geometry/segments.ts` as the oracle for old segments.

Tasks:

- [x] Before editing, run `pnpm test src/core/tools/penTool.test.ts src/core/tools/nodeTool.test.ts src/core/serialize/index.test.ts src/core/history.test.ts` and record the baseline in this step’s evidence.
- [x] Resolve only the ends of open subpaths in the eligible shape, from raw pointer coordinates and the existing screen-space hit tolerance. Choose a stable winner for overlapping targets so hover and press can use the same result. Do not reuse Node Select’s segment insertion hit behavior.
- [x] Assemble tail extensions by appending and head extensions by prepending the new nodes in reverse placement order with their handle roles swapped. Leave the old nodes and segment direction intact. Closing uses the original opposite endpoint without adding a duplicate or rewriting a handle on an existing segment.
- [x] Add cases for closed and interior exclusion, overlap and zoom tolerance, curved extensions in both directions, and closure with original segments unchanged.
- [x] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: after adding the proposed tests, run `pnpm test src/core/tools/penTarget.test.ts` and `pnpm typecheck`. The picker returns only eligible endpoints and resolves ties consistently; the extension and close tests compare original segment geometry and check the new segment direction and handles.
- Manual: not needed for the pure geometry scope.

Completion gate: baseline is recorded, focused assertions pass, and the new helper typechecks without changing existing behavior.

Evidence location: [evidence/step-1.1.md](evidence/step-1.1.md).

### Step 1.2 — Implement fixed-target Pen drafts and one-edit commits

Requirements / acceptance: R2, R3, R5, R6; AC2 and AC3 (tool/geometry portions; browser portions in Step 2.1), AC4 (tool/serializer portion; browser portion in Step 2.1), AC5, AC6, AC8, AC10, and AC7 (tool finish, cancellation, and deactivation; host switching and key routing in Step 2.1).

Depends on: Step 1.1.

Review boundary: one Pen state machine for both contexts, with a tested Node policy and the app’s existing Shape behavior still the default. No React or toolbar changes.

Expected files:

- `src/core/tools/penTool.ts`, `src/core/tools/types.ts` — explicit drawing context, draft lifetime and tool feedback primitives.
- `src/core/commands/nodes.ts` — focused command for the single in-place edit using the existing command/history mechanism.
- `src/core/tools/penTool.test.ts` — extend the existing real-store harness with seeded paths, snapping, and history assertions.

Tasks:

- [x] Retain Shape Pen's creation and gesture behavior. For Node Pen, require one selected shape at start, pin the destination, and resolve an open endpoint or start a disconnected contour. Keep subsequent points in that contour; do not join to other contours. Expose eligible endpoint and resume feedback using the same resolver as press.
- [x] Preserve snapping, corner/curve drawing, closure for fresh contours, and existing finish/cancel behavior. Use the geometry helper for endpoint resumption and opposite-end closure. Drop only the pending press on pointer cancel; finish keys and deactivation commit placed points at most once.
- [x] Commit only the target contour or append a subpath in place. Preserve shape identity, style, stacking order, and unrelated geometry; reselect the pinned shape on success. Check its current geometry before dispatch; removal or changed geometry, a short new contour, or untouched resumption must not dispatch or consume a redo branch.
- [x] Add real-store tests for Shape Pen over an existing endpoint, curved head/tail extension, disconnected and closed SVG contours, ineligible starts and targets, selection changing from A to B, stale/no-op paths, finish/cancel cases, and one Undo/Redo per successful finish. Assert actual serializer output and exercise a non-identity snap for new points.
- [x] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: `pnpm test src/core/tools/penTool.test.ts src/core/commands/commands.test.ts src/core/serialize/index.test.ts src/core/history.test.ts`. Expect geometry and serialization changes only on the pinned target, one history entry per finish, and no changes from invalid drafts; existing Shape Pen/command/history regressions pass.
- Manual: not needed here; the app is not yet wired to Node Pen. Browser acceptance belongs to Step 2.1.

Completion gate: the existing Shape factory path remains usable; the real-store Node path passes the edit, no-op, cancel, stale-target, and history assertions without any schema or serializer changes.

Evidence location: [evidence/step-1.2.md](evidence/step-1.2.md).

Phase exit gate: after Step 1.2, run `pnpm test src/core/tools src/core/commands src/core/serialize src/core/history.test.ts` and `pnpm typecheck`. All selected suites and typecheck must pass, with the existing editor consumers still building against the unchanged default Shape behavior. Record the outcome in [Step 1.2 evidence](evidence/step-1.2.md) before advancing.

## Phase 2 — Mode controls, input routing, and browser acceptance

Outcome: the editor exposes the two axes, indicates what Pen will do, and switches contexts without losing or redirecting a draft.

Depends on: Phase 1 exit gate.

Review boundary: the complete state/consumer cutover, input ownership, and visual feedback. No new document features or history granularity.

### Step 2.1 — Wire the mode/tool matrix and drawing lifecycle

Requirements / acceptance: R1–R5; AC1, AC9, and the remaining browser/host portions of AC2, AC3, AC4, and AC7. R6 preservation is also observed in the AC3/AC4 walkthrough.

Depends on: Steps 1.1 and 1.2 and the Phase 1 exit gate.

Review boundary: atomic change from the exclusive tool state to independently observable mode/tool state; no temporary Node + Pen fallback to Shape Pen.

Expected files:

- `src/core/store.ts`, `src/core/index.ts`, `src/core/tools/tools.test.ts` — state contract/defaults, affected exports, and pure transition coverage; use the existing core test setup.
- `src/hooks/use-shortcuts.ts`, `src/hooks/use-tool-input.ts` — shortcut predicates, canvas routing, and context lifetime.
- `src/components/toolbar/index.tsx`, `src/components/toolbar/styles.module.css` — mode and tool controls and selected states.
- `src/components/canvas/node-overlay/index.tsx`, `src/components/canvas/selection-overlay/index.tsx`, `src/components/canvas/selection-outline/index.tsx`, `src/components/properties-panel/node-section/index.tsx` — update existing state consumers and keep Select-only interactions separate from Pen.
- `src/components/canvas/tool-overlay/index.tsx`, `src/components/canvas/tool-overlay/styles.module.css` — render eligible endpoints and distinct resume feedback without adding interactive node hit regions.

Tasks:

- [ ] Split mode from tool in the editor state and update the toolbar, shortcuts, overlays, and panel together. Default to Shape + Select; `V`/`P` preserve mode, `A` enters Node + Select, and choosing a primitive enters Shape. Preserve eligible Select Enter/idle Escape behavior and avoid activating applicable shortcuts from editable inputs.
- [ ] Route Node + Select and Node + Pen separately. Preserve Node Select's editing predicates, and give Pen its own finish handling so the same Enter/Escape event cannot also apply a Select transition.
- [ ] Hand off Pen contexts in order: clear the old gesture, finish the old draft once under its original mode and pinned destination, then allow new input in the next context. Include Pen-to-Pen mode switches and ignore late releases from retired gestures. Do not depend on React cleanup timing alone for this ordering.
- [ ] Render endpoint affordances and refresh them when selection or geometry changes without pointer movement. Ensure zero/multiple selections do not show a stale resume target, and hover never invokes Node Select or changes the tool.
- [ ] Add focused core state/routing assertions where the contract is pure; audit all tool discriminants and run the browser checklist below for behavior that requires real event routing. Remove obsolete exclusive Node-tool predicates after the replacement path has been checked.
- [ ] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: `pnpm test src/core/tools/tools.test.ts src/core/tools/penTool.test.ts` and `pnpm typecheck`. Expect verified mode defaults/transitions and Pen regressions to pass with all consumers using the new contract. Search `src` for `activeTool`, `ActiveTool`, and `DRAW_TOOLS`; inspect remaining matches and confirm none rely on the retired mutually exclusive Node tool value.
- Manual: run `pnpm dev` and open the local Vite URL in a browser with a fresh editor. Use the existing dev-only `window.iconEditor.doc()` and `svg()` to inspect shape counts, contours, and geometry when the canvas alone is ambiguous.
  - **Controls (AC1, AC9):** create an open path, exercise `A`, `P`, `V`, the mode control, Select Enter and idle Node + Select Escape. Verify labels/selected states and which changes preserve mode. Move a shape and then a node under their respective Select contexts. From Node mode choose and draw with Line, Rect, and Ellipse; each switches to Shape and creates a distinct selected shape.
  - **Canvas and output (AC2–AC4):** draw a curved open path. In Node + Pen hover and extend from each end in separate trials, undoing between trials. Compare the cue to the actual endpoint and inspect that original geometry persists. Draw a disconnected contour in Node + Pen and inspect a second `M` on the same SVG path. With no selection or multiple shapes selected, check that Node Pen does not draw or show stale resume cues. In Shape + Pen start on an existing endpoint and confirm the result is a separate selected shape.
  - **Finish and capture (AC7):** with two placed points try Enter, Escape, `V`, and a mode-control switch in separate drafts. Try Enter and Escape while holding an unfinished press, then release and confirm no extra point; try `V` during a press to exercise the old-gesture handoff. Exercise `pointercancel` on a captured canvas gesture with a touch-capable browser or a matching bubbling synthetic `PointerEvent` at the canvas; the pending point must be dropped, previously placed points remain finishable. Each valid finish takes one Undo; Pen Enter/Escape leave mode unchanged.

Completion gate: focused automation, legacy consumer audit, and the browser checklist pass; transitions never accept new canvas input against an unfinished old context or apply a draft to the wrong shape.

Evidence location: [evidence/step-2.1.md](evidence/step-2.1.md).

Phase exit gate: run `pnpm test`, `pnpm lint`, and `pnpm build` (includes `tsc -b`). Expect the full suite, lint, and production build to pass. In the local browser, start an extension in Node + Pen, switch directly to Shape + Pen using the mode control, and immediately draw over an existing endpoint. Verify the old extension stays in one shape, the new drawing creates another, and two Undos revert them in reverse order. Record the integration outcome in [Step 2.1 evidence](evidence/step-2.1.md) after the step’s checks and before handoff.

## Final acceptance

| Spec acceptance ID | Owning step / gate | Verification and expected result | Evidence location |
| --- | --- | --- | --- |
| AC1 | 2.1 controls | Default, independent `V`/`P`, and Select-mode toggles in browser. | [2.1](evidence/step-2.1.md) |
| AC2 | 1.2 tool + 2.1 canvas | Same endpoint click in Shape Pen creates a separate selected path. | [1.2](evidence/step-1.2.md), [2.1](evidence/step-2.1.md) |
| AC3 | 1.2 tool + 2.1 canvas | Both endpoint directions preserve existing curves and identifiers; hover previews the actual target. | [1.2](evidence/step-1.2.md), [2.1](evidence/step-2.1.md) |
| AC4 | 1.2 tool/serializer + 2.1 canvas | Same shape and SVG path contain the additional `M`. | [1.2](evidence/step-1.2.md), [2.1](evidence/step-2.1.md) |
| AC5 | 1.2 tool | Ineligible selections do not draft; interior/closed targets cannot resume; other contours cannot join. | [1.2](evidence/step-1.2.md) |
| AC6 | 1.2 tool/serializer | Fresh and resumed closures emit `Z` without changing old resumed segments. | [1.2](evidence/step-1.2.md) |
| AC7 | 1.2 tool + 2.1 finish/capture and Phase 2 gate | Finish once via key or switch; cancel only the unfinished press; no redirection or second transition. | [1.2](evidence/step-1.2.md), [2.1](evidence/step-2.1.md) |
| AC8 | 1.2 tool/history | No-op and stale drafts do not change history; Undo/Redo restore an entire valid drawing edit. | [1.2](evidence/step-1.2.md) |
| AC9 | 2.1 controls | Shape/node selections retain their roles and primitives create distinct shapes. | [2.1](evidence/step-2.1.md) |
| AC10 | 1.2 tool/history | Snap/drag points commit once to the pinned target despite a selection change. | [1.2](evidence/step-1.2.md) |

## Rollback and recovery

Revert the consumer cutover in Step 2.1 as a unit before reverting Pen core, or revert the feature as one change. The editor keeps the same document and SVG shapes/subpaths; there is no migration or irreversible write. A draft invalidated by a target change is discarded without fallback, preserving the current document and history.

## Planned deferred checks

- Per-point undo/redo, joining existing contours, and a dedicated overlapping-endpoint disambiguation UI are outside this plan. Validate current deterministic hover-to-press behavior; revisit these checks only under a follow-up spec.

Execution-time blockers, skipped checks, and accepted deviations belong in evidence rather than plan status fields.