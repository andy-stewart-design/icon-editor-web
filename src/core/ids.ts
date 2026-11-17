export interface IdGen {
  next(): string
}

// Deterministic generator for tests and core logic: id1, id2, ...
export function createCounterIdGen(prefix = 'id'): IdGen {
  let n = 0
  return { next: () => `${prefix}${++n}` }
}
