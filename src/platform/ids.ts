import type { IdGen } from '../core/ids'

export function createUuidIdGen(): IdGen {
  return { next: () => crypto.randomUUID() }
}
