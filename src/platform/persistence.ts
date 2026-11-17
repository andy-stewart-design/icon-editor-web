import {
  createAutosave,
  createDefaultDoc,
  createEditorStore,
  docKey,
  loadDocument,
  saveDocument,
  type EditorStore,
  type KeyValueStore,
  type SaveStatus,
} from '../core'
import { openIdbStore } from './idb-store'
import { createUuidIdGen } from './ids'

export type Session = { store: EditorStore; kv: KeyValueStore }

// Opens storage on first use and retries after a failed open, so a boot-time failure recovers on a later save.
export function lazyIdbStore(): KeyValueStore {
  let open: Promise<KeyValueStore> | null = null
  const ready = (): Promise<KeyValueStore> => {
    open ??= openIdbStore().catch((error: unknown) => {
      open = null
      throw error
    })
    return open
  }
  return {
    get: async (key) => (await ready()).get(key),
    set: async (key, value) => (await ready()).set(key, value),
  }
}

// Restores the stored document. If storage can't be opened or read, starts an in-memory doc with a save warning.
export async function loadSession(): Promise<Session> {
  try {
    const kv = await openIdbStore()
    const { doc, notice } = await loadDocument(kv, createUuidIdGen(), () => Date.now())
    let saveStatus: SaveStatus = 'ok'
    // No stored record for this id means a new or recovery doc: write it now so a record exists after load.
    try {
      if ((await kv.get(docKey(doc.id))) === undefined) await saveDocument(kv, doc)
    } catch {
      saveStatus = 'failing'
    }
    const store = createEditorStore(doc)
    store.setUi({ loadNotice: notice, saveStatus })
    return { store, kv }
  } catch {
    const store = createEditorStore(createDefaultDoc(createUuidIdGen()))
    store.setUi({ saveStatus: 'failing' })
    return { store, kv: lazyIdbStore() }
  }
}

// Autosaves on each commit and flushes when the page is hidden. Returns a cleanup that flushes pending work.
export function startPersistence(store: EditorStore, kv: KeyValueStore): () => void {
  const autosave = createAutosave({
    kv,
    schedule: (fn, ms) => {
      const id = window.setTimeout(fn, ms)
      return () => window.clearTimeout(id)
    },
    onStatus: (saveStatus) => store.setUi({ saveStatus }),
  })
  const unsubscribe = store.subscribeCommitted((doc) => autosave.request(doc))
  const flush = () => void autosave.flush()
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', onVisibility)
    unsubscribe()
    void autosave.flush()
    autosave.dispose()
  }
}
