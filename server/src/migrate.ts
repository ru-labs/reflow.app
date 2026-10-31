import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from './db.js';

// src/ and dist/ both sit next to migrations/
export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../migrations');

const LOCK_KEY = 727274;

/** Applies pending migrations in filename order, each in its own transaction. Returns the files applied. */
export async function runMigrations(pool: Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    // Session-level lock: two containers starting together can't race.
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(
      'create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now())',
    );
    const done = new Set(
      (await client.query<{ filename: string }>('select filename from schema_migrations')).rows.map((r) => r.filename),
    );
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(dir, file), 'utf8');
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into schema_migrations (filename) values ($1)', [file]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
      applied.push(file);
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
  return applied;
}
