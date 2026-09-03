import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /// The database-backed suite needs a Postgres and runs as `npm run test:db`.
    exclude: ['**/node_modules/**', 'src/**/*.db.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
