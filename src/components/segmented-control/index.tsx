import s from './styles.module.css'

interface Option<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  label: string
  options: readonly Option<T>[]
  // undefined when nothing is selected. With mixed=true no option is pressed and "Mixed" is shown.
  value: T | undefined
  mixed?: boolean
  disabled?: boolean
  onChange: (value: T) => void
}

// Radio-like group of toggle buttons. Pressing the active option still calls onChange, so an override can be
// set to the value a shape already inherits.
export default function SegmentedControl<T extends string>(props: Props<T>) {
  const { label, options, value, mixed, disabled, onChange } = props
  return (
    <div className={s.wrap}>
      <div className={s.group} role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={s.button}
            aria-pressed={!mixed && value === o.value}
            disabled={disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {mixed && <span className={s.mixed}>Mixed</span>}
    </div>
  )
}
