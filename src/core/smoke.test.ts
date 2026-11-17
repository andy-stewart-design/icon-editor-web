import { describe, expect, it } from 'vitest'
import { CORE_VERSION } from './index'

describe('core smoke test', () => {
  it('exports the core version placeholder', () => {
    expect(CORE_VERSION).toBe(1)
  })
})
