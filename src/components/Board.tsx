import { useMemo, useState } from 'react';
import { canConfirm, confirmTask, moveTask } from '../lib/actions';
import { memberName, type Ctx } from '../lib/ctx';
import { fmtDateTime, fmtDay, relative } from '../lib/format';
import { counts, isOverdue, pct, segments } from '../lib/stats';
import { errorCode, must, supabase } from '../lib/supabase';
import { logActivity } from '../lib/teamData';
import { columnOf, type Column, type Task } from '../lib/types';
import { TaskModal } from './TaskModal';
import { Avatar, ProgressBar } from './ui';

const COLUMNS: { id: Column; title: string; hint: string }[] = [
  { id: 'todo', title: 'To Do', hint: 'Assigned, not started' },
  { id: 'doing', title: 'In Progress', hint: 'Someone is on it' },
  { id: 'review', title: 'Needs Confirmation', hint: 'Owner says done; a teammate checks it' },
  { id: 'confirmed', title: 'Confirmed', hint: 'Checked by a teammate' },
];

export function Board({ ctx }: { ctx: Ctx }) {
  const { tasks, events } = ctx.data;
  const [who, setWho] = useState<string>('all');
  const [eventId, setEventId] = useState<string>('all');
  const [editing, setEditing] = useState<Task | 'new' | null>(null);

  const visible = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (who === 'all' || (who === 'me' ? t.owner_id === ctx.me?.id : who === 'none' ? !t.owner_id : t.owner_id === who)) &&
          (eventId === 'all' || (eventId === 'none' ? !t.event_id : t.event_id === eventId)),
      ),
    [tasks, who, eventId, ctx.me?.id],
  );

  return (
    <>
      <Overview ctx={ctx} />

      <div className="toolbar">
        {!ctx.readOnly && (
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            + New task
          </button>
        )}
        <div className="filters">
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by person">
            <option value="all">Everyone</option>
            {ctx.me && <option value="me">My tasks</option>}
            {ctx.data.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value="none">Unassigned</option>
          </select>
          {events.length > 0 && (
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Filter by milestone">
              <option value="all">All milestones</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
              <option value="none">No milestone</option>
            </select>
          )}
        </div>
      </div>

      <div className="board">
        {COLUMNS.map((col) => {
          const items = visible
            .filter((t) => columnOf(t) === col.id)
            .sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'));
          return (
            <section key={col.id} className={`column column-${col.id}`}>
              <header className="column-head" title={col.hint}>
                <h3>{col.title}</h3>
                <span className="count">{items.length}</span>
              </header>
              <div className="column-body">
                {items.map((t) => (
                  <TaskCard key={t.id} ctx={ctx} task={t} onOpen={() => setEditing(t)} />
                ))}
                {items.length === 0 && <p className="empty">{col.hint}</p>}
              </div>
            </section>
          );
        })}
      </div>

      {editing && <TaskModal ctx={ctx} task={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function Overview({ ctx }: { ctx: Ctx }) {
  const { team, tasks, events } = ctx.data;
  const c = counts(tasks);
  const next = events.find((e) => new Date(e.due_at).getTime() > Date.now());
  const nextTasks = next ? counts(tasks.filter((t) => t.event_id === next.id)) : null;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(team.objective);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      await must(supabase.from('tpt_teams').update({ objective: text }).eq('id', team.id));
      await logActivity(team.id, ctx.me?.id ?? null, 'updated', 'the objective');
      await ctx.reload();
      setEditing(false);
    } catch (e) {
      setError(errorCode(e));
    }
  };

  return (
    <div className="overview">
      <div className="card objective">
        <div className="card-head">
          <span className="eyebrow">Objective</span>
          {!ctx.readOnly && !editing && (
            <button
              className="link-btn"
              onClick={() => {
                setText(team.objective);
                setEditing(true);
              }}
            >
              Edit
            </button>
          )}
        </div>
        {editing ? (
          <div className="stack">
            <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="What is the team trying to achieve?" />
            {error && <p className="error">{error}</p>}
            <div className="row gap-s">
              <button className="btn btn-primary" onClick={save}>
                Save
              </button>
              <button className="btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : team.objective ? (
          <p className="objective-text">{team.objective}</p>
        ) : (
          <p className="dim">No objective yet. {ctx.readOnly ? '' : 'Click Edit to add the assignment goal.'}</p>
        )}
      </div>

      <div className="card stat-card">
        <span className="eyebrow">Team progress</span>
        <div className="big-number">
          {pct(c)}
          <small>%</small>
        </div>
        <ProgressBar total={c.total} segments={segments(c)} />
        <p className="dim small">
          {c.confirmed} of {c.total} tasks confirmed
          {c.review > 0 && <> · {c.review} waiting on a check</>}
          {c.overdue > 0 && <span className="overdue"> · {c.overdue} overdue</span>}
        </p>
      </div>

      <div className="card stat-card next-card">
        <span className="eyebrow">Next up</span>
        {next ? (
          <>
            <div className="next-title">{next.title}</div>
            <div className="next-when">
              {fmtDateTime(next.due_at)} <span className="pill">{relative(next.due_at)}</span>
            </div>
            {next.location && <div className="dim small">📍 {next.location}</div>}
            {nextTasks && nextTasks.total > 0 && (
              <>
                <ProgressBar thin total={nextTasks.total} segments={segments(nextTasks)} />
                <p className="dim small">
                  {nextTasks.confirmed}/{nextTasks.total} tasks confirmed
                </p>
              </>
            )}
          </>
        ) : (
          <p className="dim">Nothing scheduled. Add deliverables on the Schedule tab.</p>
        )}
      </div>
    </div>
  );
}

function TaskCard({ ctx, task, onOpen }: { ctx: Ctx; task: Task; onOpen: () => void }) {
  const owner = ctx.data.members.find((m) => m.id === task.owner_id);
  const event = ctx.data.events.find((e) => e.id === task.event_id);
  const [busy, setBusy] = useState(false);
  const col = columnOf(task);
  const mine = !!ctx.me && task.owner_id === ctx.me.id;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert(errorCode(e));
    } finally {
      setBusy(false);
    }
  };

  let action: { label: string; fn: () => Promise<void>; primary?: boolean } | null = null;
  if (!ctx.readOnly) {
    if (col === 'todo') action = { label: 'Start', fn: () => moveTask(ctx, task, 'doing') };
    else if (col === 'doing') action = { label: 'Mark done', fn: () => moveTask(ctx, task, 'done'), primary: mine };
    else if (col === 'review' && canConfirm(ctx, task)) action = { label: '✓ Confirm', fn: () => confirmTask(ctx, task), primary: true };
  }

  return (
    <article className={`task ${mine ? 'task-mine' : ''}`} onClick={onOpen} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="task-title">{task.title}</div>
      <div className="task-meta">
        {event && <span className="tag">{event.title}</span>}
        {task.due_on && <span className={`due ${isOverdue(task) ? 'overdue' : ''}`}>Due {fmtDay(task.due_on)}</span>}
        {task.link && <span title="Has a link">🔗</span>}
      </div>
      <div className="task-foot">
        <span className="owner">
          <Avatar member={owner} size={22} />
          <span>{owner?.name ?? 'Unassigned'}</span>
        </span>
        {action && (
          <button
            className={`btn btn-s ${action.primary ? 'btn-primary' : ''}`}
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              void run(action.fn);
            }}
          >
            {action.label}
          </button>
        )}
      </div>
      {col === 'review' && !canConfirm(ctx, task) && (
        <div className="task-note">{mine ? 'Waiting for a teammate to confirm' : !ctx.me ? 'Pick who you are to confirm' : ''}</div>
      )}
      {col === 'confirmed' && <div className="task-note ok">✓ Confirmed by {memberName(ctx, task.confirmed_by)}</div>}
    </article>
  );
}
