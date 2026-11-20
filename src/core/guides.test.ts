import { describe, expect, it } from 'vitest'
import { guidesFor, type Guide } from './guides'

const byName = (guides: Guide[], name: string) => guides.find((g) => g.name === name)!

describe('keyline guides (AC32)', () => {
  it('at size 24: circle diameter 22 and square 20x20, centered', () => {
    const guides = guidesFor(24)
    const circle = byName(guides, 'circle')
    const square = byName(guides, 'square')
    expect(circle).toMatchObject({ kind: 'circle', cx: 12, cy: 12, r: 11 })
    expect(square).toMatchObject({ kind: 'rect', rect: { x: 2, y: 2, w: 20, h: 20 } })
  })

  it('at size 48: circle diameter 44 and square 40x40, centered', () => {
    const guides = guidesFor(48)
    const circle = byName(guides, 'circle')
    const square = byName(guides, 'square')
    expect(circle).toMatchObject({ kind: 'circle', cx: 24, cy: 24, r: 22 })
    expect(square).toMatchObject({ kind: 'rect', rect: { x: 4, y: 4, w: 40, h: 40 } })
  })

  it('portrait and landscape scale with the size and are centered', () => {
    const portrait = byName(guidesFor(48), 'portrait')
    const landscape = byName(guidesFor(48), 'landscape')
    expect(portrait).toMatchObject({ rect: { x: 8, y: 4, w: 32, h: 40 } })
    expect(landscape).toMatchObject({ rect: { x: 4, y: 8, w: 40, h: 32 } })
  })

  it('every guide offers edge and center snap lines on both axes', () => {
    for (const g of guidesFor(24)) {
      expect(g.snapLines.filter((l) => l.axis === 'x')).toHaveLength(3)
      expect(g.snapLines.filter((l) => l.axis === 'y')).toHaveLength(3)
      expect(g.snapLines.every((l) => l.source === 'guide')).toBe(true)
    }
  })
})
