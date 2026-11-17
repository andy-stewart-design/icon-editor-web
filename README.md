# Icon Editor

A browser-based editor for stroke-style SVG icons on a small artboard (typically 24×24). Designers draw with Line, Rectangle, Ellipse and Pen tools, refine with Node edit, and copy clean SVG out.

The project is in early development. For the purpose, scope and plan, see [`.plans/mvp/overview.md`](.plans/mvp/overview.md). The `.plans/` directory is local and gitignored.

## Stack

React 19, TypeScript, Vite, Vitest and oxlint, managed with pnpm.

## Layout

- `src/core/`: framework-agnostic editor logic (document model, commands, geometry, serializer). Type-checked without the DOM library (`tsconfig.core.json`).
- `src/platform/`: browser adapters (IDs, dev tools; storage and clipboard later).
- `src/hooks/`: shared React hooks (store access, viewport input).
- `src/components/`: React components, one folder per component.
- `src/main.tsx`: app entry point. `src/index.css`: global reset only.

## Code conventions

- **Layout:** logic lives in `src/core`; React code lives in `src/components` and `src/hooks`; browser adapters live in `src/platform`.
- **Components:** each component is a folder `src/components/<kebab-name>/` containing `index.tsx` (a default-exported function component) and `styles.module.css` (CSS Modules, imported as `s`). Do not use inline style objects.
- **Structure:** component folders are flat by default. A sub-component used only by one parent lives in a subfolder of that parent, e.g. `src/components/toolbar/tool-button/`.
- **Core boundary:** `src/core` never imports React, the DOM, `components`, `hooks` or `platform`. `pnpm lint` enforces this.
- **Tests:** Vitest runs only in `node` and only covers pure core logic (`src/**/*.test.ts`). UI is verified manually in the browser.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Vite dev server |
| `pnpm build` | Typecheck, then build the production bundle |
| `pnpm preview` | Serve the production build locally |
| `pnpm typecheck` | Run `tsc -b` across the app, core and node configs |
| `pnpm lint` | Run oxlint, including the core import boundary |
| `pnpm test` | Run the Vitest suite once |

Install dependencies with `pnpm install`.

## Development

In dev builds, `window.iconEditor` exposes `doc()`, `svg()`, `loadFixture()` and `store` for the browser console. It is not installed in production builds.
Shortcuts: `0` fits the artboard, `1` shows 100%, `G` toggles the grid, Space or middle-drag pans, and Ctrl/Cmd+wheel or pinch zooms.
