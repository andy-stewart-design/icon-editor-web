import { useRef, useState, type KeyboardEvent } from "react";
import type { FieldParse } from "../../core";
import s from "./styles.module.css";
import IconUndo from "../core/icons/undo";

interface Props {
  id: string;
  label: string;
  // 'mixed' shows an empty field with a Mixed placeholder. undefined means no value (empty, disabled in practice).
  value: number | "mixed" | undefined;
  validate: (text: string) => FieldParse;
  onCommit: (value: number) => void;
  suffix?: string;
  disabled?: boolean;
  step?: number; // Arrow Up/Down change per press; Shift is 10×, Alt is 0.1×. Default 1.
  overridden?: boolean;
  onReset?: () => void;
}

// Rounds for display only; the stored value is never changed by display.
function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

// Text input (not type=number, so "abc" can be typed and rejected). `draft` is null while the field shows the
// stored value. Typing starts a draft. Enter or blur commits it. Invalid text and unchanged values never reach
// onCommit, so they create no history entry.
export default function NumberField(props: Props) {
  const {
    id,
    label,
    value,
    validate,
    onCommit,
    suffix,
    disabled,
    step = 1,
    overridden,
    onReset,
  } = props;
  const shown = typeof value === "number" ? formatNumber(value) : "";
  const [draft, setDraft] = useState<string | null>(null);
  // Mirrors `draft` so a blur right after Enter sees the cleared draft rather than a stale render.
  const latest = useRef<string | null>(null);

  const setDraftText = (text: string | null) => {
    latest.current = text;
    setDraft(text);
  };

  const commit = () => {
    const text = latest.current;
    if (text === null) return;
    setDraftText(null);
    const parsed = validate(text);
    if (!parsed.ok) return; // revert: the field shows the stored value again
    if (typeof value === "number" && parsed.value === value) return;
    onCommit(parsed.value);
  };

  // Arrow Up/Down commit straight away, one history entry per press, starting from the typed draft if it is valid,
  // else the stored value. A mixed field has no starting point, so arrows do nothing. A result the validator rejects
  // (a stroke width at or below 0) is ignored.
  const stepBy = (dir: 1 | -1, e: KeyboardEvent<HTMLInputElement>) => {
    const amount = step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
    const typed = latest.current === null ? null : validate(latest.current);
    const base = typed?.ok
      ? typed.value
      : typeof value === "number"
        ? value
        : null;
    if (base === null) return;
    const next = Math.round((base + dir * amount) * 1e4) / 1e4; // no float noise like 0.30000000000000004
    setDraftText(null);
    if (validate(String(next)).ok) onCommit(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Keep keys away from canvas and tool listeners on window (Escape cancels gestures, arrows nudge).
    e.stopPropagation();
    if (e.key === "Enter") commit();
    else if (e.key === "Escape") setDraftText(null);
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault(); // no caret jump to the start or end of the text
      stepBy(e.key === "ArrowUp" ? 1 : -1, e);
    }
  };

  return (
    <div className={s.field}>
      <label htmlFor={id} className={s.label}>
        {label}
        {overridden && onReset && (
          <button className={s.reset} onClick={onReset}>
            <IconUndo size={12} strokeWidth={1.1} />
          </button>
        )}
      </label>
      <span className={s.control}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          className={s.input}
          value={draft ?? shown}
          placeholder={value === "mixed" ? "Mixed" : undefined}
          disabled={disabled}
          onChange={(e) => setDraftText(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
        />
        {suffix && <span className={s.suffix}>{suffix}</span>}
      </span>
    </div>
  );
}
