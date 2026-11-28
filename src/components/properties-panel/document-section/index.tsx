import Select from "../../../components/core/select";
import {
  activeBoard,
  deleteArtboard,
  duplicateArtboard,
  renameArtboard,
  resizeArtboard,
  setDocLinecap,
  setDocLinejoin,
  setDocStrokeWidth,
  validateArtboardSize,
  validateStrokeWidth,
  type Linecap,
  type Linejoin,
} from "../../../core";
import { useEditor, useEditorStore } from "../../../hooks/use-editor";
import NumberField from "../../number-field";
import SegmentedControl from "../../segmented-control";
import s from "./styles.module.css";

const CAPS = [
  { value: "round", label: "Round" },
  { value: "butt", label: "Butt" },
  { value: "square", label: "Square" },
] as const satisfies readonly { value: Linecap; label: string }[];

const JOINS = [
  { value: "round", label: "Round" },
  { value: "miter", label: "Miter" },
  { value: "bevel", label: "Bevel" },
] as const satisfies readonly { value: Linejoin; label: string }[];

// Document defaults: stroke width, linecap, linejoin, and artboard size. The artboard size commits immediately;
// the "On resize" choice (UI state, not history) decides whether shapes stay in place or scale with it.
export default function DocumentSection() {
  const store = useEditorStore();
  const resizeMode = useEditor((e) => e.ui.artboardResizeMode);
  const strokeWidth = useEditor((e) => e.doc.strokeWidth);
  const linecap = useEditor((e) => e.doc.linecap);
  const linejoin = useEditor((e) => e.doc.linejoin);
  const board = useEditor(activeBoard);
  const canDelete = useEditor((e) => e.doc.boards.length > 1);
  const editing = useEditor((e) => e.tx !== null);

  return (
    <section className={s.section} aria-labelledby="document-section-heading">
      <h2 id="document-section-heading" className={s.heading}>
        Document
      </h2>
      <div className={s.rows}>
        <div role="group" aria-label="Active artboard" className={s.resize}>
          <span>{board.name}</span>
          <div className={s.actions}>
            <button
              type="button"
              disabled={editing}
              onClick={() => {
                const name = window.prompt("Artboard name", board.name);
                if (name !== null) store.dispatch(renameArtboard(name));
              }}
            >
              Rename
            </button>
            <button
              type="button"
              disabled={editing}
              onClick={() => {
                const { doc, activeBoardId } = store.getState();
                store.dispatch(duplicateArtboard(doc, activeBoardId));
              }}
            >
              Duplicate
            </button>
            <button
              type="button"
              disabled={editing || !canDelete}
              onClick={() => store.dispatch(deleteArtboard())}
            >
              Delete
            </button>
          </div>
        </div>
        <NumberField
          id="doc-stroke-width"
          step={0.5}
          label="Stroke width"
          value={strokeWidth}
          validate={validateStrokeWidth}
          onCommit={(n) => store.dispatch(setDocStrokeWidth(n))}
        />

        <Select
          label="Stoke cap"
          items={CAPS}
          defaultValue={linecap}
          onValueChange={(join: (typeof CAPS)[number]["value"]) =>
            store.dispatch(setDocLinecap(join))
          }
        />

        <Select
          label="Corner"
          items={JOINS}
          defaultValue={linejoin}
          onValueChange={(join: (typeof JOINS)[number]["value"]) =>
            store.dispatch(setDocLinejoin(join))
          }
        />

        <NumberField
          key={board.id}
          id="doc-artboard-size"
          disabled={editing}
          label="Artboard"
          value={board.size}
          validate={validateArtboardSize}
          onCommit={(n) =>
            store.dispatch(
              resizeArtboard(n, store.getState().ui.artboardResizeMode),
            )
          }
        />

        <label className={s.checkbox}>
          <span>Scale on resize</span>
          <input
            type="checkbox"
            checked={resizeMode === "scale"}
            onChange={(e) =>
              store.setUi({
                artboardResizeMode: e.target.checked ? "scale" : "keep",
              })
            }
          />
        </label>
      </div>
    </section>
  );
}
