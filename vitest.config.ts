import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@backend': fileURLToPath(new URL('./src/lib/backend/supabase.ts', import.meta.url)) },
  },
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'server/**'],
  },
});
