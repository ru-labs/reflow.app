import { supabase } from '../supabase';
import { normalizeTask, type Backend, type OAuthProvider, type Task, type ThemePreference } from './types';

async function listActiveTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'active')
    .order('rank', { ascending: true });

  if (error) throw error;
  return (data as Task[]).map(normalizeTask);
}

/** Creates a task at the given rank. Callers compute the rank (top-level list append, or via the compare mechanic). */
async function createTask(userId: string, title: string, rank: number, tags: string[] = []): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ user_id: userId, title, rank, status: 'active', tags })
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

async function updateTaskStatus(taskId: string, status: Task['status']): Promise<void> {
  const patch: Partial<Task> = { status };
  // completed_at means "closed at" — stamped on drop too, so dropped tasks show up in history.
  if (status === 'done' || status === 'dropped') patch.completed_at = new Date().toISOString();
  const { error } = await supabase.from('tasks').update(patch).eq('id', taskId);
  if (error) throw error;
}

async function updateTask(taskId: string, patch: { title?: string; tags?: string[] }): Promise<void> {
  const { error } = await supabase.from('tasks').update(patch).eq('id', taskId);
  if (error) throw error;
}

async function updateTaskRank(taskId: string, rank: number): Promise<void> {
  const { error } = await supabase.from('tasks').update({ rank }).eq('id', taskId);
  if (error) throw error;
}

/** Bulk rank update used after a full manual reorder (Phase 5). */
async function updateTaskRanks(updates: { id: string; rank: number }[]): Promise<void> {
  await Promise.all(updates.map((u) => updateTaskRank(u.id, u.rank)));
}

async function markTriaged(taskId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from('tasks').update({ last_triaged_on: today }).eq('id', taskId);
  if (error) throw error;
}

/** Whether the signed-in user has completed at least one task today — used to tell a genuine "cleared my list" moment apart from a brand-new account with nothing completed yet. */
async function hasCompletedToday(): Promise<boolean> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'done')
    .gte('completed_at', startOfDay.toISOString());

  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Done and dropped tasks closed within [from, to), newest first — backs the history screen. */
async function listClosedTasks(from: Date, to: Date): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .in('status', ['done', 'dropped'])
    .gte('completed_at', from.toISOString())
    .lt('completed_at', to.toISOString())
    .order('completed_at', { ascending: false });

  if (error) throw error;
  return (data as Task[]).map(normalizeTask);
}

async function updateTaskHours(taskId: string, hours: number | null): Promise<void> {
  const { error } = await supabase.from('tasks').update({ hours_spent: hours }).eq('id', taskId);
  if (error) throw error;
}

/** Rank of the last active task, or null when the list is empty — used to append a reopened task to the bottom. */
async function lastActiveRank(): Promise<number | null> {
  const { data, error } = await supabase
    .from('tasks')
    .select('rank')
    .eq('status', 'active')
    .order('rank', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data.length > 0 ? (data[0] as { rank: number }).rank : null;
}

/** Moves a closed task back onto today's active list at the given rank, marked triaged so it isn't flagged as a leftover. */
async function reopenTask(taskId: string, rank: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'active', completed_at: null, last_triaged_on: today, rank })
    .eq('id', taskId);
  if (error) throw error;
}

async function getThemePreference(userId: string): Promise<ThemePreference> {
  const { data, error } = await supabase
    .from('profiles')
    .select('theme_preference')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data?.theme_preference as ThemePreference | undefined) ?? 'system';
}

async function setThemePreference(userId: string, theme: ThemePreference): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: userId, theme_preference: theme });

  if (error) throw error;
}

async function signInWithOAuth(provider: OAuthProvider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  return { error: error?.message ?? null };
}

export const backend = {
  auth: {
    // Deliberately not using getSession() to seed initial state: it reads
    // straight from local storage and can resolve before the client has
    // validated/refreshed the token against the server, which raced a
    // PostgREST request into an RLS rejection right after sign-in. The
    // INITIAL_SESSION event from onAuthStateChange only fires once the
    // client has settled on a real, validated session (or confirmed there
    // isn't one), so it's the only signal `loading` should key off.
    onSessionChange(cb) {
      const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => cb(newSession));
      return () => listener.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    async signUp(email, password) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      return { error: error?.message ?? null, confirmationSent: !error && !data.session };
    },
    signInWithOAuth,
    async signOut() {
      const { error } = await supabase.auth.signOut();
      return { error: error?.message ?? null };
    },
    supportsOAuth: true,
  },
  tasks: {
    listActiveTasks,
    createTask,
    updateTaskStatus,
    updateTask,
    updateTaskRank,
    updateTaskRanks,
    markTriaged,
    hasCompletedToday,
    listClosedTasks,
    updateTaskHours,
    lastActiveRank,
    reopenTask,
  },
  profile: { getThemePreference, setThemePreference },
  subscribeTaskChanges(userId, onRow, onStatus) {
    const channel = supabase
      .channel(`tasks-changes-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return; // the app never deletes rows, only changes status
          onRow(payload.new as Task);
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onStatus('stale');
        } else if (status === 'SUBSCRIBED') {
          onStatus('live');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  },
} satisfies Backend;
