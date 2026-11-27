import { createEditorStore } from './store'
import { serializeSvg } from './serialize'
import { artboardWorkspace, contentOfFirstBoard } from './test-fixtures/artboard-workspace'
import { describe, expect, it } from 'vitest'
import { createDefaultDoc, type Artboard, type IconDoc } from './model'
import {
  CURRENT_KEY,
  createAutosave,
  docKey,
  loadDocument,
  saveDocument,
  type KeyValueStore,
  type SaveStatus,
} from './persistence'
import { legacyIconDoc, legacyIconSvg } from './test-fixtures/legacy-icon-doc'

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

const docWith = (id: string): IconDoc => ({ ...createDefaultDoc(), id })
const now = () => 1000

describe('loadDocument', () => {
  it('restores the exact legacy record selected by current without rewriting storage', async () => {
    const kv = new MemoryKV()
    kv.data.set('doc:other', docWith('other'))
    kv.data.set('doc:legacy-icon', JSON.parse(JSON.stringify(legacyIconDoc)))
    kv.data.set('current', legacyIconDoc.id)

    const { doc, notice, restored } = await loadDocument(kv, now)
    expect(notice).toBeNull()
    expect(restored).toBe(true)
    expect(doc.boards).toEqual([
      {
        id: 'legacy-icon:board',
        name: 'Artboard 1',
        origin: { x: 0, y: 0 },
        size: legacyIconDoc.size,
        shapes: legacyIconDoc.shapes,
      },
    ])
    expect(serializeSvg(contentOfFirstBoard(doc))).toBe(legacyIconSvg)
    expect(kv.writes).toEqual([])
  })

  it('restores a saved document', async () => {
    const kv = new MemoryKV()
    const doc = artboardWorkspace
    await saveDocument(kv, doc)
    const result = await loadDocument(kv, now)
    expect(result).toEqual({ doc, notice: null, restored: true })
  })

  it('opens a default document when nothing is stored', async () => {
    const result = await loadDocument(new MemoryKV(), now)
    expect(result.notice).toBeNull()
    expect(result.doc).toEqual({
      ...createDefaultDoc(),
      id: expect.any(String),
      boards: [{ ...createDefaultDoc().boards[0], id: expect.any(String) }],
    })
  })

  it.each([
    ['unreadable record', { foo: 1 }],
    ['newer version', { ...docWith('doc1'), version: 3 }],
  ])('AC42: backs up an %s untouched, opens a new doc, and notifies', async (_label, bad) => {
    const kv = new MemoryKV()
    kv.data.set(CURRENT_KEY, 'doc1')
    kv.data.set(docKey('doc1'), bad)
    const result = await loadDocument(kv, now)
    expect(result.notice).toBe('recovered')
    expect(result.doc.id).not.toBe('doc1')
    expect(kv.data.get(docKey('doc1'))).toBe(bad)
    expect(kv.data.get('backup:doc1:1000')).toBe(bad)
  })

  it.each([0.125, 27.5, 300, Number.MAX_VALUE])(
    'preserves legacy size %s after v2 save',
    async (size) => {
      const kv = new MemoryKV()
      const legacy = { ...legacyIconDoc, size }
      kv.data.set(CURRENT_KEY, legacy.id)
      kv.data.set(docKey(legacy.id), legacy)
      const { doc } = await loadDocument(kv, now)
      expect(doc.boards[0].size).toBe(size)
      expect(serializeSvg(contentOfFirstBoard(doc))).toBe(serializeSvg(legacy))
      expect(kv.writes).toEqual([])
      await saveDocument(kv, doc)
      expect(kv.writes).toEqual([docKey(legacy.id), CURRENT_KEY])
      expect(await loadDocument(kv, now)).toEqual({ doc, notice: null, restored: true })
    },
  )

  it('keeps earlier backups on a key collision', async () => {
    const kv = new MemoryKV()
    const raw = { ...artboardWorkspace, boards: [] }
    kv.data.set(CURRENT_KEY, raw.id)
    kv.data.set(docKey(raw.id), raw)
    const key = `backup:${raw.id}:1000`
    kv.data.set(key, 'previous')
    expect((await loadDocument(kv, now)).notice).toBe('recovered')
    expect(kv.data.get(key)).toBe('previous')
    expect(kv.data.get(`${key}:1`)).toBe(raw)
    expect(kv.data.get(docKey(raw.id))).toBe(raw)
  })

  it('backs up a non-string current pointer under the unknown id', async () => {
    const kv = new MemoryKV()
    kv.data.set(CURRENT_KEY, 42)
    const result = await loadDocument(kv, now)
    expect(result.notice).toBe('recovered')
    expect(kv.data.get('backup:unknown:1000')).toBe(42)
  })

  it('still opens a new doc with a notice when the backup write fails', async () => {
    const kv = new MemoryKV()
    const bad = { foo: 1 }
    kv.data.set(CURRENT_KEY, 'doc1')
    kv.data.set(docKey('doc1'), bad)
    kv.failSet = true
    const result = await loadDocument(kv, now)
    expect(result.notice).toBe('recovered')
    expect(kv.data.get(docKey('doc1'))).toBe(bad)
  })
})

describe('createAutosave', () => {
  it('AC43: reports failing on a failed write, then saves and reports ok on the next change', async () => {
    const kv = new MemoryKV()
    const timer = manualTimer()
    const statuses: SaveStatus[] = []
    const autosave = createAutosave({
      kv,
      schedule: timer.schedule,
      onStatus: (s) => statuses.push(s),
    })

    kv.failSet = true
    autosave.request(docWith('a'))
    timer.run()
    await autosave.flush()
    expect(statuses).toEqual(['failing'])

    kv.failSet = false
    const next = docWith('b')
    autosave.request(next)
    timer.run()
    await autosave.flush()
    expect(kv.data.get(docKey('b'))).toEqual(next)
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

it('autosaves only the committed workspace, not canceled or in-flight previews', async () => {
  const kv = new MemoryKV()
  await saveDocument(kv, artboardWorkspace)
  const timer = manualTimer()
  const autosave = createAutosave({ kv, schedule: timer.schedule, onStatus: () => {} })
  const store = createEditorStore((await loadDocument(kv, now)).doc)
  store.subscribeCommitted(autosave.request)
  const [small, large] = artboardWorkspace.boards
  store.activateBoard(large.id)
  const move = (board: Artboard) => {
    board.shapes[0].subpaths[0].nodes[0].p.x -= 10
  }
  store.begin('Move')
  store.update(move)
  await autosave.flush()
  expect(kv.data.get(docKey(artboardWorkspace.id))).toEqual(artboardWorkspace)
  store.cancel()
  await autosave.flush()
  expect(kv.writes).toHaveLength(2)
  store.begin('Move')
  store.update(move)
  store.commit()
  await autosave.flush()
  const { doc } = await loadDocument(kv, now)
  expect(doc.boards[0]).toEqual(small)
  expect(doc.boards[1].shapes[0].subpaths[0].nodes[0].p.x).toBe(-22)
  expect(doc).not.toHaveProperty('activeBoardId')
})
