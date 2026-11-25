import { describe, expect, it } from 'vitest'
import {
  validateArtboardSize,
  validateStrokeWidth,
  parseNumber,
  validateBoundsSize,
} from './validation'

describe('numeric field validation', () => {
  it('stroke width must be finite and greater than 0', () => {
    expect(validateStrokeWidth('1.5')).toEqual({ ok: true, value: 1.5 })
    for (const bad of ['0', '-1', 'abc', '', '   ', 'Infinity']) {
      expect(validateStrokeWidth(bad)).toEqual({ ok: false })
    }
  })

  it('artboard size must be an integer from 8 to 256', () => {
    expect(validateArtboardSize('8')).toEqual({ ok: true, value: 8 })
    expect(validateArtboardSize('256')).toEqual({ ok: true, value: 256 })
    for (const bad of ['7', '257', '12.5', 'abc', '']) {
      expect(validateArtboardSize(bad)).toEqual({ ok: false })
    }
  })

  it('parseNumber rejects blank and non-numeric text', () => {
    expect(parseNumber('abc')).toEqual({ ok: false })
    expect(parseNumber('')).toEqual({ ok: false })
    expect(parseNumber(' -2.5 ')).toEqual({ ok: true, value: -2.5 })
  })

  it('bounds size must be finite and greater than 0', () => {
    expect(validateBoundsSize('0')).toEqual({ ok: false })
    expect(validateBoundsSize('3')).toEqual({ ok: true, value: 3 })
  })
})
