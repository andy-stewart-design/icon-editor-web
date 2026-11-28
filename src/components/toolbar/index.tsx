import { useState, type FC } from "react";
import { Popover } from "@base-ui/react/popover";
import {
  activeBoard,
  addArtboard,
  workspaceViewport,
  actualSizeViewport,
  createDefaultDoc,
  fitViewport,
  type ActiveTool,
  type EditorStore,
  type SnapIncrement,
} from "../../core";
import { useEditor, useEditorStore } from "../../hooks/use-editor";
import CopySvgButton from "../copy-svg-button";
import s from "./styles.module.css";
import IconCursor from "../core/icons/cursor";
import IconPenTool from "../core/icons/pen-tool";
import IconLine from "../core/icons/line";
import IconRectangle from "../core/icons/rectangle";
import IconCircle from "../core/icons/circle";
import type { IconProps } from "../core/icons/_internal";

const SNAP_INCREMENTS: readonly SnapIncrement[] = [1, 0.5, 0.25];

const DRAW_TOOLS: readonly {
  tool: ActiveTool;
  label: string;
  key: string;
  icon: FC<IconProps>;
}[] = [
  { tool: "select", label: "Select", key: "V", icon: IconCursor },
  { tool: "pen", label: "Pen", key: "P", icon: IconPenTool },
  { tool: "line", label: "Line", key: "L", icon: IconLine },
  { tool: "rect", label: "Rect", key: "R", icon: IconRectangle },
  { tool: "ellipse", label: "Ellipse", key: "E", icon: IconCircle },
];

// The text is kept as typed, so a half-entered value such as "" or "1." is not overwritten. Each valid
// number goes to the store, clamped to 0 or more. Blur shows the stored value again.
function RadiusInput({ store }: { store: EditorStore }) {
  const [text, setText] = useState(() =>
    String(store.getState().ui.rectRadius),
  );
  return (
    <label className={s.field}>
      Corner radius
      <input
        type="number"
        className={s.input}
        min={0}
        step={0.5}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number.parseFloat(e.target.value);
          if (Number.isFinite(n)) store.setUi({ rectRadius: Math.max(0, n) });
        }}
        onBlur={() => setText(String(store.getState().ui.rectRadius))}
      />
    </label>
  );
}

export default function Toolbar() {
  const store = useEditorStore();
  const showGrid = useEditor((e) => e.ui.showGrid);
  const showSubgrid = useEditor((e) => e.ui.showSubgrid);
  const showKeylines = useEditor((e) => e.ui.showKeylines);
  const snapEnabled = useEditor((e) => e.ui.snapEnabled);
  const snapIncrement = useEditor((e) => e.ui.snapIncrement);
  const zoom = useEditor((e) => e.ui.viewport.zoom);
  const mode = useEditor((e) => e.ui.mode);
  const targetCount = useEditor((e) => e.selection.shapeIds.length);
  const editing = useEditor((e) => e.tx !== null);
  const activeTool = useEditor((e) => e.ui.activeTool);

  const fit = () => {
    const state = store.getState();
    const { ui } = state;
    const { size, origin } = activeBoard(state);
    store.setUi({
      viewport: workspaceViewport(
        fitViewport(ui.canvasSize, size, size),
        origin,
      ),
    });
  };

  const actualSize = () => {
    const state = store.getState();
    const { ui } = state;
    const { size, origin } = activeBoard(state);
    store.setUi({
      viewport: workspaceViewport(
        actualSizeViewport(ui.canvasSize, size, size),
        origin,
      ),
    });
  };

  // Autosave persists the replacement through subscribeCommitted.
  const newDocument = () => {
    if (
      !window.confirm("Start a new document? The current one will be replaced.")
    )
      return;
    store.replaceDocument(createDefaultDoc());
    fit();
  };

  return (
    <div className={s.toolbar}>
      <Popover.Root>
        <Popover.Trigger className={s.button}>Menu</Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={2} align="start">
            <Popover.Popup className={s.popover}>
              <Popover.Viewport className={s.viewport}>
                {/*<Popover.Title />
                <Popover.Description />*/}
                <button onClick={newDocument}>New document</button>
                <button
                  disabled={editing}
                  onClick={() => {
                    const { doc, activeBoardId } = store.getState();
                    store.dispatch(addArtboard(doc, activeBoardId));
                  }}
                >
                  Add artboard
                </button>
                <label className={s.checkbox}>
                  <span>show grid</span>
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) =>
                      store.setUi({ showGrid: e.target.checked })
                    }
                  />
                </label>
                <label className={s.checkbox}>
                  <span>show subgrid</span>
                  <input
                    type="checkbox"
                    checked={showSubgrid}
                    onChange={(e) =>
                      store.setUi({ showSubgrid: e.target.checked })
                    }
                  />
                </label>
              </Popover.Viewport>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      {/*<div className={s.group} role="group" aria-label="Editing mode">
        <span className={s.modeLabel}>Mode</span>
        {(['shape', 'node'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={s.button}
            aria-pressed={mode === value}
            title={value === 'node' ? 'Node mode (A enters Node + Select)' : 'Shape mode'}
            onClick={() => store.setUi({ mode: value })}
          >
            {value === 'shape' ? 'Shape' : 'Node'}
          </button>
        ))}
      </div>*/}
      <div className={s.group} role="group" aria-label="Drawing tool">
        {DRAW_TOOLS.map(({ tool, label, key, icon: Icon }) => (
          <button
            key={tool}
            type="button"
            className={s.button}
            aria-pressed={activeTool === tool}
            aria-label={label}
            title={`${label} (${key})`}
            onClick={() => store.setUi({ activeTool: tool })}
          >
            <Icon size={16} />
          </button>
        ))}
        {mode === "node" && activeTool === "pen" && targetCount !== 1 && (
          <span className={s.modeLabel} role="status">
            Select one shape to draw
          </span>
        )}
        {activeTool === "rect" && <RadiusInput store={store} />}
      </div>
      <div className={s.group}>
        <button
          type="button"
          className={s.button}
          aria-pressed={showKeylines}
          onClick={() =>
            store.setUi({ showKeylines: !store.getState().ui.showKeylines })
          }
        >
          Keylines
        </button>
        <button
          type="button"
          className={s.button}
          aria-pressed={snapEnabled}
          title="Toggle snapping (`)"
          onClick={() =>
            store.setUi({ snapEnabled: !store.getState().ui.snapEnabled })
          }
        >
          Snap
        </button>
        <div className={s.group} role="group" aria-label="Snap increment">
          {SNAP_INCREMENTS.map((increment) => (
            <button
              key={increment}
              type="button"
              className={s.button}
              aria-pressed={snapIncrement === increment}
              onClick={() => store.setUi({ snapIncrement: increment })}
            >
              {String(increment)}
            </button>
          ))}
        </div>
      </div>
      <div className={s.group}>
        <CopySvgButton />
        <button type="button" className={s.button} onClick={fit}>
          Fit
        </button>
        <button type="button" className={s.button} onClick={actualSize}>
          100%
        </button>
        <span className={s.zoom}>{`${Math.round(zoom * 100)}%`}</span>
      </div>
    </div>
  );
}
