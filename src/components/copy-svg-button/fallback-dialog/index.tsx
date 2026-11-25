import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import s from './styles.module.css'

interface Props {
  markup: string
  onClose: () => void
}

// Native modal. Focus goes to the read-only textarea with its text selected, never to the Close button,
// so an Enter that opened the dialog cannot activate a default action.
export default function FallbackDialog({ markup, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    dialog.showModal()
  }, [])

  useEffect(() => {
    const el = area.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  // Esc closes the native dialog and fires 'close'; onClose unmounts this component.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const handle = () => onClose()
    dialog.addEventListener('close', handle)
    return () => dialog.removeEventListener('close', handle)
  }, [onClose])

  const close = () => ref.current?.close()

  // Keep canvas and app shortcuts from firing while the dialog is open.
  const stop = (e: KeyboardEvent) => e.stopPropagation()

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby="copy-svg-fallback-title"
      onKeyDown={stop}
      onKeyUp={stop}
    >
      <h2 id="copy-svg-fallback-title" className={s.title}>
        Copy the SVG manually
      </h2>
      <p className={s.hint}>
        Your browser blocked clipboard access. Select the markup below and copy it.
      </p>
      <textarea
        ref={area}
        className={s.text}
        value={markup}
        readOnly
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className={s.actions}>
        <button type="button" className={s.button} onClick={close}>
          Close
        </button>
      </div>
    </dialog>
  )
}
