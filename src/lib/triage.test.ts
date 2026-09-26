import { describe, expect, it } from 'vitest';
import { isLeftover, getLeftoverTasks } from './triage';
import type { Task } from './tasks';

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 'id',
    user_id: 'user',
    title: 'task',
    note: null,
    status: 'active',
    rank: 0,
    created_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    last_triaged_on: '2026-08-01',
    tags: [],
    hours_spent: null,
    ...overrides,
  };
}

describe('isLeftover', () => {
  it('is true when last_triaged_on is before today', () => {
    expect(isLeftover(makeTask({ last_triaged_on: '2026-08-08' }), '2026-08-09')).toBe(true);
  });

  it('is false when last_triaged_on is today', () => {
    expect(isLeftover(makeTask({ last_triaged_on: '2026-08-09' }), '2026-08-09')).toBe(false);
  });

  it('is false when last_triaged_on is in the future (clock skew safety)', () => {
    expect(isLeftover(makeTask({ last_triaged_on: '2026-08-10' }), '2026-08-09')).toBe(false);
  });
});

describe('getLeftoverTasks', () => {
  it('filters a mixed list down to only the leftovers', () => {
    const tasks = [
      makeTask({ id: '1', last_triaged_on: '2026-08-07' }),
      makeTask({ id: '2', last_triaged_on: '2026-08-09' }),
      makeTask({ id: '3', last_triaged_on: '2026-08-08' }),
    ];
    const result = getLeftoverTasks(tasks, '2026-08-09');
    expect(result.map((t) => t.id)).toEqual(['1', '3']);
  });
});
