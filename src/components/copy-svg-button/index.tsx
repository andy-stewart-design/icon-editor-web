import { useEffect, useState } from 'react'
import { serializeDoc } from '../../core'
import { useEditorStore } from '../../hooks/use-editor'
import { writeClipboardText } from '../../platform/clipboard'
import FallbackDialog from './fallback-dialog'
import s from './styles.module.css'

const TOAST_MS = 2000

// Serializes at click time. On success a short toast confirms; on rejection the markup is shown in a dialog instead.
export default function CopySvgButton() {
  const store = useEditorStore()
  const [copied, setCopied] = useState(false)
  const [fallback, setFallback] = useState<string | null>(null)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    const markup = serializeDoc(store.getState().doc)
    try {
      await writeClipboardText(markup)
      setCopied(true)
    } catch {
      setFallback(markup)
    }
  }

  return (
    <>
      <button type="button" className={s.button} onClick={() => void copy()}>
        Copy SVG
      </button>
      {copied && (
        <div className={s.toast} role="status" aria-live="polite">
          Copied
        </div>
      )}
      {fallback !== null && <FallbackDialog markup={fallback} onClose={() => setFallback(null)} />}
    </>
  )
}
