# Multiple Artboards Overview

## Purpose and intended change

Keep an icon set or several size variants in one workspace instead of replacing the current icon each time. Each artboard holds a separate icon and can be rearranged without changing what it exports.

## How it is used

Draw an icon, duplicate its board, and resize the copy to start a variant. Drag a board by its name to arrange the set. To move a shape to another icon, drag it there and watch for the destination highlight before dropping it. Select a board and use **Copy SVG** to copy that icon on its own.

## Mental model

A board owns its artwork, even if a path extends beyond its edge. Dropping a shape on empty canvas keeps that ownership; dropping it inside another board transfers it. Moving a board carries everything it owns.

## Scope and non-goals

- In scope: Multiple square boards, direct board controls, cross-board shape dragging, and copying one icon at a time.
- Out of scope: A dedicated Artboard tool, linked variants, and batch export.

## Related documents

- Specification: [spec.md](spec.md)
