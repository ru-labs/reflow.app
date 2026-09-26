import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { listActiveTasks, createTask, updateTask, updateTaskStatus, updateTaskRanks, markTriaged, hasCompletedToday, normalizeTask, type Task } from '../lib/tasks';
import { rankBetween, renumber } from '../lib/ranking';
import { upsertActiveTask } from '../lib/realtimeMerge';
import { supabase } from '../lib/supabase';
import { DEV_MODE, mockTasksApi } from '../lib/devMock';

/** Network failures (offline, DNS, timeout) surface as TypeError from fetch — distinguish
 * those from a Supabase/Postgrest error response, since only the former is likely to be
 * fixed by simply retrying. */
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

export function describeFailure(action: string, err: unknown): string {
  return isNetworkError(err)
    ? `${action} — check your connection and try again`
    : `${action} — something went wrong on our end, try again in a bit`;
}

export function useTasks(session: Session | null) {
  const userId = session?.user.id;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completedToday, setCompletedToday] = useState(false);
  const [realtimeStale, setRealtimeStale] = useState(false);
  const preReorderTasks = useRef<Task[] | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const fetchTasks = async () => {
      const [data, completed] = await Promise.all([
        DEV_MODE ? mockTasksApi.list() : listActiveTasks(),
        DEV_MODE ? mockTasksApi.hasCompletedToday() : hasCompletedToday(),
      ]);
      setTasks(data);
      setCompletedToday(completed);
    };
    // The first fetch right after sign-in can race the client settling its
    // token against the server, especially on slower mobile connections or a
    // brand-new account — retry a few times with backoff before surfacing
    // a spurious error.
    const retryDelaysMs = [1000, 2000, 3000];
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
      try {
        await fetchTasks();
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        console.error(`reload failed (attempt ${attempt + 1})`, err);
        if (attempt < retryDelaysMs.length) {
          await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
        }
      }
    }
    if (lastErr) {
      setError(describeFailure("couldn't load your tasks", lastErr));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!userId || DEV_MODE) return;

    const channel = supabase
      .channel(`tasks-changes-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return; // the app never deletes rows, only changes status
          // Skip realtime updates during drag to prevent the server's stale ranks from
          // fighting the in-progress visual reorder. commitReorder clears preReorderTasks.
          if (preReorderTasks.current) return;
          setTasks((prev) => upsertActiveTask(prev, normalizeTask(payload.new as Task)));
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeStale(true);
        } else if (status === 'SUBSCRIBED') {
          setRealtimeStale(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function addTask(title: string, tags: string[] = []) {
    if (!session) return;
    const lastRank = tasks.length > 0 ? tasks[tasks.length - 1].rank : null;
    const rank = rankBetween(lastRank, null);
    try {
      const created = DEV_MODE
        ? await mockTasksApi.create(session.user.id, title, rank, tags)
        : await createTask(session.user.id, title, rank, tags);
      setTasks((prev) => [...prev, created]);
    } catch (err) {
      console.error('addTask failed', { rank, tags }, err);
      setError(describeFailure("couldn't add that task", err));
    }
  }

  async function insertTaskAtIndex(title: string, index: number, tags: string[] = []) {
    if (!session) return;
    const before = index > 0 ? tasks[index - 1].rank : null;
    const after = index < tasks.length ? tasks[index].rank : null;
    const rank = rankBetween(before, after);
    try {
      const created = DEV_MODE
        ? await mockTasksApi.create(session.user.id, title, rank, tags)
        : await createTask(session.user.id, title, rank, tags);
      setTasks((prev) => {
        const next = [...prev];
        next.splice(index, 0, created);
        return next;
      });
    } catch (err) {
      console.error('insertTaskAtIndex failed', { index, before, after, rank, tags }, err);
      setError(describeFailure("couldn't place that task", err));
    }
  }

  async function completeTask(id: string): Promise<boolean> {
    const previous = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await (DEV_MODE ? mockTasksApi.updateStatus(id, 'done') : updateTaskStatus(id, 'done'));
      setCompletedToday(true);
      return true;
    } catch (err) {
      setTasks(previous);
      setError(describeFailure("couldn't mark that settled", err));
      return false;
    }
  }

  async function editTask(id: string, patch: { title?: string; tags?: string[] }): Promise<boolean> {
    const previous = tasks;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    try {
      await (DEV_MODE ? mockTasksApi.update(id, patch) : updateTask(id, patch));
      return true;
    } catch (err) {
      setTasks(previous);
      setError(describeFailure("couldn't save that edit", err));
      return false;
    }
  }

  async function dropTask(id: string): Promise<boolean> {
    const previous = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await (DEV_MODE ? mockTasksApi.updateStatus(id, 'dropped') : updateTaskStatus(id, 'dropped'));
      return true;
    } catch (err) {
      setTasks(previous);
      setError(describeFailure("couldn't let that go", err));
      return false;
    }
  }

  function reorderTasks(newOrder: Task[]) {
    if (!preReorderTasks.current) {
      preReorderTasks.current = tasks;
    }
    setTasks(newOrder);
  }

  async function commitReorder() {
    const previous = preReorderTasks.current;
    preReorderTasks.current = null;
    const ranks = renumber(tasks.length);
    const updates = tasks.map((t, i) => ({ id: t.id, rank: ranks[i] }));
    try {
      await (DEV_MODE ? mockTasksApi.updateRanks(updates) : updateTaskRanks(updates));
    } catch (err) {
      if (previous) setTasks(previous);
      setError(describeFailure("couldn't save the new order", err));
    }
  }

  async function keepLeftover(id: string): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10);
    const previous = tasks;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, last_triaged_on: today } : t)));
    try {
      await (DEV_MODE ? mockTasksApi.markTriaged(id) : markTriaged(id));
      return true;
    } catch (err) {
      setTasks(previous);
      setError(describeFailure("couldn't keep that task", err));
      return false;
    }
  }

  return {
    tasks, loading, error, dismissError: () => setError(null), completedToday, realtimeStale,
    addTask, insertTaskAtIndex, completeTask, editTask, dropTask, reorderTasks, commitReorder, keepLeftover, reload,
  };
}
