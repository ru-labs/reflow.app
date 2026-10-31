/**
 * The contract between the app and its data backend. Two implementations
 * (`supabase.ts`, `selfhosted.ts`); `vite.config.ts` aliases `@backend` to the
 * one chosen by VITE_BACKEND so the other never enters the bundle.
 */

/** The only session shape the app uses. Supabase's `Session` is a structural superset. */
export interface AppSession {
  user: { id: string; email?: string | null };
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  note: string | null;
  status: 'active' | 'done' | 'dropped';
  rank: number;
  created_at: string;
  completed_at: string | null;
  last_triaged_on: string; // ISO date, e.g. "2026-08-09"
  tags: string[];
  hours_spent: number | null; // manually entered on the history screen; decimal hours
}

/** Some existing rows predate the `tags` column and have it as null rather than '{}'; `hours_spent` is absent entirely until migration 0006 is applied. */
export function normalizeTask(row: Task): Task {
  return { ...row, tags: row.tags ?? [], hours_spent: row.hours_spent == null ? null : Number(row.hours_spent) };
}

export type ThemePreference = 'system' | 'light' | 'dark';
export type OAuthProvider = 'google' | 'github';

export interface Backend {
  auth: {
    /** Calls `cb` once the initial session is known (null when signed out), then on every change. Returns unsubscribe. */
    onSessionChange(cb: (session: AppSession | null) => void): () => void;
    signIn(email: string, password: string): Promise<{ error: string | null }>;
    signUp(email: string, password: string): Promise<{ error: string | null; confirmationSent: boolean }>;
    signInWithOAuth(provider: OAuthProvider): Promise<{ error: string | null }>;
    signOut(): Promise<{ error: string | null }>;
    supportsOAuth: boolean;
  };
  tasks: {
    listActiveTasks(): Promise<Task[]>;
    createTask(userId: string, title: string, rank: number, tags?: string[]): Promise<Task>;
    updateTaskStatus(taskId: string, status: Task['status']): Promise<void>;
    updateTask(taskId: string, patch: { title?: string; tags?: string[] }): Promise<void>;
    updateTaskRank(taskId: string, rank: number): Promise<void>;
    updateTaskRanks(updates: { id: string; rank: number }[]): Promise<void>;
    markTriaged(taskId: string): Promise<void>;
    hasCompletedToday(): Promise<boolean>;
    listClosedTasks(from: Date, to: Date): Promise<Task[]>;
    updateTaskHours(taskId: string, hours: number | null): Promise<void>;
    lastActiveRank(): Promise<number | null>;
    reopenTask(taskId: string, rank: number): Promise<void>;
  };
  profile: {
    getThemePreference(userId: string): Promise<ThemePreference>;
    setThemePreference(userId: string, theme: ThemePreference): Promise<void>;
  };
  /** Pushes changed task rows for `userId`. `onStatus('stale')` means updates may be missed until it recovers. Returns unsubscribe. */
  subscribeTaskChanges(
    userId: string,
    onRow: (row: Task) => void,
    onStatus: (status: 'live' | 'stale') => void,
  ): () => void;
}
