import { Select as BaseSelect } from "@base-ui/react/select";
import s from "./styles.module.css";
import type { ComponentProps } from "react";
import IconChevronDown from "../icons/chevron-down";
import IconUndo from "../icons/undo";

type BaseProps = ComponentProps<typeof BaseSelect.Root>;

interface Props extends BaseProps {
  items: Readonly<{ label: string; value: string }[]>;
  label: string;
  overridden?: boolean;
  onReset?: () => void;
}

export default function Select({
  overridden,
  onReset,
  label,
  ...props
}: Props) {
  return (
    <BaseSelect.Root {...props}>
      <div className={s.row}>
        <BaseSelect.Label className={s.label}>
          {label}
          {overridden && onReset && (
            <button className={s.reset} onClick={onReset}>
              <IconUndo size={12} strokeWidth={1.1} />
            </button>
          )}
        </BaseSelect.Label>
        <BaseSelect.Trigger className={s.trigger}>
          <BaseSelect.Value />
          <IconChevronDown size={10} strokeWidth={1.1} />
        </BaseSelect.Trigger>
      </div>
      <BaseSelect.Portal>
        <BaseSelect.Positioner>
          <BaseSelect.Popup className={s.popover}>
            <BaseSelect.List>
              {props.items.map((country) => (
                <BaseSelect.Item
                  key={country.value}
                  value={country.value}
                  className={s.option}
                >
                  <BaseSelect.ItemText>{country.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
