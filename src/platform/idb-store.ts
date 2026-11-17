import type { KeyValueStore } from '../core'

// One object store with out-of-line keys. Each get/set is its own transaction; set resolves only after commit.
export function openIdbStore(dbName = 'icon-editor', storeName = 'kv'): Promise<KeyValueStore> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'))
      return
    }
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(dbName, 1)
    } catch (error) {
      reject(error)
      return
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName)
    }
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => {
      const db = req.result
      // Release the connection when another tab upgrades or deletes the database, so it isn't blocked.
      db.onversionchange = () => db.close()

      const run = <T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
        new Promise((done, fail) => {
          const tx = db.transaction(storeName, mode)
          const result = op(tx.objectStore(storeName))
          tx.oncomplete = () => done(result.result)
          tx.onerror = () => fail(tx.error ?? new Error('IndexedDB transaction failed'))
          tx.onabort = () => fail(tx.error ?? new Error('IndexedDB transaction aborted'))
        })

      resolve({
        get: (key) => run('readonly', (store) => store.get(key)),
        set: async (key, value) => {
          await run('readwrite', (store) => store.put(value, key))
        },
      })
    }
  })
}
