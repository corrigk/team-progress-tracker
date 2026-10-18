import { useMemo, useState } from 'react';
import { memberName, type Ctx } from '../lib/ctx';
import { fmtDateTime, fmtDay, fmtDayOf, fmtTime, localDay } from '../lib/format';
import { counts, onTime, pct, segments } from '../lib/stats';
import { errorCode, must, supabase } from '../lib/supabase';
import { downloadTeamExport } from '../lib/teamData';
import type { LessonKind } from '../lib/types';
import { Avatar, ProgressBar } from './ui';

const LESSON_COLS: { kind: LessonKind; title: string; prompt: string }[] = [
  { kind: 'went_well', title: 'What went well', prompt: 'Keep doing this…' },
  { kind: 'improve', title: 'What to improve', prompt: 'This slowed us down…' },
  { kind: 'try', title: 'Try next time', prompt: 'Next team should…' },
];

export function Recap({ ctx }: { ctx: Ctx }) {
  const { team, members, tasks, events, activity, lessons } = ctx.data;
  const c = counts(tasks);
  const eventDue = useMemo(() => new Map(events.map((e) => [e.id, e.due_at])), [events]);

  const timing = tasks.map((t) => onTime(t, t.event_id ? eventDue.get(t.event_id) : undefined)).filter((v): v is boolean => v !== null);
  const onTimePct = timing.length ? Math.round((timing.filter(Boolean).length / timing.length) * 100) : null;

  const byDay = useMemo(() => {
    const groups = new Map<string, typeof activity>();
    for (const a of [...activity].reverse()) {
      const day = localDay(a.created_at);
      groups.set(day, [...(groups.get(day) ?? []), a]);
    }
    return [...groups.entries()];
  }, [activity]);

  return (
    <div className="recap">
      <div className="toolbar no-print">
        <div>
          <h2 className="section-title">Recap &amp; lessons learned</h2>
          <p className="dim small">Fill in lessons as you go. Print or save as PDF for the final presentation.</p>
        </div>
        <div className="row gap-s">
          <button className="btn" onClick={() => void downloadTeamExport(team.id).catch((e) => alert(errorCode(e)))}>
            Export data
          </button>
          <button className="btn btn-primary" onClick={() => window.print()}>
            Print / PDF
          </button>
        </div>
      </div>

      <div className="print-only print-title">
        <h1>{team.name}</h1>
        <p>
          {team.course}
          {team.starts_on && team.ends_on && (
            <>
              {' '}
              · {fmtDay(team.starts_on)} to {fmtDay(team.ends_on)}
            </>
          )}
        </p>
      </div>

      {team.objective && (
        <div className="card">
          <span className="eyebrow">Objective</span>
          <p className="objective-text">{team.objective}</p>
        </div>
      )}

      <div className="kpis">
        <Kpi value={`${pct(c)}%`} label="tasks confirmed" sub={`${c.confirmed} of ${c.total}`} />
        <Kpi value={onTimePct === null ? '–' : `${onTimePct}%`} label="finished on time" sub={`${timing.length} with a due date`} />
        <Kpi value={String(events.filter((e) => e.kind === 'deliverable' || e.kind === 'presentation').length)} label="deliverables" sub={`${events.length} schedule items`} />
        <Kpi value={String(activity.length)} label="updates logged" sub={`${members.length} teammates`} />
      </div>

      <div className="card">
        <h3 className="card-title">Contributions</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Teammate</th>
                <th>Owned</th>
                <th>Confirmed</th>
                <th>On time</th>
                <th>Checks given</th>
                <th>Tasks created</th>
                <th className="col-bar">Progress</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const own = tasks.filter((t) => t.owner_id === m.id);
                const mc = counts(own);
                const mt = own.map((t) => onTime(t, t.event_id ? eventDue.get(t.event_id) : undefined)).filter((v): v is boolean => v !== null);
                return (
                  <tr key={m.id}>
                    <td>
                      <span className="row gap-s">
                        <Avatar member={m} size={22} />
                        {m.name}
                      </span>
                    </td>
                    <td>{mc.total}</td>
                    <td>{mc.confirmed}</td>
                    <td>{mt.length ? `${mt.filter(Boolean).length}/${mt.length}` : '–'}</td>
                    <td>{tasks.filter((t) => t.confirmed_by === m.id).length}</td>
                    <td>{tasks.filter((t) => t.created_by === m.id).length}</td>
                    <td className="col-bar">
                      <ProgressBar thin total={mc.total} segments={segments(mc)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {events.length > 0 && (
        <div className="card">
          <h3 className="card-title">Milestones</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>When</th>
                  <th>Where</th>
                  <th>Tasks confirmed</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  const ec = counts(tasks.filter((t) => t.event_id === e.id));
                  return (
                    <tr key={e.id}>
                      <td>{e.title}</td>
                      <td>{fmtDateTime(e.due_at)}</td>
                      <td>{e.location || '–'}</td>
                      <td>{ec.total ? `${ec.confirmed}/${ec.total}` : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="lessons">
        {LESSON_COLS.map((col) => (
          <LessonColumn key={col.kind} ctx={ctx} {...col} items={lessons.filter((l) => l.kind === col.kind)} />
        ))}
      </div>

      <div className="card">
        <h3 className="card-title">Timeline</h3>
        {byDay.length === 0 && <p className="dim">No activity yet.</p>}
        {byDay.map(([day, items]) => (
          <div key={day} className="log-day">
            <div className="log-date">{fmtDayOf(items[0].created_at)}</div>
            <ul className="log">
              {items.map((a) => (
                <li key={a.id}>
                  <span className="dim small log-time">{fmtTime(a.created_at)}</span>
                  <span>
                    <b>{a.member_id ? memberName(ctx, a.member_id) : 'Someone'}</b> {a.verb} <span className="log-subject">{a.subject}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="card kpi">
      <div className="big-number">{value}</div>
      <div className="kpi-label">{label}</div>
      <div className="dim small">{sub}</div>
    </div>
  );
}

function LessonColumn({
  ctx,
  kind,
  title,
  prompt,
  items,
}: {
  ctx: Ctx;
  kind: LessonKind;
  title: string;
  prompt: string;
  items: Ctx['data']['lessons'];
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!text.trim()) return;
    try {
      await must(supabase.from('tpt_lessons').insert({ team_id: ctx.data.team.id, member_id: ctx.me?.id ?? null, kind, body: text.trim() }));
      setText('');
      await ctx.reload();
    } catch (e) {
      setError(errorCode(e));
    }
  };

  const remove = async (id: string) => {
    try {
      await must(supabase.from('tpt_lessons').delete().eq('id', id));
      await ctx.reload();
    } catch (e) {
      setError(errorCode(e));
    }
  };

  return (
    <div className={`card lesson-col lesson-${kind}`}>
      <h3 className="card-title">{title}</h3>
      <ul className="lesson-list">
        {items.map((l) => (
          <li key={l.id}>
            <span className="grow">{l.body}</span>
            <span className="dim small">{l.member_id ? memberName(ctx, l.member_id) : ''}</span>
            {!ctx.readOnly && (ctx.isAdmin || l.member_id === ctx.me?.id) && (
              <button className="icon-btn no-print" onClick={() => void remove(l.id)} aria-label="Delete">
                ✕
              </button>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="dim small">Nothing yet.</li>}
      </ul>
      {!ctx.readOnly && (
        <form
          className="row gap-s no-print"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={prompt} maxLength={1000} />
          <button className="btn btn-s" type="submit">
            Add
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
