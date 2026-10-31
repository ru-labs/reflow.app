import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { runMigrations } from './migrate.js';

const pool = createPool(loadConfig().databaseUrl);
try {
  const applied = await runMigrations(pool);
  console.log(applied.length ? `applied: ${applied.join(', ')}` : 'no pending migrations');
} finally {
  await pool.end();
}
