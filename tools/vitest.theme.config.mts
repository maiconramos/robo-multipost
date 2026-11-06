import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    include: [
      'libraries/helpers/src/utils/theme.spec.ts',
      'apps/frontend/src/components/layout/mode.responsive.spec.tsx',
    ],
    maxWorkers: 1,
    minWorkers: 1,
  },
});
