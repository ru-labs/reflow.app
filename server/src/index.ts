import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { runMigrations } from './migrate.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);

if (config.runMigrations) {
  const applied = await runMigrations(pool);
  if (applied.length) console.log(`migrations applied: ${applied.join(', ')}`);
}

const app = await buildApp({ config, pool });
await app.listen({ port: config.port, host: '0.0.0.0' });

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
