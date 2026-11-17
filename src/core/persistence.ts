import { createDefaultDoc, parseIconDoc, type IconDoc } from './model'

// Minimal async key-value port; the browser adapter (IndexedDB) lives in src/platform.
export interface KeyValueStore {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
}

export const CURRENT_KEY = 'current'
export const docKey = (id: string): string => `doc:${id}`
const backupKey = (id: string | null, timestamp: number): string => `backup:${id ?? 'unknown'}:${timestamp}`

export type LoadResult = { doc: IconDoc; notice: null | 'recovered' }

// Resolves with a document in every recoverable case. Rejects only when storage itself fails.
export async function loadDocument(kv: KeyValueStore, now: () => number): Promise<LoadResult> {
  const fresh = (notice: LoadResult['notice']): LoadResult => ({ doc: createDefaultDoc(), notice })

  // Keeps the unreadable value under a fresh backup key, probing past existing keys so nothing is overwritten.
  // If the backup fails we still open a new doc: its id is new, so no stored record is overwritten either way.
  const recover = async (id: string | null, raw: unknown): Promise<LoadResult> => {
    try {
      const base = backupKey(id, now())
      let key = base
      for (let n = 1; (await kv.get(key)) !== undefined; n++) key = `${base}:${n}`
      await kv.set(key, raw)
    } catch {
      // Backup write failed: the notice still tells the user, and the stored data is left as-is.
    }
    return fresh('recovered')
  }

  const currentId = await kv.get(CURRENT_KEY)
  if (currentId === undefined) return fresh(null)
  if (typeof currentId !== 'string') return recover(null, currentId)

  const raw = await kv.get(docKey(currentId))
  if (raw === undefined) return fresh(null)
  const parsed = parseIconDoc(raw)
  if (parsed.kind === 'ok') return { doc: parsed.doc, notice: null }
  return recover(currentId, raw)
}

export async function saveDocument(kv: KeyValueStore, doc: IconDoc): Promise<void> {
  await kv.set(docKey(doc.id), doc)
  await kv.set(CURRENT_KEY, doc.id)
}

export type SaveStatus = 'ok' | 'failing'

export type AutosaveOptions = {
  kv: KeyValueStore
  schedule: (fn: () => void, ms: number) => () => void // returns a cancel function
  delayMs?: number
  onStatus: (status: SaveStatus) => void
}

export type Autosave = {
  request: (doc: IconDoc) => void
  flush: () => Promise<void>
  dispose: () => void
}

export function createAutosave({ kv, schedule, delayMs = 400, onStatus }: AutosaveOptions): Autosave {
  let pending: IconDoc | null = null
  let cancelTimer: (() => void) | null = null
  let status: SaveStatus | null = null
  let disposed = false
  let chain: Promise<void> = Promise.resolve() // serialises writes so an older doc never lands after a newer one

  const setStatus = (next: SaveStatus): void => {
    if (next === status) return
    status = next
    onStatus(next)
  }

  // A failed save drops the doc. The next request() schedules a fresh save of the newest doc, which is the retry.
  const save = async (doc: IconDoc): Promise<void> => {
    try {
      await saveDocument(kv, doc)
      setStatus('ok')
    } catch {
      setStatus('failing')
    }
  }

  const enqueue = (): Promise<void> => {
    const doc = pending
    pending = null
    if (doc) chain = chain.then(() => save(doc))
    return chain
  }

  return {
    request: (doc) => {
      if (disposed) return
      pending = doc
      cancelTimer?.()
      cancelTimer = schedule(() => {
        cancelTimer = null
        void enqueue()
      }, delayMs)
    },
    flush: () => {
      cancelTimer?.()
      cancelTimer = null
      return enqueue()
    },
    dispose: () => {
      cancelTimer?.()
      cancelTimer = null
      pending = null
      disposed = true
    },
  }
}
