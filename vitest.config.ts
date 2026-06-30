import { defineConfig } from 'vitest/config';

// The gait core (src/gait) is pure TypeScript with no React Native imports,
// so it is tested with vitest in a plain node environment — fast and decoupled
// from the Expo/RN version matrix. Component/integration tests (later phases)
// will use jest-expo separately.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
