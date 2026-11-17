// Core generates its own ids. The only source is crypto.randomUUID, declared in ./web-crypto.d.ts.
export function newId(): string {
  return globalThis.crypto.randomUUID()
}
