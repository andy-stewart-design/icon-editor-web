import { describe, expect, it } from 'vitest'
import { formatNumber } from './format'

describe('formatNumber', () => {
  it('rounds to 2 decimals, strips trailing zeros, never prints -0', () => {
    expect(formatNumber(1.005)).toBe('1.01')
    expect(formatNumber(-1.005)).toBe('-1.01')
    expect(formatNumber(-0.001)).toBe('0')
    expect(formatNumber(2)).toBe('2')
    expect(formatNumber(1.5)).toBe('1.5')
    expect(formatNumber(0.333)).toBe('0.33')
    expect(formatNumber(-2.5)).toBe('-2.5')
  })
})
