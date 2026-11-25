import { defineConfig } from 'vitest/config'

// Tests run in plain Node, without a DOM test environment.
// Rendered UI is verified manually.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
