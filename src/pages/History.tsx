import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHistory } from '../hooks/useHistory';
import { useToast } from '../hooks/useToast';
import { HistoryRow } from '../components/HistoryRow';
import { EmptyState } from '../components/EmptyState';
import { TaskListSkeleton } from '../components/TaskListSkeleton';
import { ToastContainer } from '../components/Toast';
import { ChevronLeft } from '../components/icons/ChevronLeft';
import { customRange, localDayKey, presetRange, type HistoryPreset } from '../lib/history';

type RangeChoice = HistoryPreset | 'custom';

const CHOICES: { value: RangeChoice; label: string }[] = [
  { value: 'today', label: 'today' },
  { value: 'yesterday', label: 'yesterday' },
  { value: 'thisWeek', label: 'this week' },
  { value: 'lastWeek', label: 'last week' },
  { value: 'custom', label: 'custom' },
];

const formatHours = (h: number) => `${h}h`;

function formatDayHeading(day: string): string {
  const today = localDayKey(new Date());
  const yesterday = localDayKey(new Date(Date.now() - 86400000));
  const [y, m, d] = day.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).toLowerCase();
  if (day === today) return `today · ${label}`;
  if (day === yesterday) return `yesterday · ${label}`;
  return label;
}

export function History() {
  const { setRange, days, loading, error, dismissError, setHours, reopen } = useHistory();
  const { toasts, showToast, removeToast } = useToast();
  const [choice, setChoice] = useState<RangeChoice>('today');
  const todayKey = localDayKey(new Date());
  const [customFrom, setCustomFrom] = useState(todayKey);
  const [customTo, setCustomTo] = useState(todayKey);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Same error-to-toast bridge as Today
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

  function pick(next: RangeChoice) {
    setChoice(next);
    setRange(next === 'custom' ? customRange(customFrom, customTo) : presetRange(next, new Date()));
  }

  function changeCustom(from: string, to: string) {
    setCustomFrom(from);
    setCustomTo(to);
    if (from && to) setRange(customRange(from, to));
  }

  async function handleReopen(id: string) {
    if (await reopen(id)) showToast('back on today', 'success');
  }

  const settledCount = days.reduce((n, d) => n + d.done.length, 0);
  const totalHours = Math.round(days.reduce((n, d) => n + d.totalHours, 0) * 100) / 100;

  return (
    <div className="history-shell">
      <header className="history-header">
        <button className="header-signout" onClick={() => (window.location.hash = '#/')} aria-label="back to today">
          <ChevronLeft width={20} height={20} />
        </button>
        <h1 className="list-heading history-heading">history</h1>
      </header>

      <main className="history-main">
        <div className="history-chips" role="group" aria-label="date range">
          {CHOICES.map((c) => (
            <button
              key={c.value}
              className="history-chip"
              aria-pressed={choice === c.value}
              onClick={() => pick(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>

        {choice === 'custom' && (
          <div className="history-custom">
            <label>
              <span>from</span>
              <input className="history-date" type="date" value={customFrom} max={todayKey} onChange={(e) => changeCustom(e.target.value, customTo)} />
            </label>
            <label>
              <span>to</span>
              <input className="history-date" type="date" value={customTo} max={todayKey} onChange={(e) => changeCustom(customFrom, e.target.value)} />
            </label>
          </div>
        )}

        {!loading && days.length > 0 && (
          <p className="list-sub history-summary">
            {settledCount} settled{totalHours > 0 && <> · <span className="history-mono">{formatHours(totalHours)}</span> logged</>}
          </p>
        )}

        {loading ? (
          <TaskListSkeleton />
        ) : days.length === 0 ? (
          <EmptyState
            headline={choice === 'today' ? 'nothing settled yet today.' : 'nothing settled in this range.'}
            supportingText="settled and let-go tasks show up here, by day."
          />
        ) : (
          days.map((day) => (
            <section key={day.day} className="history-day" aria-label={formatDayHeading(day.day)}>
              <h2 className="history-day-heading">
                <span>{formatDayHeading(day.day)}</span>
                {day.totalHours > 0 && <span className="history-mono">{formatHours(day.totalHours)}</span>}
              </h2>
              <ul className="history-list">
                {[...day.done, ...day.dropped].map((task) => (
                  <HistoryRow key={task.id} task={task} onSetHours={setHours} onReopen={handleReopen} />
                ))}
              </ul>
            </section>
          ))
        )}
      </main>

      {createPortal(<ToastContainer toasts={toasts} onDismiss={removeToast} />, document.body)}
    </div>
  );
}
