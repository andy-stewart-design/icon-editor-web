import { describe, expect, it } from 'vitest'
import { createCounterIdGen } from './ids'
import { createDefaultDoc, type IconDoc } from './model'
import {
  CURRENT_KEY,
  createAutosave,
  docKey,
  loadDocument,
  saveDocument,
  type KeyValueStore,
  type SaveStatus,
} from './persistence'

class MemoryKV implements KeyValueStore {
  data = new Map<string, unknown>()
  writes: string[] = []
  failSet = false
  async get(key: string): Promise<unknown> {
    return this.data.get(key)
  }
  async set(key: string, value: unknown): Promise<void> {
    if (this.failSet) throw new Error('storage unavailable')
    this.writes.push(key)
    this.data.set(key, value)
  }
}

// Holds at most one pending timer; run() fires it synchronously.
function manualTimer() {
  let timer: (() => void) | null = null
  return {
    schedule: (fn: () => void) => {
      timer = fn
      return () => {
        if (timer === fn) timer = null
      }
    },
    run: () => {
      const fn = timer
      timer = null
      fn?.()
    },
  }
}

const docWith = (id: string): IconDoc => ({ ...createDefaultDoc(createCounterIdGen()), id })
const now = () => 1000

describe('loadDocument', () => {
  it('restores a saved document', async () => {
    const kv = new MemoryKV()
    const doc = docWith('doc1')
    await saveDocument(kv, doc)
    const result = await loadDocument(kv, createCounterIdGen(), now)
    expect(result).toEqual({ doc, notice: null })
  })

  it('opens a default document when nothing is stored', async () => {
    const result = await loadDocument(new MemoryKV(), createCounterIdGen(), now)
    expect(result.notice).toBeNull()
    expect(result.doc).toEqual(createDefaultDoc(createCounterIdGen()))
  })

  it.each([
    ['unreadable record', { foo: 1 }],
    ['newer version', { ...docWith('doc1'), version: 2 }],
  ])('AC42: backs up an %s untouched, opens a new doc, and notifies', async (_label, bad) => {
    const kv = new MemoryKV()
    kv.data.set(CURRENT_KEY, 'doc1')
    kv.data.set(docKey('doc1'), bad)
    const result = await loadDocument(kv, createCounterIdGen(), now)
    expect(result.notice).toBe('recovered')
    expect(result.doc.id).not.toBe('doc1')
    expect(kv.data.get(docKey('doc1'))).toBe(bad)
    expect(kv.data.get('backup:doc1:1000')).toBe(bad)
  })

  it('backs up a non-string current pointer under the unknown id', async () => {
    const kv = new MemoryKV()
    kv.data.set(CURRENT_KEY, 42)
    const result = await loadDocument(kv, createCounterIdGen(), now)
    expect(result.notice).toBe('recovered')
    expect(kv.data.get('backup:unknown:1000')).toBe(42)
  })

  it('still opens a new doc with a notice when the backup write fails', async () => {
    const kv = new MemoryKV()
    const bad = { foo: 1 }
    kv.data.set(CURRENT_KEY, 'doc1')
    kv.data.set(docKey('doc1'), bad)
    kv.failSet = true
    const result = await loadDocument(kv, createCounterIdGen(), now)
    expect(result.notice).toBe('recovered')
    expect(kv.data.get(docKey('doc1'))).toBe(bad)
  })
})

describe('createAutosave', () => {
  it('AC43: reports failing on a failed write, then saves and reports ok on the next change', async () => {
    const kv = new MemoryKV()
    const timer = manualTimer()
    const statuses: SaveStatus[] = []
    const autosave = createAutosave({ kv, schedule: timer.schedule, onStatus: (s) => statuses.push(s) })

    kv.failSet = true
    autosave.request(docWith('a'))
    timer.run()
    await autosave.flush()
    expect(statuses).toEqual(['failing'])

    kv.failSet = false
    autosave.request(docWith('b'))
    timer.run()
    await autosave.flush()
    expect(kv.data.get(docKey('b'))).toEqual(docWith('b'))
    expect(kv.data.get(CURRENT_KEY)).toBe('b')
    expect(statuses).toEqual(['failing', 'ok'])
  })

  it('debounces: three requests then one timer run write only the latest doc', async () => {
    const kv = new MemoryKV()
    const timer = manualTimer()
    const autosave = createAutosave({ kv, schedule: timer.schedule, onStatus: () => {} })
    autosave.request(docWith('a'))
    autosave.request(docWith('b'))
    autosave.request(docWith('c'))
    timer.run()
    await autosave.flush()
    expect(kv.writes).toEqual([docKey('c'), CURRENT_KEY])
    expect(kv.data.get(CURRENT_KEY)).toBe('c')
  })

  it('flush saves the pending doc immediately and dispose drops pending work', async () => {
    const kv = new MemoryKV()
    const timer = manualTimer()
    const autosave = createAutosave({ kv, schedule: timer.schedule, onStatus: () => {} })
    autosave.request(docWith('a'))
    await autosave.flush()
    expect(kv.data.get(CURRENT_KEY)).toBe('a')

    autosave.request(docWith('b'))
    autosave.dispose()
    timer.run()
    await autosave.flush()
    expect(kv.data.get(CURRENT_KEY)).toBe('a')
  })
})
