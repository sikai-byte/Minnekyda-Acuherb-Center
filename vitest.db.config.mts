import path from 'node:path';
import { defineConfig } from 'vitest/config';

/// The database-backed scheduling suite. It shares one Postgres, creates rows under a single
/// namespace and asserts on clinic-wide capacity, so the files run one at a time rather than
/// in parallel workers competing for the same rooms.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.db.test.ts'],
    fileParallelism: false,
    /// Picks up the local `.env` when there is one and leaves CI's own DATABASE_URL alone.
    setupFiles: ['dotenv/config'],
    hookTimeout: 60_000,
    testTimeout: 60_000,
    env: { CLINIC_TIME_ZONE: 'America/Chicago' },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
