# Drawing Mode Revision Overview

## Purpose and intended change

You can draw an open path today, but once you finish it, you can’t pick up where you left off. The revised controls let you choose whether Pen should draw a new shape or add to the shape you’re editing.

## How it is used

Select an open path, enter Node mode, and press `P`. Click either open endpoint to keep drawing that contour, or start elsewhere to draw a disconnected contour in the same shape. Press `V` to edit the nodes without leaving Node mode. To draw a separate shape instead, switch to Shape mode and use Pen there.

## Mental model

**Shape or Node** determines what you’re working on. **Select or Pen** determines what your click does. Hover shows what the click will target; it doesn’t change tools. Disconnected contours in the same shape share its style and move together as one shape.

## Scope and non-goals

- In scope: independent mode and tool selection, open-path continuation, and disconnected contours in one SVG path.
- Out of scope: joining existing contours and undoing individual Pen points while drawing.

## Related documents

- Specification: [spec.md](spec.md)
