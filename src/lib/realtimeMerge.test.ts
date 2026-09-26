import { describe, expect, it } from 'vitest';
import { upsertActiveTask } from './realtimeMerge';
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

describe('upsertActiveTask', () => {
  it('inserts a new active row at the correct sorted position', () => {
    const existing = [makeTask({ id: 'a', rank: 0 }), makeTask({ id: 'c', rank: 2 })];
    const incoming = makeTask({ id: 'b', rank: 1 });
    const result = upsertActiveTask(existing, incoming);
    expect(result.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('replaces an existing row rather than duplicating it', () => {
    const existing = [makeTask({ id: 'a', rank: 0, title: 'old title' })];
    const incoming = makeTask({ id: 'a', rank: 0, title: 'new title' });
    const result = upsertActiveTask(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('new title');
  });

  it('re-sorts when an existing row arrives with a changed rank', () => {
    const existing = [makeTask({ id: 'a', rank: 0 }), makeTask({ id: 'b', rank: 1 })];
    const incoming = makeTask({ id: 'a', rank: 5 });
    const result = upsertActiveTask(existing, incoming);
    expect(result.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('removes a task that transitions away from active status', () => {
    const existing = [makeTask({ id: 'a', rank: 0 }), makeTask({ id: 'b', rank: 1 })];
    const incoming = makeTask({ id: 'a', rank: 0, status: 'done' });
    const result = upsertActiveTask(existing, incoming);
    expect(result.map((t) => t.id)).toEqual(['b']);
  });
});
