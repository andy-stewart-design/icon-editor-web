# Pen Point History and Endpoint Handles Overview

## Purpose and intended change

Undo a misplaced Pen point without losing the whole contour or stopping drawing. When resuming an open path, set the direction of the next curve without bending the curve you already drew.

## How it is used

Draw two points to start an open contour. From there, each released point can be undone on its own, and Pen keeps drawing from the restored endpoint. If you finish after placing only the first point, it disappears. Enter and Esc finish drawing; they don’t undo released edits.

In Node + Pen, click an open endpoint to resume unchanged, or drag it to set a handle for the next segment. The endpoint becomes Free so its other handle stays put. Release saves the handle even if you stop drawing there.

## Mental model

A new contour needs two points to become part of the document. After that, a release that changes the path is an edit you can undo; finishing only ends the drawing session.

## Scope and non-goals

- In scope: Pen point and closure history, continued drawing after Undo, and a saved continuation handle on an open endpoint.
- Out of scope: saved lone points, joining contours, and changes to Node + Select.

## Related documents

- Specification: [spec.md](spec.md)
- Baseline: [Drawing Mode Revision](../_completed/drawing-mode-revision/overview.md)
