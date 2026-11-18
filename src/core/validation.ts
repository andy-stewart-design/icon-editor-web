// Numeric field validation for the properties panel. Pure: the UI passes the field text and reverts on failure.
// Failure carries no reason on purpose; the panel reverts the field and dispatches nothing.

export const ARTBOARD_MIN = 8
export const ARTBOARD_MAX = 256

export type FieldParse = { ok: true; value: number } | { ok: false }

// Turns field text into a finite number. Blank text is rejected explicitly because Number('') is 0.
export function parseNumber(text: string): FieldParse {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: false }
  const value = Number(trimmed)
  return Number.isFinite(value) ? { ok: true, value } : { ok: false }
}

// Numeric predicates, used both by the field validators and by commands as a last guard.
export const isValidStrokeWidth = (n: number): boolean => Number.isFinite(n) && n > 0
export const isValidArtboardSize = (n: number): boolean =>
  Number.isInteger(n) && n >= ARTBOARD_MIN && n <= ARTBOARD_MAX
export const isValidBoundsCoord = (n: number): boolean => Number.isFinite(n)
export const isValidBoundsSize = (n: number): boolean => Number.isFinite(n) && n > 0

// Stroke width must be finite and greater than 0.
export function validateStrokeWidth(text: string): FieldParse {
  const r = parseNumber(text)
  return r.ok && isValidStrokeWidth(r.value) ? r : { ok: false }
}

// Artboard size must be an integer from ARTBOARD_MIN to ARTBOARD_MAX.
export function validateArtboardSize(text: string): FieldParse {
  const r = parseNumber(text)
  return r.ok && isValidArtboardSize(r.value) ? r : { ok: false }
}

// Bounds X and Y accept any finite number.
export function validateBoundsCoord(text: string): FieldParse {
  const r = parseNumber(text)
  return r.ok && isValidBoundsCoord(r.value) ? r : { ok: false }
}

// Bounds W and H must be finite and greater than 0.
export function validateBoundsSize(text: string): FieldParse {
  const r = parseNumber(text)
  return r.ok && isValidBoundsSize(r.value) ? r : { ok: false }
}
