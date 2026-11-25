# Pen Point History and Endpoint Handles Implementation Plan

## Governing source

- Governing spec: [spec.md](spec.md)
- Orientation: [overview.md](overview.md)

This plan is an execution contract. Routine execution changes only task checkboxes; scope, step IDs, dependencies, gates, and acceptance mappings change only with explicit user agreement. A checked task does not imply acceptance, approval, or release. In supervised execution, manual approvals remain in extension state.

## Execution constraints

- Run commands from the `icon-editor-web` repository root. Use the existing pnpm scripts, Node-only Vitest suites, and a local browser with isolated site data. Browser access is required for the input and preview gates; core tests do not prove canvas event ordering.
- Preserve unrelated working-tree changes and completed drawing-mode documents. Keep `src/core` independent of the DOM and React. Do not add a separate draft history stack, alter persistence or SVG formats, or change Node + Select.
- No current green baseline is assumed. Record the focused baseline in Step 1.1 before changes. Distinguish existing failures from regressions and stop if a failure prevents evaluating a required gate.
- Escalate material contract conflicts before affected work. Record any approved plan change and rationale in [evidence/changes.md](evidence/changes.md), citing actual agreement.
- Check a verification task only when its required checks and completion gate pass and evidence is recorded. Failed, blocked, skipped, or waived checks stay unchecked. Record the reason, known approval owner if applicable, and follow-up in the designated note. Use a few sentences or bullets with checks, outcomes, and material caveats; do not create empty evidence files or duplicate progress in the plan.

## Phase overview and delivery boundary

| Phase | Outcome | Dependencies | Exit gate |
| --- | --- | --- | --- |
| 1 | Point releases enter history without ending the Pen session; a lone new point remains provisional. | None | Focused integration regression and browser checks across both Pen modes and history entry points. |
| 2 | Open-endpoint drag commits one continuation-handle edit without bending existing curves. | Phase 1 exit gate | Full core regression, lint, production build, and composed browser workflow. |

Delivery boundary: one feature-complete PR. Phase 1 is reviewable before endpoint dragging. Keep its Pen release-commit change, shared history routing, and canvas input handoff together: per-point commits must not use the old history-agnostic input path at a review or merge boundary.

## Phase 1 — Point releases and live history

Outcome: In both Pen modes, the initial pair, each later point, and closure commit separately. Undo and Redo work against the live contour without replaying gestures.

Depends on: None.

Review boundary: Pen's document commits, history reconciliation, and browser input ownership. Endpoint resumption remains click-only in this phase.

### Step 1.1 — Commit released points and reconcile Pen on Undo/Redo

Requirements / acceptance: R1, R2, R3, R5; AC1–AC5, AC8, AC9; AC7 (history-free resume click only; drag cases belong to Step 2.1).

Depends on: None.

Review boundary: atomic switch from the finish-time buffer to provisional/committed state with shared history and input handling.

Expected files:

- `src/core/tools/penTool.ts`, `src/core/tools/penTarget.ts`, `src/core/tools/types.ts` — Pen attachment and gesture lifecycle, contour assembly/preview, and a narrow tool seam for history handling.
- `src/core/commands/nodes.ts`, `src/core/store.ts`, `src/core/commands.ts` — guarded contour edits and shared Undo/Redo coordination at the store/command boundary. Keep existing document snapshots, selection restoration, and committed notifications.
- `src/hooks/use-tool-input.ts` — make the document available to both Pen contexts, retire capture before navigation, and refresh the preview. `src/hooks/use-shortcuts.ts` is an existing consumer to audit; both keyboard shortcuts and direct store callers must use the same history path.
- `src/core/tools/penTool.test.ts`, `src/core/tools/penTarget.test.ts`, `src/core/history.test.ts` — real-store Pen tests, geometry assertions, and shared navigation regression coverage.

Tasks:

- [x] Before editing, run `pnpm test src/core/tools/penTool.test.ts src/core/tools/penTarget.test.ts src/core/history.test.ts` and record the outcome in this step’s evidence.
- [x] Keep a first release local until a second distinct point creates the shape or appends the contour. Commit each subsequent point and closure on release through ordinary document commands. Finish only clears session state. Preserve duplicate suppression, snapping, drag behavior, and fresh versus resumed closure semantics; render preview geometry without duplicating committed strokes.
- [x] Pin the shape/contour and drawing end. Validate the target at release, update the guard after the Pen’s own commits, and never fall back to the current selection or overwrite an external geometry edit. Keep the fresh/resumed distinction after the initial pair becomes committed.
- [x] Coordinate history through the shared store entry point. Retire an in-flight Pen press before navigation, clearing gesture ownership before releasing pointer capture. Consume provisional Undo locally. After an applied document step, resolve the same contour and end in the restored document; discard provisional state on applied Redo, and leave Pen idle if the contour disappeared, closed, or was not already attached. Ignore late release events from canceled presses.
- [x] Replace finish-time test expectations with release-time assertions. Cover both modes, provisional stack and export isolation, point and closure granularity, direction after Undo/Redo, pinned and invalid targets, canceled presses, and history-free resume click. Verify both command results and Pen attachment with the existing real-store harness.
- [x] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: `pnpm test src/core/tools/penTool.test.ts src/core/tools/penTarget.test.ts src/core/history.test.ts src/core/commands/nodes.test.ts` and `pnpm typecheck`. Expect no document/commit notification or history change for lone points, exactly one entry per accepted edit, and stable document geometry, selection snapshots, and attachment through history. Assert that an unapplied Redo does not erase the provisional point and that a resumed contour does not lose its original cubic segments.
- Manual: start `pnpm dev` and open the printed local URL with fresh site data. In both modes, verify a lone point appears only as a provisional marker and disappears on Enter, Esc, or context switch, leaving `window.iconEditor.doc()` and `svg()` unchanged. Draw a pair and a third point; undo the third and replace it without resuming manually. In Node + Pen, repeat from the head and tail of an existing contour. Undo the initial pair and redo it; verify no ghost point and no new attachment on Redo. Invoke Undo with a provisional point over existing history, and invoke keyboard Undo/Redo during a captured press; confirm the later release does not add a point. Use `window.iconEditor.store.undo()`/`redo()` in a separate held-press trial to verify direct callers obey the same handoff.

Completion gate: focused tests and typecheck pass; the shared history entry point, both Pen modes, and the browser capture sequence reproduce the spec without altering Node + Select behavior.

Evidence location: [evidence/step-1.1.md](evidence/step-1.1.md).

Phase exit gate: after Step 1.1, run `pnpm test src/core/tools src/core/commands src/core/history.test.ts src/core/serialize/index.test.ts`. In the local browser, add a disconnected contour to an existing shape with Node + Pen, close it, then Undo and Redo closure and finish with Esc. Confirm only the targeted contour changes and Esc adds no edit. All checks must pass before Phase 2; record the outcome in [Step 1.1 evidence](evidence/step-1.1.md).

## Phase 2 — Saved continuation handles

Outcome: Dragging an existing open endpoint prepares the next curve and persists only the continuation-side handle and Free mode on release.

Depends on: Phase 1 exit gate.

Review boundary: the existing Node + Pen resume gesture, its preview, and one guarded release-time handle command. No new control or generic anchor-editing gesture.

### Step 2.1 — Drag an endpoint to commit its continuation handle

Requirements / acceptance: R4 and R2 (release, finish, and no-op semantics for this gesture); AC6 and the remaining drag/no-op cases of AC7.

Depends on: Step 1.1 and the Phase 1 exit gate.

Review boundary: press/drag/release on a resumable endpoint and its side-specific document edit.

Expected files:

- `src/core/tools/penTool.ts`, `src/core/tools/penTarget.ts` — resume press drag, snapping, handle visualization and continuation preview in drawing order.
- `src/core/commands/nodes.ts` — guarded write to the exact endpoint while preserving unrelated geometry.
- `src/core/tools/penTool.test.ts`, `src/core/tools/penTarget.test.ts` — geometry, preview, and undo/redo coverage for both ends.

Tasks:

- [x] Give an endpoint resume press the existing Pen drag threshold and snapping. Preview the continuation handle as it is pulled; a below-threshold release still just attaches.
- [x] Commit `Free` and only the future-facing handle (`hOut` at the tail, `hIn` at the head) on release. Check the exact target and mode/handle coordinates before writing, so stale presses or an identical drag on a Free endpoint do not change history. Preserve the anchor, other handle, all existing segments, and unrelated shapes.
- [x] Continue the session from the committed handle. Use the same orientation for immediate preview and a later resume. Canceling the press or finishing before release drops the preview without a write; finishing after a valid release leaves it committed.
- [x] Add tests that compare prior segment geometry at both ends, verify opposite-handle preservation and mode restoration on Undo/Redo, and cover click, cancel, finish during drag, unchanged drag, and using the saved handle on resume.
- [x] Satisfy the verification and completion gate below, and record concise evidence.

Verification:

- Automated: `pnpm test src/core/tools/penTool.test.ts src/core/tools/penTarget.test.ts src/core/commands/nodes.test.ts`. Expect a single committed edit on a changed release, identical prior cubics, no entry on no-op or canceled gestures, and a preview that uses the saved handle in either direction.
- Manual: in the local browser, draw a curved open path and test both ends in Node + Pen. Drag an endpoint and inspect the guide; release and move the pointer to see the next-curve preview while the old curve stays unchanged. Press Esc without adding a point, then Undo/Redo and resume. Check via `window.iconEditor.doc()` that the relevant handle and Free mode round-trip and the existing-facing handle never changes. Try Esc before release in a separate trial and confirm no handle edit is saved.

Completion gate: core and browser checks confirm endpoint edits persist on release, Undo/Redo affect one edit, and the old curve never moves.

Evidence location: [evidence/step-2.1.md](evidence/step-2.1.md).

Phase exit gate: run `pnpm test`, `pnpm lint`, and `pnpm build` (includes typecheck). In the local browser, drag an open endpoint in Node + Pen and place a new point. Undo the point and verify Pen remains attached with the saved handle; undo the handle separately and verify the restored mode/handle and unchanged original path. Redo both and verify the extension returns. Record the passing integration outcome in [Step 2.1 evidence](evidence/step-2.1.md) before handoff.

## Final acceptance

| Spec acceptance ID | Owning step / gate | Verification and expected result | Evidence location |
| --- | --- | --- | --- |
| AC1 | 1.1 tool and browser | Provisional point is visible only during drawing and never enters snapshots or history. | [1.1](evidence/step-1.1.md) |
| AC2 | 1.1 tool/history | Initial pair, later point, and finish have the specified commit boundaries in both modes. | [1.1](evidence/step-1.1.md) |
| AC3 | 1.1 tool/history | Resume placement commits immediately; fresh and resumed closure are distinct edits without duplicate anchors. | [1.1](evidence/step-1.1.md) |
| AC4 | 1.1 tool and browser | Undo keeps the live end or detaches if the pair disappears; Redo from idle does not attach. | [1.1](evidence/step-1.1.md) |
| AC5 | 1.1 tool and browser | Provisional Undo is local; history during capture cannot cause a late commit. | [1.1](evidence/step-1.1.md) |
| AC6 | 2.1 tool and browser | Both endpoints save only the future handle and Free mode, survive finish, and restore in one history edit. | [2.1](evidence/step-2.1.md) |
| AC7 | 1.1 resume click + 2.1 drag | Resume click, canceled drag, and unchanged Free drag write no edit. | [1.1](evidence/step-1.1.md), [2.1](evidence/step-2.1.md) |
| AC8 | 1.1 tool/history | Selection changes do not retarget, and invalidated targets do not write. | [1.1](evidence/step-1.1.md) |
| AC9 | 1.1 tool/history | Point Redo updates the attached end; closure Redo clears attachment. | [1.1](evidence/step-1.1.md) |

## Rollback and recovery

Revert endpoint drag independently, or revert it before reverting the Phase 1 cutover as a unit. There is no schema or persistence migration; committed geometry remains readable. At runtime a stale press is discarded rather than reapplied to a different target. No external service, publication, or release gate is in scope.

## Planned deferred checks

- No separate draft history stack, saved lone points, or generic Pen anchor editing. No checks for those behaviors are part of this plan.

Execution-time blockers, skipped checks, and accepted deviations belong in the designated evidence notes.