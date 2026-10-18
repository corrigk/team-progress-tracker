import { useEffect, useState } from 'react';
import { fmtDay, MEMBER_COLORS } from '../lib/format';
import { errorCode, must, supabase } from '../lib/supabase';
import { downloadTeamExport } from '../lib/teamData';
import type { Team } from '../lib/types';
import { Modal } from './ui';

type Props = {
  isAdmin: boolean;
  teams: Team[];
  refresh: () => Promise<unknown>;
  onOpen: (teamId: string) => void;
  onBack?: () => void;
};

export function Admin({ isAdmin, teams, refresh, onOpen, onBack }: Props) {
  if (!isAdmin) return <AdminGate refresh={refresh} onBack={onBack} />;
  return <AdminHome teams={teams} refresh={refresh} onOpen={onOpen} onBack={onBack} />;
}

function AdminGate({ refresh, onBack }: { refresh: () => Promise<unknown>; onBack?: () => void }) {
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await must(supabase.rpc('tpt_claim_admin', { p_passcode: pass }));
      if (!ok) setError('Wrong passcode');
      else await refresh();
    } catch (e) {
      const code = errorCode(e);
      setError(code === 'NO_PASSCODE_SET' ? 'No admin passcode set yet. See README → Setup.' : code);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <div className="card gate-card">
        <div className="brand-mark">✓</div>
        <h1>Admin</h1>
        <p className="dim">Enter the admin passcode. You only need to do this once per device.</p>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Passcode" />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy || !pass}>
            Unlock
          </button>
          {onBack && (
            <button type="button" className="link-btn" onClick={onBack}>
              ← Back
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

function AdminHome({ teams, refresh, onOpen, onBack }: Omit<Props, 'isAdmin'>) {
  const [creating, setCreating] = useState(false);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all(teams.map(async (t) => [t.id, (await supabase.rpc('tpt_join_code', { p_team: t.id })).data as string | null] as const)).then(
      (pairs) => setCodes(Object.fromEntries(pairs.filter(([, c]) => c)) as Record<string, string>),
    );
  }, [teams]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(errorCode(e));
    }
  };

  const changeCode = (t: Team) => {
    const next = prompt(`New join code for ${t.name} (4-12 letters/numbers):`, codes[t.id] ?? '');
    if (next) void act(() => must(supabase.rpc('tpt_set_join_code', { p_team: t.id, p_code: next })));
  };

  const toggleArchive = (t: Team) =>
    act(() => must(supabase.from('tpt_teams').update({ status: t.status === 'active' ? 'archived' : 'active' }).eq('id', t.id)));

  const remove = (t: Team) => {
    const typed = prompt(`This permanently deletes ${t.name} and all its tasks, schedule and lessons.\nExport first if you want to keep it.\n\nType the team name to confirm:`);
    if (typed === null) return;
    if (typed.trim() !== t.name) {
      alert('Name did not match. Nothing deleted.');
      return;
    }
    void act(() => must(supabase.from('tpt_teams').delete().eq('id', t.id)));
  };

  return (
    <div className="page">
      <header className="admin-head">
        <div>
          <span className="eyebrow">Admin</span>
          <h1>Teams</h1>
        </div>
        <div className="row gap-s">
          {onBack && (
            <button className="btn" onClick={onBack}>
              ← Back to team
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + New team
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {teams.length === 0 && (
        <div className="card empty-card">
          <p>No teams yet.</p>
          <p className="dim small">Create one, share its join code with your teammates, and you're running.</p>
        </div>
      )}

      <div className="admin-list">
        {teams.map((t) => (
          <div key={t.id} className={`card admin-team ${t.status}`}>
            <div className="grow">
              <div className="row gap-s wrap">
                <h3 className="event-title">{t.name}</h3>
                {t.status === 'archived' && <span className="pill">archived</span>}
              </div>
              <div className="dim small">
                {t.course || 'No course'}
                {t.starts_on && <> · {fmtDay(t.starts_on)}</>}
                {t.ends_on && <> to {fmtDay(t.ends_on)}</>}
              </div>
              <div className="small">
                Join code: <code className="code">{codes[t.id] ?? '…'}</code>{' '}
                <button className="link-btn" onClick={() => changeCode(t)}>
                  change
                </button>
              </div>
            </div>
            <div className="row gap-s wrap">
              <button className="btn btn-primary btn-s" onClick={() => onOpen(t.id)}>
                Open
              </button>
              <button className="btn btn-s" onClick={() => void downloadTeamExport(t.id).catch((e) => setError(errorCode(e)))}>
                Export
              </button>
              <button className="btn btn-s" onClick={() => void toggleArchive(t)}>
                {t.status === 'active' ? 'Archive' : 'Unarchive'}
              </button>
              <button className="btn btn-s btn-danger-text" onClick={() => remove(t)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="dim small admin-help">
        <b>Archive</b> freezes a team: teammates can still view the board and recap but can't change anything. <b>Export</b> downloads
        everything as JSON. <b>Delete</b> is permanent.
      </p>

      {creating && (
        <CreateTeam
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            await refresh();
            setCreating(false);
            onOpen(id);
          }}
        />
      )}
    </div>
  );
}

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function CreateTeam({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [course, setCourse] = useState('AAE 35103');
  const [objective, setObjective] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [code, setCode] = useState(randomCode);
  const [roster, setRoster] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!name.trim()) throw new Error('Team name is required');
      const team = await must(
        supabase
          .from('tpt_teams')
          .insert({ name: name.trim(), course: course.trim(), objective: objective.trim(), starts_on: startsOn || null, ends_on: endsOn || null })
          .select()
          .single<Team>(),
      );
      try {
        await must(supabase.rpc('tpt_set_join_code', { p_team: team.id, p_code: code }));
      } catch (e) {
        await supabase.from('tpt_teams').delete().eq('id', team.id);
        throw e;
      }
      const names = roster
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (names.length) {
        await must(
          supabase
            .from('tpt_members')
            .insert(names.map((n, i) => ({ team_id: team.id, name: n, sort: i, color: MEMBER_COLORS[i % MEMBER_COLORS.length] }))),
        );
      }
      await onCreated(team.id);
    } catch (e) {
      const c = errorCode(e);
      setError(c === 'CODE_TAKEN' ? 'That join code is used by another team.' : c === 'BAD_CODE' ? 'Join code must be 4-12 letters or numbers.' : c);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New team" onClose={onClose} wide>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div className="grid-2">
          <label>
            Team name
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Team 4" maxLength={80} />
          </label>
          <label>
            Course
            <input value={course} onChange={(e) => setCourse(e.target.value)} />
          </label>
        </div>
        <label>
          Objective
          <textarea rows={4} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Paste the assignment objective. Teammates can edit it later." />
        </label>
        <div className="grid-3">
          <label>
            Starts
            <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </label>
          <label>
            Ends
            <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </label>
          <label>
            Join code
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={12} />
          </label>
        </div>
        <label>
          Teammates <span className="dim">(one per line or comma separated; you can add more later)</span>
          <textarea rows={5} value={roster} onChange={(e) => setRoster(e.target.value)} placeholder={'Kevin\nAlex\nSam\nJordan\nTaylor'} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            Create team
          </button>
        </div>
      </form>
    </Modal>
  );
}
