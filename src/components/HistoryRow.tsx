import { useState } from 'react';
import type { Task } from '../lib/tasks';
import { parseHours } from '../lib/history';

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toLowerCase();
const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

interface HistoryRowProps {
  task: Task;
  onSetHours: (id: string, hours: number | null) => Promise<boolean>;
  onReopen: (id: string) => void;
}

export function HistoryRow({ task, onSetHours, onReopen }: HistoryRowProps) {
  const settled = task.status === 'done';
  const saved = task.hours_spent == null ? '' : String(task.hours_spent);
  const [draft, setDraft] = useState(saved);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function commit() {
    const parsed = parseHours(draft);
    if (!parsed.ok) {
      setFieldError(parsed.error);
      return;
    }
    setFieldError(null);
    setDraft(parsed.value == null ? '' : String(parsed.value));
    if (parsed.value === task.hours_spent) return;
    const ok = await onSetHours(task.id, parsed.value);
    if (!ok) setDraft(saved);
  }

  return (
    <li className={settled ? 'history-row' : 'history-row history-row-let-go'}>
      <div className="title-group">
        <span className="history-title">{task.title}</span>
        <span className="history-meta">
          opened {formatDay(task.created_at)} · {settled ? 'settled' : 'let go'} {formatTime(task.completed_at!)}
        </span>
        {task.tags.length > 0 && (
          <span className="task-tags">
            {task.tags.map((tag) => (
              <span key={tag} className="tag-chip">{tag}</span>
            ))}
          </span>
        )}
      </div>
      {settled && (
        <label className={fieldError ? 'history-hours history-hours-error' : 'history-hours'}>
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            placeholder="–"
            aria-label={`hours spent on ${task.title}`}
            aria-invalid={fieldError ? true : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setDraft(saved);
                setFieldError(null);
              }
            }}
          />
          <span aria-hidden="true">h</span>
        </label>
      )}
      <button className="history-reopen" onClick={() => onReopen(task.id)} aria-label={`reopen ${task.title}`}>
        reopen
      </button>
      {fieldError && <span className="history-field-error" role="alert">{fieldError}</span>}
    </li>
  );
}
