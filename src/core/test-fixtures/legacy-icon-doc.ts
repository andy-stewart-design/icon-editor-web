import type { LegacyIconDoc } from '../model'

export const legacyIconDoc = {
  id: 'legacy-icon',
  version: 1,
  size: 32,
  strokeWidth: 2.5,
  linecap: 'butt',
  linejoin: 'miter',
  shapes: [
    {
      id: 'curve',
      type: 'path',
      style: {},
      subpaths: [
        {
          id: 'curve-subpath',
          closed: false,
          nodes: [
            { id: 'start', p: { x: -4, y: 8 }, hOut: { x: 1, y: -6 }, mode: 'corner' },
            { id: 'end', p: { x: 36, y: 22 }, hIn: { x: 30, y: 4 }, mode: 'corner' },
          ],
        },
      ],
    },
    {
      id: 'outline',
      type: 'path',
      style: { strokeWidth: 4, linecap: 'square', linejoin: 'bevel' },
      subpaths: [
        {
          id: 'outline-subpath',
          closed: true,
          nodes: [
            { id: 'a', p: { x: 3, y: 5 }, mode: 'corner' },
            { id: 'b', p: { x: 14, y: 5 }, mode: 'corner' },
            { id: 'c', p: { x: 14, y: 18 }, mode: 'corner' },
          ],
        },
      ],
    },
  ],
} satisfies LegacyIconDoc

export const legacyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="butt" stroke-linejoin="miter">
  <path d="M-4 8C1 -6 30 4 36 22"/>
  <path d="M3 5L14 5L14 18Z" stroke-width="4" stroke-linecap="square" stroke-linejoin="bevel"/>
</svg>`
