import { useState } from 'react';
import type { Ctx } from '../lib/ctx';
import { fmtDayOf, fmtTime, relative, toLocalInput } from '../lib/format';
import { counts, segments } from '../lib/stats';
import { errorCode, must, supabase } from '../lib/supabase';
import { logActivity } from '../lib/teamData';
import type { EventKind, TeamEvent } from '../lib/types';
import { Modal, ProgressBar } from './ui';

export const KIND_LABEL: Record<EventKind, string> = {
  deliverable: 'Deliverable',
  presentation: 'Presentation',
  meeting: 'Meeting',
  other: 'Other',
};

export function Schedule({ ctx }: { ctx: Ctx }) {
  const [editing, setEditing] = useState<TeamEvent | 'new' | null>(null);
  const now = Date.now();
  const { events, tasks } = ctx.data;

  return (
    <>
      <div className="toolbar">
        <div>
          <h2 className="section-title">Schedule</h2>
          <p className="dim small">Deliverables, presentations and meetings. Link tasks to one to track it.</p>
        </div>
        {!ctx.readOnly && (
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            + Add to schedule
          </button>
        )}
      </div>

      {events.length === 0 && (
        <div className="card empty-card">
          <p>Nothing on the schedule yet.</p>
          <p className="dim small">Add each due date: the presentation (with room), reports, and team meetings.</p>
        </div>
      )}

      <ol className="timeline">
        {events.map((ev) => {
          const past = new Date(ev.due_at).getTime() < now;
          const linked = tasks.filter((t) => t.event_id === ev.id);
          const c = counts(linked);
          return (
            <li key={ev.id} className={`timeline-item ${past ? 'past' : ''}`}>
              <div className="when">
                <div className="when-day">{fmtDayOf(ev.due_at)}</div>
                <div className="when-time">{fmtTime(ev.due_at)}</div>
              </div>
              <div className="card event-card" onClick={() => setEditing(ev)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEditing(ev)}>
                <div className="row between wrap gap-s">
                  <div className="row gap-s wrap">
                    <span className={`kind kind-${ev.kind}`}>{KIND_LABEL[ev.kind]}</span>
                    <h3 className="event-title">{ev.title}</h3>
                  </div>
                  <span className={`pill ${past ? '' : 'pill-gold'}`}>{relative(ev.due_at, now)}</span>
                </div>
                {ev.location && <div className="small">📍 {ev.location}</div>}
                {ev.notes && <p className="small pre">{ev.notes}</p>}
                {c.total > 0 && (
                  <div className="event-progress">
                    <ProgressBar thin total={c.total} segments={segments(c)} />
                    <span className="small dim">
                      {c.confirmed}/{c.total} tasks confirmed
                      {c.overdue > 0 && <span className="overdue"> · {c.overdue} overdue</span>}
                    </span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {editing && <EventModal ctx={ctx} event={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function EventModal({ ctx, event, onClose }: { ctx: Ctx; event: TeamEvent | null; onClose: () => void }) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [kind, setKind] = useState<EventKind>(event?.kind ?? 'deliverable');
  const [dueAt, setDueAt] = useState(event ? toLocalInput(event.due_at) : '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ro = ctx.readOnly;
  const teamId = ctx.data.team.id;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await ctx.reload();
      onClose();
    } catch (e) {
      setError(errorCode(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      if (!title.trim()) throw new Error('Give it a title');
      if (!dueAt) throw new Error('Pick a date and time');
      const fields = { title: title.trim(), kind, due_at: new Date(dueAt).toISOString(), location: location.trim(), notes };
      if (event) await must(supabase.from('tpt_events').update(fields).eq('id', event.id));
      else {
        await must(supabase.from('tpt_events').insert({ ...fields, team_id: teamId }));
        await logActivity(teamId, ctx.me?.id ?? null, 'scheduled', fields.title);
      }
    });

  const remove = () => {
    if (!event || !confirm(`Remove "${event.title}" from the schedule? Linked tasks are kept.`)) return;
    void run(async () => {
      await must(supabase.from('tpt_events').delete().eq('id', event.id));
    });
  };

  return (
    <Modal title={event ? (ro ? event.title : 'Edit schedule item') : 'Add to schedule'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          Title
          <input autoFocus={!event} value={title} onChange={(e) => setTitle(e.target.value)} disabled={ro} placeholder="e.g. Final presentation" maxLength={120} />
        </label>
        <div className="grid-2">
          <label>
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value as EventKind)} disabled={ro}>
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date &amp; time
            <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} disabled={ro} />
          </label>
        </div>
        <label>
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} disabled={ro} placeholder="e.g. ARMS 1010, Brightspace, Zoom" />
        </label>
        <label>
          Notes
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={ro} placeholder="Format, length, what to bring, submission instructions…" />
        </label>
        {error && <p className="error">{error}</p>}
        {!ro && (
          <div className="modal-actions">
            {event && (
              <button type="button" className="btn btn-danger-text" onClick={remove} disabled={busy}>
                Remove
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {event ? 'Save' : 'Add'}
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}
