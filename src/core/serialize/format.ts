// Round half away from zero to 2 decimals. The relative epsilon nudges binary ties (1.005 is stored as 1.00499…)
// up to the decimal tie so they round as written. String() then drops trailing zeros and keeps the leading 0.
export function formatNumber(n: number): string {
  const r = Math.round(Math.abs(n) * (1 + Number.EPSILON) * 100) / 100
  if (r === 0) return '0'
  return (n < 0 ? '-' : '') + String(r)
}
