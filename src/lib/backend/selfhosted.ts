import { normalizeTask, type AppSession, type Backend, type Task, type ThemePreference } from './types';

/** JSON over fetch to the phase-10 API on our own origin. A non-2xx response throws its `error` message; network failures stay TypeError so `describeFailure()` can tell them apart. */
async function api<T = void>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    // The server refuses non-JSON mutations, so even body-less POSTs send a JSON body.
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? String(res.status));
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const today = () => new Date().toISOString().slice(0, 10);
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

const sessionListeners = new Set<(session: AppSession | null) => void>();
const emitSession = (session: AppSession | null) => sessionListeners.forEach((cb) => cb(session));

async function fetchSession(): Promise<AppSession | null> {
  const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(String(res.status));
  return { user: (await res.json()).user };
}

async function authenticate(path: string, email: string, password: string) {
  const { user } = await api<{ user: { id: string; email: string } }>('POST', path, { email, password });
  emitSession({ user });
}

export const backend = {
  auth: {
    onSessionChange(cb) {
      sessionListeners.add(cb);
      // On failure nothing is emitted; useAuth's timeout surfaces "couldn't verify your session".
      fetchSession()
        .then((session) => sessionListeners.has(cb) && cb(session))
        .catch(() => {});
      return () => void sessionListeners.delete(cb);
    },
    async signIn(email, password) {
      try {
        await authenticate('/auth/signin', email, password);
        return { error: null };
      } catch (err) {
        return { error: messageOf(err) };
      }
    },
    async signUp(email, password) {
      try {
        await authenticate('/auth/signup', email, password);
        // PoC: accounts are auto-confirmed and signed in straight away.
        return { error: null, confirmationSent: false };
      } catch (err) {
        return { error: messageOf(err), confirmationSent: false };
      }
    },
    async signInWithOAuth() {
      return { error: 'not available on this deployment' };
    },
    async signOut() {
      try {
        await api('POST', '/auth/signout', {});
        emitSession(null);
        return { error: null };
      } catch (err) {
        return { error: messageOf(err) };
      }
    },
    supportsOAuth: false,
  },
  tasks: {
    async listActiveTasks() {
      return (await api<Task[]>('GET', '/tasks?status=active')).map(normalizeTask);
    },
    // The session decides the owner, so userId is not sent.
    createTask: (_userId, title, rank, tags = []) => api<Task>('POST', '/tasks', { title, rank, tags }),
    updateTaskStatus(taskId, status) {
      // completed_at means "closed at" — stamped on drop too, so dropped tasks show up in history.
      const closed = status === 'done' || status === 'dropped';
      return api('PATCH', `/tasks/${taskId}`, closed ? { status, completed_at: new Date().toISOString() } : { status });
    },
    updateTask: (taskId, patch) => api('PATCH', `/tasks/${taskId}`, patch),
    updateTaskRank: (taskId, rank) => api('PATCH', `/tasks/${taskId}`, { rank }),
    updateTaskRanks: (updates) => api('PATCH', '/tasks/ranks', { updates }),
    markTriaged: (taskId) => api('PATCH', `/tasks/${taskId}`, { last_triaged_on: today() }),
    async hasCompletedToday() {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { completed } = await api<{ completed: boolean }>(
        'GET',
        `/tasks/completed-since?since=${encodeURIComponent(startOfDay.toISOString())}`,
      );
      return completed;
    },
    async listClosedTasks(from, to) {
      const query = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
      return (await api<Task[]>('GET', `/tasks/closed?${query}`)).map(normalizeTask);
    },
    updateTaskHours: (taskId, hours) => api('PATCH', `/tasks/${taskId}`, { hours_spent: hours }),
    async lastActiveRank() {
      return (await api<{ rank: number | null }>('GET', '/tasks/last-active-rank')).rank;
    },
    reopenTask: (taskId, rank) =>
      api('PATCH', `/tasks/${taskId}`, { status: 'active', completed_at: null, last_triaged_on: today(), rank }),
  },
  profile: {
    async getThemePreference() {
      return (await api<{ theme: ThemePreference }>('GET', '/profile/theme')).theme;
    },
    setThemePreference: (_userId, theme) => api('PUT', '/profile/theme', { theme }),
  },
  subscribeTaskChanges(_userId, onRow, onStatus) {
    const source = new EventSource('/api/tasks/stream');
    source.addEventListener('task', (e) => onRow(JSON.parse((e as MessageEvent<string>).data) as Task));
    source.onopen = () => onStatus('live');
    source.onerror = () => onStatus('stale'); // EventSource reconnects by itself
    return () => source.close();
  },
} satisfies Backend;
