**In general:**

- Speak in plain language. Avoid jargon and unnecessarily technical or loaded descriptors.
- When asking questions, ask them one at a time.
- Always run `pnpm check`/`pnpm lint`/`pnpm format` before completing your work.

**When working in typescript:**

- Never manually edit lockfiles. Generate dependency and resolution changes with package-manager commands.
- When adding a package to a project, add it with an install command instead of manually editing `package.json` directly.
- Run check/format/lint commands when you’re done making a change. If they don't exist, suggest making them for the project you're in.
- Avoid explicit return types unless absolutely needed.
- Casting with `as any` should be a last resort. Always use real type safety. Lean on type inference instead of manually writing new types.
- Avoid running the `dev` command. If you really need to, ask first.
