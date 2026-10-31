import pg from 'pg';

// Match the shapes PostgREST returns today: `date` as "YYYY-MM-DD" (not a JS Date
// at local midnight) and `numeric` (hours_spent) as a JSON number.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => parseFloat(v));

export type Pool = pg.Pool;

export function createPool(connectionString: string): Pool {
  return new pg.Pool({ connectionString, max: 20 });
}
