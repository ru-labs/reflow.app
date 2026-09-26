import { describe, expect, it } from 'vitest';
import { addTag, allKnownTags, normalizeTag, removeTag, suggestTags } from './tags';
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

describe('normalizeTag', () => {
  it('trims, lowercases, and collapses inner whitespace', () => {
    expect(normalizeTag('  Acme   Corp  ')).toBe('acme corp');
  });

  it('strips a leading #', () => {
    expect(normalizeTag('#work')).toBe('work');
  });
});

describe('addTag', () => {
  it('dedupes case-insensitively', () => {
    expect(addTag(['work'], 'Work')).toEqual(['work']);
  });

  it('normalizes a leading # before adding', () => {
    expect(addTag([], '#work')).toEqual(['work']);
  });

  it('ignores empty or whitespace-only input', () => {
    expect(addTag(['work'], '   ')).toEqual(['work']);
  });

  it('rejects a tag over the max length', () => {
    expect(addTag([], 'a'.repeat(31))).toEqual([]);
  });

  it('rejects adding an 11th tag', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `tag${i}`);
    expect(addTag(ten, 'eleventh')).toEqual(ten);
  });
});

describe('removeTag', () => {
  it('removes the given tag', () => {
    expect(removeTag(['work', 'acme'], 'work')).toEqual(['acme']);
  });
});

describe('allKnownTags', () => {
  it('returns the sorted union of every task tag', () => {
    const tasks = [
      makeTask({ tags: ['work', 'acme'] }),
      makeTask({ tags: ['school'] }),
      makeTask({ tags: ['acme'] }),
    ];
    expect(allKnownTags(tasks)).toEqual(['acme', 'school', 'work']);
  });
});

describe('suggestTags', () => {
  const known = ['acme', 'acme-legal', 'work', 'school'];

  it('excludes already-chosen tags', () => {
    expect(suggestTags(known, '', ['work'])).not.toContain('work');
  });

  it('excludes the exact current query', () => {
    expect(suggestTags(known, 'acme', [])).not.toContain('acme');
  });

  it('matches by prefix before substring, and includes substring matches', () => {
    expect(suggestTags(known, 'acme', [])).toEqual(['acme-legal']);
  });

  it('caps suggestions at 6', () => {
    const many = Array.from({ length: 10 }, (_, i) => `tag${i}`);
    expect(suggestTags(many, '', [])).toHaveLength(6);
  });
});
