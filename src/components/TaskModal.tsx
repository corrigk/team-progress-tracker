import { useState } from 'react';
import { canConfirm, confirmTask, moveTask, unconfirmTask } from '../lib/actions';
import { memberName, type Ctx } from '../lib/ctx';
import { fmtDateTime } from '../lib/format';
import { errorCode, must, supabase } from '../lib/supabase';
import { logActivity } from '../lib/teamData';
import { columnOf, type Task } from '../lib/types';
import { Modal } from './ui';

export function TaskModal({ ctx, task, onClose }: { ctx: Ctx; task: Task | null; onClose: () => void }) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [ownerId, setOwnerId] = useState(task ? (task.owner_id ?? '') : (ctx.me?.id ?? ''));
  const [eventId, setEventId] = useState(task?.event_id ?? '');
  const [dueOn, setDueOn] = useState(task?.due_on ?? '');
  const [link, setLink] = useState(task?.link ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ro = ctx.readOnly;
  const teamId = ctx.data.team.id;

  const run = async (fn: () => Promise<void>, close = true) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (close) onClose();
    } catch (e) {
      setError(friendly(errorCode(e)));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      if (!title.trim()) throw new Error('Give the task a title');
      const fields = {
        title: title.trim(),
        owner_id: ownerId || null,
        event_id: eventId || null,
        due_on: dueOn || null,
        link: link.trim(),
        notes,
      };
      if (task) {
        // Reassigning to the person who confirmed it would break the no-self-confirm rule; clear it.
        const patch = task.confirmed_by && task.confirmed_by === fields.owner_id ? { ...fields, confirmed_by: null, confirmed_at: null } : fields;
        await must(supabase.from('tpt_tasks').update(patch).eq('id', task.id));
        if (task.owner_id !== fields.owner_id) {
          await logActivity(teamId, ctx.me?.id ?? null, 'assigned', `${fields.title} → ${memberName(ctx, fields.owner_id)}`);
        }
      } else {
        await must(supabase.from('tpt_tasks').insert({ ...fields, team_id: teamId, created_by: ctx.me?.id ?? null }));
        await logActivity(teamId, ctx.me?.id ?? null, 'created', `${fields.title} → ${memberName(ctx, fields.owner_id)}`);
      }
      await ctx.reload();
    });

  const remove = () => {
    if (!task || !confirm(`Delete "${task.title}"?`)) return;
    void run(async () => {
      await must(supabase.from('tpt_tasks').delete().eq('id', task.id));
      await logActivity(teamId, ctx.me?.id ?? null, 'deleted', task.title);
      await ctx.reload();
    });
  };

  const col = task ? columnOf(task) : null;

  return (
    <Modal title={task ? (ro ? 'Task' : 'Edit task') : 'New task'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          Task
          <input autoFocus={!task} value={title} onChange={(e) => setTitle(e.target.value)} disabled={ro} placeholder="e.g. Draft the functional decomposition" maxLength={200} />
        </label>
        <div className="grid-2">
          <label>
            Owner
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} disabled={ro}>
              <option value="">Unassigned</option>
              {ctx.data.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.id === ctx.me?.id ? ' (me)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Due date
            <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} disabled={ro} />
          </label>
        </div>
        <label>
          Milestone / deliverable
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} disabled={ro}>
            <option value="">None</option>
            {ctx.data.events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Link <span className="dim">(Drive, Overleaf, Teams…)</span>
          <input value={link} onChange={(e) => setLink(e.target.value)} disabled={ro} placeholder="https://" />
        </label>
        {task?.link && /^https?:\/\//.test(task.link) && (
          <a className="small" href={task.link} target="_blank" rel="noreferrer">
            Open link ↗
          </a>
        )}
        <label>
          Notes
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={ro} placeholder="Definition of done, details, blockers…" />
        </label>

        {task && (
          <div className="status-box">
            <div className="small dim">
              Created {fmtDateTime(task.created_at)}
              {task.created_by && <> by {memberName(ctx, task.created_by)}</>}
              {task.done_at && <> · marked done {fmtDateTime(task.done_at)}</>}
              {task.confirmed_at && (
                <>
                  {' '}
                  · confirmed by {memberName(ctx, task.confirmed_by)} {fmtDateTime(task.confirmed_at)}
                </>
              )}
            </div>
            {!ro && (
              <div className="row gap-s wrap">
                {col === 'todo' && (
                  <button type="button" className="btn" disabled={busy} onClick={() => run(() => moveTask(ctx, task, 'doing'))}>
                    Start
                  </button>
                )}
                {col === 'doing' && (
                  <>
                    <button type="button" className="btn" disabled={busy} onClick={() => run(() => moveTask(ctx, task, 'todo'))}>
                      Back to To Do
                    </button>
                    <button type="button" className="btn" disabled={busy} onClick={() => run(() => moveTask(ctx, task, 'done'))}>
                      Mark done
                    </button>
                  </>
                )}
                {(col === 'review' || col === 'confirmed') && (
                  <button type="button" className="btn" disabled={busy} onClick={() => run(() => moveTask(ctx, task, 'doing'))}>
                    Reopen
                  </button>
                )}
                {canConfirm(ctx, task) && (
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => confirmTask(ctx, task))}>
                    ✓ Confirm it's done
                  </button>
                )}
                {col === 'confirmed' && (ctx.isAdmin || task.confirmed_by === ctx.me?.id) && (
                  <button type="button" className="btn" disabled={busy} onClick={() => run(() => unconfirmTask(ctx, task))}>
                    Undo confirm
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {error && <p className="error">{error}</p>}

        {!ro && (
          <div className="modal-actions">
            {task && (
              <button type="button" className="btn btn-danger-text" onClick={remove} disabled={busy}>
                Delete
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {task ? 'Save' : 'Create task'}
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}

function friendly(code: string): string {
  if (code.includes('tpt_tasks_no_self_confirm')) return "You can't confirm your own task. Ask a teammate.";
  return code;
}
