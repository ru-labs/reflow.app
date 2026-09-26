import { useEffect, useMemo, useState } from 'react';
import { listClosedTasks, updateTaskHours, lastActiveRank, reopenTask, type Task } from '../lib/tasks';
import { groupByDay, presetRange, type DateRange } from '../lib/history';
import { rankBetween } from '../lib/ranking';
import { DEV_MODE, mockTasksApi } from '../lib/devMock';
import { describeFailure } from './useTasks';

/** Closed (done + dropped) tasks for a date range, grouped by day, with optimistic hours edits and reopen. */
export function useHistory() {
  const [range, setRange] = useState<DateRange>(() => presetRange('today', new Date()));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false; // a newer range was picked before this response arrived
    setLoading(true);
    setError(null);
    (DEV_MODE ? mockTasksApi.listClosed(range.from, range.to) : listClosedTasks(range.from, range.to))
      .then((data) => {
        if (!stale) setTasks(data);
      })
      .catch((err) => {
        if (stale) return;
        console.error('history load failed', range, err);
        setTasks([]);
        setError(describeFailure("couldn't load your history", err));
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [range]);

  async function setHours(id: string, hours: number | null): Promise<boolean> {
    const previous = tasks;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, hours_spent: hours } : t)));
    try {
      await (DEV_MODE ? mockTasksApi.updateHours(id, hours) : updateTaskHours(id, hours));
      return true;
    } catch (err) {
      setTasks(previous);
      setError(describeFailure("couldn't save those hours", err));
      return false;
    }
  }

  async function reopen(id: string): Promise<boolean> {
    const previous = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      const last = await (DEV_MODE ? mockTasksApi.lastActiveRank() : lastActiveRank());
      const rank = rankBetween(last, null);
      await (DEV_MODE ? mockTasksApi.reopen(id, rank) : reopenTask(id, rank));
      return true;
    } catch (err) {
      setTasks(previous);
      setError(describeFailure("couldn't reopen that task", err));
      return false;
    }
  }

  const days = useMemo(() => groupByDay(tasks), [tasks]);

  return { range, setRange, days, loading, error, dismissError: () => setError(null), setHours, reopen };
}
