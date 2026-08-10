import { defineConfig } from 'vitest/config'

// Separate from vite.config.js on purpose — that one defines __BUILD_ID__ and the
// PWA plugin, neither of which tests need, and pulling them in just slows every run.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 15000,   // rules tests talk to the emulator over HTTP; give them room
    hookTimeout: 20000,
  },
})
