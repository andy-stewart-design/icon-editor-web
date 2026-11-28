import { useMemo } from "react";
import {
  resetLinecap,
  resetLinejoin,
  resetStrokeWidth,
  selectionField,
  selectionHasOverride,
  selectionRect,
  setLinecapOverride,
  setLinejoinOverride,
  setSelectionBounds,
  setStrokeWidthOverride,
  validateBoundsCoord,
  validateBoundsSize,
  validateStrokeWidth,
  type Linecap,
  type Linejoin,
  type Rect,
  type StyleField,
} from "../../../core";
import {
  useEditor,
  useEditorStore,
  useActiveContent,
} from "../../../hooks/use-editor";
import NumberField from "../../core/number-field";
import s from "./styles.module.css";
import Select from "../../core/select";

const CAPS = [
  { value: "round", label: "Round" },
  { value: "butt", label: "Butt" },
  { value: "square", label: "Square" },
] as const satisfies readonly { value: Linecap; label: string }[];

const JOINS = [
  { value: "miter", label: "Miter" },
  { value: "round", label: "Round" },
  { value: "bevel", label: "Bevel" },
] as const satisfies readonly { value: Linejoin; label: string }[];

// Shown only when something is selected. Bounds edits go through setSelectionBounds. Style fields are per-shape
// overrides applied to every selected shape; "Inherited" means the value comes from the document default.
export default function ShapeSection() {
  const store = useEditorStore();
  const doc = useActiveContent();
  const selection = useEditor((e) => e.selection);

  const rect = useMemo(() => selectionRect(doc, selection), [doc, selection]);
  const stroke = useMemo(
    () => selectionField(doc, selection, "strokeWidth"),
    [doc, selection],
  );
  const linecap = useMemo(
    () => selectionField(doc, selection, "linecap"),
    [doc, selection],
  );
  const join = useMemo(
    () => selectionField(doc, selection, "linejoin"),
    [doc, selection],
  );
  const hasOverride = (field: StyleField) =>
    selectionHasOverride(doc, selection, field);

  // Keeps the other three values; the command's sizes are ignored for axes of zero extent.
  const setBounds = (patch: Partial<Rect>) => {
    if (!rect) return;
    const next = { ...rect, ...patch };
    store.dispatch(
      setSelectionBounds(
        store.getState().selection,
        next.x,
        next.y,
        next.w,
        next.h,
      ),
    );
  };

  return (
    <section className={s.section} aria-labelledby="shape-section-heading">
      <h2 id="shape-section-heading" className={s.heading}>
        Shape
      </h2>
      <div className={s.rows}>
        <div className={s.pair}>
          <NumberField
            id="shape-x"
            label="X"
            value={rect?.x}
            validate={validateBoundsCoord}
            disabled={!rect}
            onCommit={(n) => setBounds({ x: n })}
          />
          <NumberField
            id="shape-y"
            label="Y"
            value={rect?.y}
            validate={validateBoundsCoord}
            disabled={!rect}
            onCommit={(n) => setBounds({ y: n })}
          />
          <NumberField
            id="shape-w"
            label="W"
            value={rect?.w}
            validate={validateBoundsSize}
            disabled={!rect}
            onCommit={(n) => setBounds({ w: n })}
          />
          <NumberField
            id="shape-h"
            label="H"
            value={rect?.h}
            validate={validateBoundsSize}
            disabled={!rect}
            onCommit={(n) => setBounds({ h: n })}
          />
        </div>

        <NumberField
          id="doc-stroke-width"
          step={0.5}
          label="Stroke width"
          value={stroke.kind === "same" && stroke.value}
          validate={validateStrokeWidth}
          onCommit={(n) =>
            store.dispatch(
              setStrokeWidthOverride(store.getState().selection, n),
            )
          }
          overridden={hasOverride("strokeWidth")}
          onReset={() =>
            store.dispatch(resetStrokeWidth(store.getState().selection))
          }
        />

        <Select
          label="Stoke cap"
          items={CAPS}
          value={linecap.kind === "same" && linecap.value}
          onValueChange={(join: (typeof CAPS)[number]["value"]) =>
            store.dispatch(setLinecapOverride(store.getState().selection, join))
          }
          overridden={hasOverride("linecap")}
          onReset={() =>
            store.dispatch(resetLinecap(store.getState().selection))
          }
        />

        <Select
          label="Corner"
          items={JOINS}
          value={join.kind === "same" && join.value}
          onValueChange={(v: (typeof JOINS)[number]["value"]) =>
            store.dispatch(setLinejoinOverride(store.getState().selection, v))
          }
          overridden={hasOverride("linejoin")}
          onReset={() =>
            store.dispatch(resetLinejoin(store.getState().selection))
          }
        />
      </div>
    </section>
  );
}
