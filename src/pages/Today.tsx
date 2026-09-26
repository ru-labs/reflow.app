import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTasks } from '../hooks/useTasks';
import { useAuth } from '../hooks/useAuth';
import { useCompareInsertion } from '../hooks/useCompareInsertion';
import { useMorningFlow } from '../hooks/useMorningFlow';
import { useRolloverPrompt } from '../hooks/useRolloverPrompt';
import { useToast } from '../hooks/useToast';
import { TaskList } from '../components/TaskList';
import { AddTaskFab } from '../components/AddTaskFab';
import { CompareDuel } from '../components/CompareDuel';
import { MorningFlow } from '../components/MorningFlow';
import { TaskModal } from '../components/TaskModal';
import { TaskListSkeleton } from '../components/TaskListSkeleton';
import { InstallPrompt } from '../components/InstallPrompt';
import { ToastContainer } from '../components/Toast';
import { UpdateBanner } from '../components/UpdateBanner';
import { forceReloadApp } from '../hooks/useAppUpdate';
import { Mark } from '../components/icons/Mark';
import { Refresh } from '../components/icons/Refresh';
import { Clock } from '../components/icons/Clock';
import { SignOut } from '../components/icons/SignOut';
import { ThemeToggle } from '../components/icons/ThemeToggle';
import type { Task } from '../lib/tasks';
import { allKnownTags } from '../lib/tags';

export function Today({ session, isDark, toggleTheme }: { session: Session; isDark: boolean; toggleTheme: () => void }) {
  const {
    tasks, loading, error, dismissError, completedToday, realtimeStale, addTask, completeTask, editTask, dropTask,
    reorderTasks, commitReorder, insertTaskAtIndex, keepLeftover,
  } = useTasks(session);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [failedRowId, setFailedRowId] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const { toasts, showToast, removeToast } = useToast();

  async function handleComplete(id: string) {
    const ok = await completeTask(id);
    if (ok) {
      showToast('settled', 'success');
    } else {
      setFailedRowId(id);
      window.setTimeout(() => setFailedRowId((current) => (current === id ? null : current)), 2000);
    }
  }

  async function handleDrop(id: string) {
    const ok = await dropTask(id);
    if (ok) {
      showToast('let go', 'success');
    } else {
      setFailedRowId(id);
      window.setTimeout(() => setFailedRowId((current) => (current === id ? null : current)), 2000);
    }
  }

  async function handleInsertTaskAtIndex(title: string, index: number, tags?: string[]) {
    await insertTaskAtIndex(title, index, tags);
    const position = index + 1;
    const total = tasks.length + 1;
    showToast(`task added — #${position} of ${total}`, 'success');
  }
  const { signOut, signingOut, sessionError, dismissSessionError } = useAuth();

  // Surface task and session errors as toasts instead of inline banners
  const shownError = useRef<string | null>(null);
  useEffect(() => {
    if (error && error !== shownError.current) {
      shownError.current = error;
      showToast(error, 'error');
      dismissError();
    } else if (!error) {
      shownError.current = null;
    }
  }, [error, showToast, dismissError]);

  const shownSessionError = useRef<string | null>(null);
  useEffect(() => {
    if (sessionError && sessionError !== shownSessionError.current) {
      shownSessionError.current = sessionError;
      showToast(sessionError, 'error');
      dismissSessionError();
    } else if (!sessionError) {
      shownSessionError.current = null;
    }
  }, [sessionError, showToast, dismissSessionError]);

  const { pendingTitle, candidate, active, progress, begin, decide } = useCompareInsertion({
    tasks,
    onInsert: handleInsertTaskAtIndex,
  });

  const morning = useMorningFlow({ tasks, keepLeftover, dropTask, addTask });
  const rollover = useRolloverPrompt(tasks);
  const knownTags = allKnownTags(tasks);

  const keptCount = tasks.filter((t) => t.last_triaged_on === new Date().toISOString().slice(0, 10)).length;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const allClear = tasks.length === 0 && completedToday;

  return (
    <>
    {createPortal(
      <AnimatePresence>
        {morning.active && (
          <motion.div
            className="flow-mount"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 } }}
            exit={{ opacity: 0, y: 16, transition: { duration: 0.22, ease: 'easeIn' } }}
          >
            <MorningFlow
              step={morning.step as 'leftover' | 'braindump' | 'merge'}
              currentLeftover={morning.currentLeftover}
              remaining={morning.remaining}
              tasks={tasks}
              keptCount={keptCount}
              leftoverError={morning.leftoverError}
              onResolveLeftover={morning.resolveLeftover}
              onAddBrainDumpTask={morning.addBrainDumpTask}
              onFinishBrainDump={morning.finishBrainDump}
              onComplete={completeTask}
              onDrop={dropTask}
              onReorder={reorderTasks}
              onReorderCommit={commitReorder}
              onFinishMerge={morning.finishMerge}
              onClose={morning.close}
            />
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
    )}

    <div className="today-shell">
      <aside className="today-rail">
        <div className="brand-lockup">
          <Mark className="brand-lockup-mark" aria-hidden="true" />
          <span className="wordmark">reflow</span>
        </div>
        <div className="day-meta">
          <span className="date">{today.toLowerCase()}</span>
          {!loading && <span className="count">{allClear ? 'all clear' : `${tasks.length} today`}</span>}
        </div>
        {!loading && (
          <div className="rail-glance">
            <span className="rail-glance-label">up next</span>
            <span className="rail-glance-task">{tasks.length > 0 ? tasks[0].title : 'nothing queued'}</span>
          </div>
        )}
        <div className="rail-spacer" />
        <button
          className="rail-theme-toggle"
          aria-label={isDark ? 'switch to light mode' : 'switch to dark mode'}
          onClick={toggleTheme}
        >
          <ThemeToggle isDark={isDark} />
        </button>
        <button className="rail-action" onClick={morning.start}>start my day</button>
        <button className="rail-action" onClick={() => (window.location.hash = '#/history')}>history</button>
        <button className="rail-signout" onClick={signOut} disabled={signingOut}>
          {signingOut ? 'signing out…' : 'sign out'}
        </button>
      </aside>

      <header className="today-header-mobile">
        <div className="brand-lockup">
          <Mark className="brand-lockup-mark" aria-hidden="true" />
          <span className="wordmark">reflow</span>
        </div>
        <div className="header-right">
          {!loading && <span className="count-chip">{allClear ? 'all clear' : `${tasks.length} today`}</span>}
          <button
            className="header-signout"
            aria-label="history"
            onClick={() => (window.location.hash = '#/history')}
          >
            <Clock width={20} height={20} />
          </button>
          <button
            className="header-signout"
            aria-label="reload app"
            disabled={reloading}
            onClick={() => {
              setReloading(true);
              window.setTimeout(forceReloadApp, 600);
            }}
          >
            <Refresh width={20} height={20} className={reloading ? 'spin' : undefined} />
          </button>
          <button
            className="header-signout"
            aria-label={isDark ? 'switch to light mode' : 'switch to dark mode'}
            onClick={toggleTheme}
          >
            <ThemeToggle isDark={isDark} width={20} height={20} />
          </button>
          <button
            className="header-signout"
            aria-label={signingOut ? 'signing out' : 'sign out'}
            onClick={signOut}
            disabled={signingOut}
          >
            <SignOut width={20} height={20} className={signingOut ? 'spin' : undefined} />
          </button>
        </div>
      </header>

      <main className="today-main">
        {realtimeStale && (
          <div className="realtime-stale-banner" role="status">
            live updates paused — changes may not sync until you reload
          </div>
        )}
        {rollover.hasLeftovers && !rollover.dismissed && (
          <div className="rollover-banner">
            <button className="rollover-prompt" onClick={morning.start}>
              still open from before — start my day?
            </button>
            <button className="rollover-dismiss" onClick={rollover.dismiss}>not now</button>
          </div>
        )}
        <div className="list-heading-row">
          <div>
            <h1 className="list-heading">today</h1>
            {!loading && (
              <p className="list-sub">
                {allClear ? "today's settled." : `${tasks.length} thing${tasks.length === 1 ? '' : 's'}, in order.`}
              </p>
            )}
          </div>
          {!loading && tasks.length > 0 && (
            <div className="list-heading-glance">
              <span className="list-heading-glance-label">up next</span>
              <span className="list-heading-glance-task">{tasks[0].title}</span>
            </div>
          )}
        </div>
        {loading || reloading ? (
          <TaskListSkeleton />
        ) : (
          <TaskList
            tasks={tasks}
            onComplete={handleComplete}
            onDrop={handleDrop}
            onReorder={reorderTasks}
            onReorderCommit={commitReorder}
            onEdit={setEditingTask}
            dimmed={active}
            failedRowId={failedRowId}
          />
        )}
      </main>

    </div>

    <AnimatePresence>
      {editingTask && (
        <TaskModal
          mode="edit"
          initial={{ title: editingTask.title, tags: editingTask.tags }}
          knownTags={knownTags}
          onSubmit={async (values) => {
            const ok = await editTask(editingTask.id, values);
            if (ok) {
              showToast('saved', 'success');
              setEditingTask(null);
            }
            return ok;
          }}
          onClose={() => setEditingTask(null)}
        />
      )}
    </AnimatePresence>

    {/* Fixed-position overlays are portaled to body so they escape the page
        transition's transform on .screen-frame — a transformed ancestor turns
        position:fixed into position:absolute, which would misplace them. */}
    {createPortal(
      <>
        <AnimatePresence>
          {active && candidate && pendingTitle && (
            <CompareDuel candidate={candidate} newTaskTitle={pendingTitle} progress={progress} onDecide={decide} />
          )}
        </AnimatePresence>
        <AddTaskFab onAdd={begin} knownTags={knownTags} disabled={active} />
        <InstallPrompt taskCount={tasks.length} />
        <ToastContainer toasts={toasts} onDismiss={removeToast} />
        <UpdateBanner />
      </>,
      document.body,
    )}
    </>
  );
}
