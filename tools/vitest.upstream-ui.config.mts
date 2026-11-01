import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    include: [
      'apps/frontend/src/components/preview/preview.text.spec.tsx',
      'apps/frontend/src/components/new-launch/*.responsive.spec.tsx',
      'apps/frontend/src/components/ui/*.responsive.spec.tsx',
      'apps/frontend/src/components/layout/*.responsive.spec.tsx',
      'apps/frontend/src/components/notifications/*.responsive.spec.tsx',
      'apps/frontend/src/components/launches/calendar.display.spec.ts',
      'apps/frontend/src/components/launches/*.responsive.spec.tsx',
      'apps/frontend/src/components/launches/helpers/dnd.provider.spec.tsx',
      'apps/frontend/src/components/launches/helpers/date.picker.responsive.spec.tsx',
      'apps/frontend/src/components/launches/helpers/calendar.dates.spec.ts',
    ],
    maxWorkers: 1,
    minWorkers: 1,
  },
});
