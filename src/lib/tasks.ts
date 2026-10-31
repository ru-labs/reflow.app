import { backend } from '@backend';

// The data layer is chosen at build time (VITE_BACKEND, see vite.config.ts); callers import from here regardless.
export { normalizeTask, type Task } from './backend/types';

export const {
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
} = backend.tasks;
