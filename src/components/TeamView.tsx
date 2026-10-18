import { useEffect, useState } from 'react';
import type { Ctx } from '../lib/ctx';
import { fmtDay, MEMBER_COLORS } from '../lib/format';
import { counts, isOverdue, pct, segments } from '../lib/stats';
import { errorCode, must, supabase } from '../lib/supabase';
import { columnOf, type Member } from '../lib/types';
import { Avatar, Modal, ProgressBar } from './ui';

export function TeamView({ ctx }: { ctx: Ctx }) {
  const { members, tasks, team } = ctx.data;
  const [editing, setEditing] = useState<Member | 'new' | null>(null);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    void supabase.rpc('tpt_join_code', { p_team: team.id }).then(({ data }) => setCode((data as string | null) ?? null));
  }, [team.id]);

  return (
    <>
      <div className="toolbar">
        <div>
          <h2 className="section-title">Team</h2>
          {code && (
            <p className="dim small">
              Join code <code className="code">{code}</code>: share it with a teammate so they can get in.
            </p>
          )}
        </div>
        {!ctx.readOnly && (
          <button className="btn" onClick={() => setEditing('new')}>
            + Add teammate
          </button>
        )}
      </div>

      <div className="member-grid">
        {members.map((m) => {
          const own = tasks.filter((t) => t.owner_id === m.id);
          const c = counts(own);
          const checks = tasks.filter((t) => t.confirmed_by === m.id).length;
          const open = own
            .filter((t) => columnOf(t) === 'todo' || columnOf(t) === 'doing')
            .sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'));
          return (
            <div key={m.id} className={`card member-card ${m.id === ctx.me?.id ? 'is-me' : ''}`}>
              <div className="row gap-s">
                <Avatar member={m} size={44} />
                <div className="grow">
                  <div className="member-name">
                    {m.name}
                    {m.id === ctx.me?.id && <span className="pill pill-gold">you</span>}
                  </div>
                  <div className="dim small">{m.role || 'No role set'}</div>
                </div>
                {!ctx.readOnly && (
                  <button className="link-btn" onClick={() => setEditing(m)}>
                    Edit
                  </button>
                )}
              </div>
              <ProgressBar total={c.total} segments={segments(c)} />
              <div className="mini-stats">
                <div>
                  <b>{c.total}</b>
                  <span>assigned</span>
                </div>
                <div>
                  <b>{c.doing}</b>
                  <span>in progress</span>
                </div>
                <div>
                  <b>{c.confirmed}</b>
                  <span>confirmed</span>
                </div>
                <div>
                  <b>{checks}</b>
                  <span>checks given</span>
                </div>
              </div>
              {c.overdue > 0 && <div className="overdue small">{c.overdue} overdue</div>}
              {open.length > 0 && (
                <ul className="open-list">
                  {open.slice(0, 5).map((t) => (
                    <li key={t.id}>
                      <span className={`dot dot-${columnOf(t)}`} />
                      <span className="grow">{t.title}</span>
                      {t.due_on && <span className={`small ${isOverdue(t) ? 'overdue' : 'dim'}`}>{fmtDay(t.due_on)}</span>}
                    </li>
                  ))}
                  {open.length > 5 && <li className="dim small">+{open.length - 5} more</li>}
                </ul>
              )}
              {c.total > 0 && <div className="dim small">{pct(c)}% of their tasks confirmed</div>}
            </div>
          );
        })}
      </div>

      {editing && <MemberModal ctx={ctx} member={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

export function MemberModal({ ctx, member, onClose, onCreated }: { ctx: Ctx; member: Member | null; onClose: () => void; onCreated?: (m: Member) => void }) {
  const used = new Set(ctx.data.members.map((m) => m.color));
  const [name, setName] = useState(member?.name ?? '');
  const [role, setRole] = useState(member?.role ?? '');
  const [color, setColor] = useState(member?.color ?? MEMBER_COLORS.find((c) => !used.has(c)) ?? MEMBER_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      if (!name.trim()) throw new Error('Enter a name');
      const fields = { name: name.trim(), role: role.trim(), color };
      if (member) await must(supabase.from('tpt_members').update(fields).eq('id', member.id));
      else {
        const created = await must(
          supabase
            .from('tpt_members')
            .insert({ ...fields, team_id: ctx.data.team.id, sort: ctx.data.members.length })
            .select()
            .single<Member>(),
        );
        onCreated?.(created);
      }
      await ctx.reload();
      onClose();
    } catch (e) {
      setError(errorCode(e));
    }
  };

  const remove = async () => {
    if (!member || !confirm(`Remove ${member.name} from the team? Their tasks become unassigned.`)) return;
    try {
      await must(supabase.from('tpt_members').delete().eq('id', member.id));
      await ctx.reload();
      onClose();
    } catch (e) {
      setError(errorCode(e));
    }
  };

  return (
    <Modal title={member ? 'Edit teammate' : 'Add teammate'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          Name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>
        <label>
          Role <span className="dim">(optional)</span>
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Systems integration, Propulsion, Report editor" />
        </label>
        <div>
          <div className="label">Color</div>
          <div className="swatches">
            {MEMBER_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`swatch ${c === color ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          {member && (
            <button type="button" className="btn btn-danger-text" onClick={remove}>
              Remove
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {member ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
