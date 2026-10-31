export interface Config {
  databaseUrl: string;
  port: number;
  cookieSecure: boolean;
  sessionTtlDays: number;
  authRateLimitPerMin: number; // 0 disables
  runMigrations: boolean;
  appVersion: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  return {
    databaseUrl: env.DATABASE_URL,
    port: Number(env.PORT ?? 3000),
    cookieSecure: env.COOKIE_SECURE !== 'false',
    sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 30),
    authRateLimitPerMin: Number(env.AUTH_RATE_LIMIT_PER_MIN ?? 10),
    runMigrations: env.RUN_MIGRATIONS !== 'false',
    appVersion: env.APP_VERSION ?? 'dev',
  };
}
