import type { Task } from './tasks';
import { HOURS_MAX } from './validation';

export type HistoryPreset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek';

/** Local-time range, `to` exclusive. */
export interface DateRange {
  from: Date;
  to: Date;
}

export interface HistoryDay {
  day: string; // local YYYY-MM-DD
  done: Task[];
  dropped: Task[];
  totalHours: number; // sum of done rows' hours_spent
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** Local YYYY-MM-DD of a timestamp (toISOString would give the UTC day instead). */
export function localDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Weeks start Monday. */
export function presetRange(preset: HistoryPreset, now: Date): DateRange {
  const today = startOfDay(now);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  switch (preset) {
    case 'today':
      return { from: today, to: addDays(today, 1) };
    case 'yesterday':
      return { from: addDays(today, -1), to: today };
    case 'thisWeek':
      return { from: monday, to: addDays(monday, 7) };
    case 'lastWeek':
      return { from: addDays(monday, -7), to: monday };
  }
}

/** Both days inclusive, as picked in `<input type="date">` (YYYY-MM-DD); swapped if given in reverse. */
export function customRange(fromIso: string, toIso: string): DateRange {
  const parse = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  let from = parse(fromIso);
  let to = parse(toIso);
  if (from > to) [from, to] = [to, from];
  return { from, to: addDays(to, 1) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Groups closed tasks by the local day they were closed, newest day (and newest task) first. */
export function groupByDay(tasks: Task[]): HistoryDay[] {
  const sorted = tasks
    .filter((t) => t.completed_at)
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime());

  const days = new Map<string, HistoryDay>();
  for (const task of sorted) {
    const day = localDayKey(new Date(task.completed_at!));
    let group = days.get(day);
    if (!group) {
      group = { day, done: [], dropped: [], totalHours: 0 };
      days.set(day, group);
    }
    if (task.status === 'dropped') {
      group.dropped.push(task);
    } else {
      group.done.push(task);
      group.totalHours = round2(group.totalHours + (task.hours_spent ?? 0));
    }
  }
  return [...days.values()];
}

/** Parses the hours input: decimal with `.` or `,`, blank clears it. */
export function parseHours(raw: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return { ok: true, value: null };
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(trimmed)) return { ok: false, error: 'enter hours like 1.5' };
  const value = round2(Number(trimmed));
  if (value <= 0) return { ok: false, error: 'hours must be more than 0' };
  if (value > HOURS_MAX) return { ok: false, error: `at most ${HOURS_MAX} hours` };
  return { ok: true, value };
}
