# Phase 11 — Frontend: build-time backend switch

Outcome: `npm run build` produces **the same Supabase app as today**.
`npm run build:selfhosted` produces an app that talks only to `/api` on its
own origin, with no supabase-js in the bundle.

**Agent: hard requirements**
1. Default build (no `VITE_BACKEND`, or `supabase`): behaviour unchanged. Existing unit tests pass untouched.
2. Self-hosted build: the output contains no `@supabase/supabase-js` code and doesn't need any `VITE_SUPABASE_*` variable. Note that `src/lib/supabase.ts` **throws at import time** when those vars are missing, so it must not even be imported in that build.
3. Callers change minimally. Components keep importing from `lib/tasks` and `lib/theme`.
4. `VITE_DEV_MODE` / `devMock.ts` keeps working in both builds.

## Shared contract

- [ ] **[agent]** `src/lib/backend/types.ts`:
  - `AppSession = { user: { id: string; email: string | null } }`. This is the only session shape the app uses (`session.user.id`); Supabase's `Session` is structurally a superset.
  - `Backend` interface with `auth` (`onSessionChange(cb) → unsubscribe`, `signIn`, `signUp → {error, confirmationSent}`, `signInWithOAuth(provider)`, `signOut`, `supportsOAuth: boolean`), `tasks` (the 12 functions currently in `tasks.ts`, same signatures), `profile` (`getThemePreference`, `setThemePreference`), and `subscribeTaskChanges(userId, onRow, onStatus: (s: 'live'|'stale') => void) → unsubscribe`.

## Supabase implementation (pure move, no behaviour change)

- [ ] **[agent]** `src/lib/backend/supabase.ts` implements `Backend`: move the bodies of the 12 functions from `tasks.ts` and the 2 from `theme.ts` verbatim. Wrap `supabase.auth.*` from `useAuth.ts` (keep the `onAuthStateChange`/`INITIAL_SESSION` semantics and the comment explaining them). Move the `postgres_changes` channel from `useTasks.ts`, mapping `CHANNEL_ERROR`/`TIMED_OUT` → `stale` and `SUBSCRIBED` → `live`.
- [ ] **[agent]** End the object with `satisfies Backend`.

## Self-hosted implementation

- [ ] **[agent]** `src/lib/backend/selfhosted.ts` implements `Backend` with `fetch` against the phase-10 routes (`credentials: 'same-origin'`, JSON). A non-2xx response throws `new Error(body.error ?? status)`. Network failures stay `TypeError` naturally, so `describeFailure()` in `useTasks` keeps distinguishing "check your connection" from server errors.
- [ ] **[agent]** `onSessionChange`: call `GET /api/auth/session` once on subscribe and emit the result (401 → `null`). Re-emit after signIn/signUp/signOut. Keep the 10 s timeout behaviour in `useAuth` working.
- [ ] **[agent]** `signUp` returns `confirmationSent: false` (auto-confirm in the PoC). `supportsOAuth: false`.
- [ ] **[agent]** `subscribeTaskChanges`: `new EventSource('/api/tasks/stream')`, listening to the `task` event → `onRow(JSON)`. `onopen` → `live`. `onerror` → `stale` (EventSource reconnects by itself).
- [ ] **[agent]** `hasCompletedToday` computes local midnight in the browser (as today) and calls `completed-since`. `markTriaged`/`reopenTask` keep computing `today` client-side and send it in the PATCH.
- [ ] **[agent]** End with `satisfies Backend`.

## Wiring the switch

- [ ] **[agent]** `vite.config.ts`: read `VITE_BACKEND` via `loadEnv(mode, …)` (default `supabase`) and add `resolve.alias` `'@backend'` → `src/lib/backend/<value>.ts`. Only the chosen file enters the module graph, which satisfies requirement 2. Also add `server.proxy: { '/api': 'http://localhost:3000' }` for local dev (the dev server only, so it has no effect on builds).
- [ ] **[agent]** `tsconfig.app.json` `paths`: `"@backend": ["./src/lib/backend/supabase.ts"]` for type-checking. `selfhosted.ts` is still type-checked as a normal file via its `satisfies Backend`.
- [ ] **[agent]** `src/lib/tasks.ts`: keep `Task` and `normalizeTask`, and re-export the 12 functions from `@backend` under the same names. `src/lib/theme.ts`: same for its 2. No component or hook import paths change.
- [ ] **[agent]** `useAuth.ts`: replace `supabase.auth.*` with `backend.auth.*`. `useTasks.ts`: replace the channel block with `backend.subscribeTaskChanges(...)`, keeping the "skip while `preReorderTasks` is set" and `DELETE`-ignore logic.
- [ ] **[agent]** Replace `import type { Session } from '@supabase/supabase-js'` with `AppSession` in `useAuth.ts`, `useTasks.ts`, `pages/Today.tsx`, `lib/devMock.ts` (and anywhere else `grep -rn "@supabase" src` finds outside `backend/supabase.ts` and `lib/supabase.ts`).
- [ ] **[agent]** `pages/Auth.tsx`: hide the Google/GitHub buttons when `!backend.auth.supportsOAuth`.
- [ ] **[agent]** `App.tsx`: render Vercel `<Analytics />` only when `import.meta.env.VITE_BACKEND !== 'selfhosted'` (it would 404 off Vercel).
- [ ] **[agent]** Commit a non-secret `.env.selfhosted` containing only `VITE_BACKEND=selfhosted`, plus a `!.env.selfhosted` negation in `.gitignore` (which ignores `.env*`). Add the script `"build:selfhosted": "tsc -b && vite build --mode selfhosted"`. Document `VITE_BACKEND` in `.env.example`.

## Verification

- [ ] **[agent]** `npm run test && npm run lint && npm run build` is green.
- [ ] **[agent]** After the default build: `grep -rl "/api/tasks" dist` finds **nothing** (the self-hosted code isn't in the prod bundle).
- [ ] **[agent]** After `npm run build:selfhosted`: `grep -rl "supabase" dist/assets` finds **nothing**.
- [ ] **[agent]** `VITE_DEV_MODE=true npm run dev` still shows the seeded mock tasks.
- [ ] **[agent + you]** Local end-to-end: tunnel up, `npm run dev` in `server/`, and `npx vite --mode selfhosted` at the root. Then in the browser: sign up → add task → add a second task via the compare duel → drag-reorder → complete one → drop one → History shows both, enter hours → switch theme, reload, theme persists → sign out/in. Open a second browser profile signed in as the same user: changes appear there without a reload (SSE).
- [ ] **[agent]** Run the `docs-maintenance` skill (ARCHITECTURE.md: the backend switch; CLAUDE.md: `server/`, `src/lib/backend/`, and the "no custom backend server" line now needing a PoC caveat).
- [ ] **[agent]** Commit. Session log line, then move this file to `archive/`.
