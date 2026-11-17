// Core compiles without the DOM lib, so declare the one Web Crypto member it uses.
// Global script (no imports or exports) on purpose: the app project, which has DOM, never includes this file.
interface Crypto {
  randomUUID(): string
}

declare var crypto: Crypto
