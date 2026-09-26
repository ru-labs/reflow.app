import type { Task } from './tasks';

/**
 * Dev-only mock session and seed data, used to reach authenticated screens
 * (Today, MorningFlow, CompareDuel) in local browser automation without a
 * real Supabase login. Active only when VITE_DEV_MODE=true; never bundled
 * into a path that runs against production credentials.
 */
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true';

const DEV_USER_ID = 'dev-mock-user';

export const mockSession = {
  user: { id: DEV_USER_ID, email: 'dev@reflow.local' },
  access_token: 'dev-mock-token',
} as unknown as import('@supabase/supabase-js').Session;

const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);

let mockTasks: Task[] = [
  { id: 'mock-1', user_id: DEV_USER_ID, title: 'ship the quarterly report', note: null, status: 'active', rank: 100, created_at: yesterday, completed_at: null, last_triaged_on: today, tags: [], hours_spent: null },
  { id: 'mock-2', user_id: DEV_USER_ID, title: 'review pull request from priya', note: null, status: 'active', rank: 200, created_at: yesterday, completed_at: null, last_triaged_on: today, tags: [], hours_spent: null },
  { id: 'mock-3', user_id: DEV_USER_ID, title: 'call the dentist back', note: null, status: 'active', rank: 300, created_at: today, completed_at: null, last_triaged_on: today, tags: [], hours_spent: null },
  { id: 'mock-4', user_id: DEV_USER_ID, title: 'prep slides for 2pm sync', note: null, status: 'active', rank: 400, created_at: today, completed_at: null, last_triaged_on: today, tags: [], hours_spent: null },
  { id: 'mock-5', user_id: DEV_USER_ID, title: 'reply to legal about the vendor contract', note: null, status: 'active', rank: 500, created_at: today, completed_at: null, last_triaged_on: today, tags: [], hours_spent: null },
  { id: 'mock-6', user_id: DEV_USER_ID, title: 'onboard the new hire on the data pipeline', note: null, status: 'active', rank: 600, created_at: today, completed_at: null, last_triaged_on: today, tags: [], hours_spent: null },
  { id: 'mock-7', user_id: DEV_USER_ID, title: 'still open: finish the migration doc', note: null, status: 'active', rank: 700, created_at: yesterday, completed_at: null, last_triaged_on: yesterday, tags: [], hours_spent: null },
  { id: 'mock-8', user_id: DEV_USER_ID, title: 'still open: follow up with finance on budget', note: null, status: 'active', rank: 800, created_at: yesterday, completed_at: null, last_triaged_on: yesterday, tags: [], hours_spent: null },
  ...closedSeeds(),
];

/** Done/dropped rows spread over the last ~10 days, so the history screen has something to show. */
function closedSeeds(): Task[] {
  const at = (daysAgo: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 15, 0, 0);
    return d.toISOString();
  };
  const closed = (id: string, title: string, status: 'done' | 'dropped', openedDaysAgo: number, closedDaysAgo: number, hour: number, tags: string[], hours: number | null): Task => ({
    id, user_id: DEV_USER_ID, title, note: null, status, rank: 0,
    created_at: at(openedDaysAgo, 9), completed_at: at(closedDaysAgo, hour),
    last_triaged_on: at(closedDaysAgo, hour).slice(0, 10), tags, hours_spent: hours,
  });
  return [
    closed('mock-h1', 'answer the morning support queue', 'done', 0, 0, 10, ['support'], 1),
    closed('mock-h2', 'fix login redirect bug', 'done', 1, 1, 11, ['acme'], 2.5),
    closed('mock-h3', 'write release notes for 2.4', 'done', 2, 1, 15, [], null),
    closed('mock-h4', 'retro with the platform team', 'dropped', 2, 2, 14, [], null),
    closed('mock-h5', 'estimate the reporting epic', 'done', 4, 3, 16, ['acme'], null),
    closed('mock-h6', 'clean up stale feature flags', 'done', 6, 5, 12, [], 0.75),
    closed('mock-h7', 'draft q4 hiring plan', 'dropped', 8, 7, 17, [], null),
    closed('mock-h8', 'pair with sam on the csv importer', 'done', 9, 9, 13, ['acme'], 3),
  ];
}

let mockCompletedToday = false;

export const mockTasksApi = {
  list: async (): Promise<Task[]> => mockTasks.filter((t) => t.status === 'active').sort((a, b) => a.rank - b.rank),
  create: async (userId: string, title: string, rank: number, tags: string[] = []): Promise<Task> => {
    const created: Task = {
      id: `mock-${Date.now()}`, user_id: userId, title, note: null,
      status: 'active', rank, created_at: today, completed_at: null, last_triaged_on: today,
      tags, hours_spent: null,
    };
    mockTasks = [...mockTasks, created];
    return created;
  },
  update: async (taskId: string, patch: { title?: string; tags?: string[] }): Promise<void> => {
    mockTasks = mockTasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t));
  },
  updateStatus: async (taskId: string, status: Task['status']): Promise<void> => {
    mockTasks = mockTasks.map((t) => (t.id === taskId ? { ...t, status, completed_at: status === 'done' || status === 'dropped' ? new Date().toISOString() : t.completed_at } : t));
    if (status === 'done') mockCompletedToday = true;
  },
  updateRanks: async (updates: { id: string; rank: number }[]): Promise<void> => {
    const byId = new Map(updates.map((u) => [u.id, u.rank]));
    mockTasks = mockTasks.map((t) => (byId.has(t.id) ? { ...t, rank: byId.get(t.id)! } : t));
  },
  markTriaged: async (taskId: string): Promise<void> => {
    mockTasks = mockTasks.map((t) => (t.id === taskId ? { ...t, last_triaged_on: today } : t));
  },
  hasCompletedToday: async (): Promise<boolean> => mockCompletedToday,
  listClosed: async (from: Date, to: Date): Promise<Task[]> =>
    mockTasks
      .filter((t) => t.status !== 'active' && t.completed_at && new Date(t.completed_at) >= from && new Date(t.completed_at) < to)
      .sort((a, b) => b.completed_at!.localeCompare(a.completed_at!)),
  updateHours: async (taskId: string, hours: number | null): Promise<void> => {
    mockTasks = mockTasks.map((t) => (t.id === taskId ? { ...t, hours_spent: hours } : t));
  },
  lastActiveRank: async (): Promise<number | null> => {
    const ranks = mockTasks.filter((t) => t.status === 'active').map((t) => t.rank);
    return ranks.length > 0 ? Math.max(...ranks) : null;
  },
  reopen: async (taskId: string, rank: number): Promise<void> => {
    mockTasks = mockTasks.map((t) => (t.id === taskId ? { ...t, status: 'active', completed_at: null, last_triaged_on: today, rank } : t));
  },
};
