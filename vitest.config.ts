import { defineConfig } from 'vitest/config'

// Tests cover pure core logic only (src/core), so they run in plain node.
// UI is verified manually; there is no DOM test environment.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
