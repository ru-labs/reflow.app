// Loads server/.env (gitignored) when present; in CI the variables come from the environment.
try {
  process.loadEnvFile('.env');
} catch {
  // no .env file
}
