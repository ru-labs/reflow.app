import { describe, expect, it } from 'vitest';
import { customRange, groupByDay, localDayKey, parseHours, presetRange } from './history';
import type { Task } from './tasks';

// All dates are built in local time; 2026-01-05 is a Monday, 2026-01-11 a Sunday.
const local = (d: number, h = 0, m = 0) => new Date(2026, 0, d, h, m);

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 'id',
    user_id: 'user',
    title: 'task',
    note: null,
    status: 'done',
    rank: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
    last_triaged_on: '2026-01-01',
    tags: [],
    hours_spent: null,
    ...overrides,
  };
}

describe('presetRange', () => {
  it('today spans local midnight to midnight', () => {
    expect(presetRange('today', local(7, 23, 59))).toEqual({ from: local(7), to: local(8) });
  });

  it('today at exactly midnight is still that day', () => {
    expect(presetRange('today', local(7))).toEqual({ from: local(7), to: local(8) });
  });

  it('yesterday is the previous local day', () => {
    expect(presetRange('yesterday', local(7, 10))).toEqual({ from: local(6), to: local(7) });
  });

  it('this week starts on Monday, including when today is Monday', () => {
    expect(presetRange('thisWeek', local(5, 9))).toEqual({ from: local(5), to: local(12) });
  });

  it('this week on a Sunday still belongs to the week that started Monday', () => {
    expect(presetRange('thisWeek', local(11, 22))).toEqual({ from: local(5), to: local(12) });
  });

  it('last week is the Monday-to-Monday before this one', () => {
    expect(presetRange('lastWeek', local(11, 22))).toEqual({ from: new Date(2025, 11, 29), to: local(5) });
  });
});

describe('customRange', () => {
  it('includes the whole end day', () => {
    expect(customRange('2026-01-05', '2026-01-07')).toEqual({ from: local(5), to: local(8) });
  });

  it('swaps a reversed range', () => {
    expect(customRange('2026-01-07', '2026-01-05')).toEqual({ from: local(5), to: local(8) });
  });

  it('handles a single day', () => {
    expect(customRange('2026-01-05', '2026-01-05')).toEqual({ from: local(5), to: local(6) });
  });
});

describe('localDayKey', () => {
  it('uses the local date, not UTC', () => {
    expect(localDayKey(local(5, 0, 30))).toBe('2026-01-05');
    expect(localDayKey(local(5, 23, 30))).toBe('2026-01-05');
  });
});

describe('groupByDay', () => {
  it('groups by local close day, newest day and newest task first, split into done and dropped', () => {
    const tasks = [
      makeTask({ id: 'a', completed_at: local(5, 9).toISOString() }),
      makeTask({ id: 'b', completed_at: local(6, 15).toISOString() }),
      makeTask({ id: 'c', status: 'dropped', completed_at: local(6, 11).toISOString() }),
      makeTask({ id: 'd', completed_at: local(6, 17).toISOString() }),
    ];
    const groups = groupByDay(tasks);
    expect(groups.map((g) => g.day)).toEqual(['2026-01-06', '2026-01-05']);
    expect(groups[0].done.map((t) => t.id)).toEqual(['d', 'b']);
    expect(groups[0].dropped.map((t) => t.id)).toEqual(['c']);
    expect(groups[1].done.map((t) => t.id)).toEqual(['a']);
  });

  it('totals done hours only, ignoring nulls and dropped rows, without float noise', () => {
    const at = local(5, 12).toISOString();
    const groups = groupByDay([
      makeTask({ id: 'a', completed_at: at, hours_spent: 0.1 }),
      makeTask({ id: 'b', completed_at: at, hours_spent: 0.2 }),
      makeTask({ id: 'c', completed_at: at, hours_spent: null }),
      makeTask({ id: 'd', status: 'dropped', completed_at: at, hours_spent: 5 }),
    ]);
    expect(groups[0].totalHours).toBe(0.3);
  });

  it('skips rows without a close date', () => {
    expect(groupByDay([makeTask({ completed_at: null })])).toEqual([]);
  });
});

describe('parseHours', () => {
  it.each([
    ['1.5', 1.5],
    ['1,5', 1.5],
    [' 2 ', 2],
    ['.25', 0.25],
    ['24', 24],
    ['1.234', 1.23],
  ])('accepts %j as %s', (raw, value) => {
    expect(parseHours(raw)).toEqual({ ok: true, value });
  });

  it('treats blank as clearing the value', () => {
    expect(parseHours('')).toEqual({ ok: true, value: null });
    expect(parseHours('   ')).toEqual({ ok: true, value: null });
  });

  it.each(['0', '0.001', '-1', '24.01', 'abc', '1e1', '1.5h', '1,5,0'])('rejects %j', (raw) => {
    expect(parseHours(raw).ok).toBe(false);
  });
});
