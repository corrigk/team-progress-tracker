import { useCallback, useEffect, useState } from 'react';
import { Admin } from './components/Admin';
import { Board } from './components/Board';
import { Recap } from './components/Recap';
import { Schedule } from './components/Schedule';
import { MemberModal, TeamView } from './components/TeamView';
import { Avatar, Spinner } from './components/ui';
import type { Ctx } from './lib/ctx';
import { fmtDay, parseDay, todayStr } from './lib/format';
import { storedMemberId, storedTeamId, storeMemberId, storeTeamId } from './lib/identity';
import { ensureSession, errorCode, isConfigured, must, supabase } from './lib/supabase';
import { logActivity, useTeamData } from './lib/teamData';
import type { Member, Team } from './lib/types';

export function App() {
  if (!isConfigured) return <SetupNeeded />;
  return <Root />;
}

type Screen = 'team' | 'join' | 'admin';

function Root() {
  const [boot, setBoot] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bootError, setBootError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string | null>(storedTeamId);
  const [screen, setScreen] = useState<Screen>(() => (window.location.hash === '#admin' ? 'admin' : 'team'));

  const refresh = useCallback(async () => {
    await ensureSession();
    const [admin, list] = await Promise.all([
      must(supabase.rpc('tpt_is_admin')),
      must(supabase.from('tpt_teams').select('*').order('created_at', { ascending: false }).returns<Team[]>()),
    ]);
    setIsAdmin(Boolean(admin));
    setTeams(list);
    return list;
  }, []);

  useEffect(() => {
    refresh()
      .then(() => setBoot('ready'))
      .catch((e) => {
        setBootError(errorCode(e));
        setBoot('error');
      });
  }, [refresh]);

  const openTeam = (id: string) => {
    storeTeamId(id);
    setTeamId(id);
    setScreen('team');
    if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  if (boot === 'loading') return <Spinner />;
  if (boot === 'error') {
    return (
      <div className="gate">
        <div className="card gate-card">
          <h1>Can't reach the database</h1>
          <p className="error">{bootError}</p>
          <p className="dim small">Check that the SQL migration has been run and anonymous sign-ins are enabled (README → Setup).</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Remembered team, else the newest active one this device can see.
  const current = teams.find((t) => t.id === teamId) ?? teams.find((t) => t.status === 'active') ?? teams[0] ?? null;

  if (screen === 'admin' || (!current && isAdmin && screen !== 'join')) {
    return <Admin isAdmin={isAdmin} teams={teams} refresh={refresh} onOpen={openTeam} onBack={current ? () => setScreen('team') : () => setScreen('join')} />;
  }

  if (screen === 'join' || !current) {
    return (
      <JoinScreen
        onJoined={async (id) => {
          await refresh();
          openTeam(id);
        }}
        onAdmin={() => setScreen('admin')}
        onCancel={current ? () => setScreen('team') : undefined}
      />
    );
  }

  return (
    <TeamApp
      key={current.id}
      teamId={current.id}
      teams={teams}
      isAdmin={isAdmin}
      onSwitch={openTeam}
      onJoinAnother={() => setScreen('join')}
      onAdmin={() => setScreen('admin')}
      onLeave={async () => {
        if (!confirm(`Leave ${current.name} on this device? You can rejoin with the code.`)) return;
        await supabase.rpc('tpt_leave_team', { p_team: current.id });
        storeTeamId(null);
        setTeamId(null);
        await refresh();
      }}
    />
  );
}

function JoinScreen({ onJoined, onAdmin, onCancel }: { onJoined: (id: string) => Promise<void>; onAdmin: () => void; onCancel?: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = await must(supabase.rpc('tpt_join_team', { p_code: code }));
      if (!id) setError("That code doesn't match a team.");
      else await onJoined(id as string);
    } catch (e) {
      setError(errorCode(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <div className="card gate-card">
        <div className="brand-mark">✓</div>
        <h1>Team Tracker</h1>
        <p className="dim">Enter your team's join code.</p>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            className="code-input"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="CODE"
            maxLength={12}
            autoCapitalize="characters"
            autoComplete="off"
          />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy || code.length < 4}>
            Join team
          </button>
        </form>
        <div className="row between gate-foot">
          {onCancel ? (
            <button className="link-btn" onClick={onCancel}>
              ← Back
            </button>
          ) : (
            <span />
          )}
          <button className="link-btn dim" onClick={onAdmin}>
            Admin
          </button>
        </div>
      </div>
    </div>
  );
}

type Tab = 'board' | 'schedule' | 'team' | 'recap';
const TABS: { id: Tab; label: string }[] = [
  { id: 'board', label: 'Board' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'team', label: 'Team' },
  { id: 'recap', label: 'Recap' },
];

function TeamApp(props: {
  teamId: string;
  teams: Team[];
  isAdmin: boolean;
  onSwitch: (id: string) => void;
  onJoinAnother: () => void;
  onAdmin: () => void;
  onLeave: () => Promise<void>;
}) {
  const { teamId, isAdmin } = props;
  const { data, error, reload } = useTeamData(teamId);
  const [memberId, setMemberIdState] = useState<string | null>(() => storedMemberId(teamId));
  const [picking, setPicking] = useState(false);
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return (sessionStorage.getItem('tpt-tab') as Tab) || 'board';
    } catch {
      return 'board';
    }
  });

  const chooseTab = (t: Tab) => {
    setTab(t);
    try {
      sessionStorage.setItem('tpt-tab', t);
    } catch {
      /* ignore */
    }
  };

  const setMember = (id: string | null) => {
    storeMemberId(teamId, id);
    setMemberIdState(id);
    setPicking(false);
  };

  if (error && !data) {
    return (
      <div className="gate">
        <div className="card gate-card">
          <h1>Couldn't load the team</h1>
          <p className="error">{error}</p>
          <button className="btn btn-primary" onClick={() => void reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (!data) return <Spinner />;

  const me = data.members.find((m) => m.id === memberId) ?? null;
  const readOnly = data.team.status === 'archived' && !isAdmin;
  const ctx: Ctx = { data, me, isAdmin, readOnly, reload };

  // memberId 'admin' = the admin chose to browse without being a teammate.
  const needsPick = picking || (!me && !readOnly && !(isAdmin && memberId === 'admin'));
  if (needsPick) {
    return (
      <PickMember
        ctx={ctx}
        onPick={async (m) => {
          if (m && m.id !== memberId) await logActivity(teamId, m.id, 'checked in', '');
          setMember(m?.id ?? (isAdmin ? 'admin' : null));
        }}
        onCancel={me || isAdmin ? () => setPicking(false) : undefined}
      />
    );
  }

  return (
    <div className="app">
      <Header ctx={ctx} {...props} tab={tab} onTab={chooseTab} onWho={() => setPicking(true)} />
      {readOnly && <div className="banner">This team is archived. Everything is read-only.</div>}
      <main className="page">
        {tab === 'board' && <Board ctx={ctx} />}
        {tab === 'schedule' && <Schedule ctx={ctx} />}
        {tab === 'team' && <TeamView ctx={ctx} />}
        {tab === 'recap' && <Recap ctx={ctx} />}
      </main>
      <footer className="footer no-print">
        <span>{data.team.course}</span>
        <button className="link-btn" onClick={props.onAdmin}>
          {isAdmin ? 'Admin panel' : 'Admin'}
        </button>
      </footer>
    </div>
  );
}

function Header({
  ctx,
  teams,
  tab,
  onTab,
  onWho,
  onSwitch,
  onJoinAnother,
  onAdmin,
  onLeave,
}: {
  ctx: Ctx;
  teams: Team[];
  tab: Tab;
  onTab: (t: Tab) => void;
  onWho: () => void;
  onSwitch: (id: string) => void;
  onJoinAnother: () => void;
  onAdmin: () => void;
  onLeave: () => Promise<void>;
}) {
  const { team } = ctx.data;
  return (
    <header className="topbar no-print">
      <div className="topbar-inner">
        <div className="brand">
          <span className="brand-mark sm">✓</span>
          <div>
            <div className="brand-name">{team.name}</div>
            <div className="brand-sub">
              {team.course}
              <DayCounter team={team} />
            </div>
          </div>
        </div>
        <div className="topbar-right">
          <button className="who" onClick={onWho} title="Switch who you are">
            <Avatar member={ctx.me} size={26} />
            <span className="who-name">{ctx.me?.name ?? (ctx.isAdmin ? 'Admin' : 'Who are you?')}</span>
          </button>
          <details className="menu">
            <summary aria-label="Menu">☰</summary>
            <div className="menu-pop">
              {teams.length > 1 &&
                teams
                  .filter((t) => t.id !== team.id)
                  .map((t) => (
                    <button key={t.id} onClick={() => onSwitch(t.id)}>
                      Switch to {t.name}
                    </button>
                  ))}
              <button onClick={onJoinAnother}>Join another team</button>
              <button onClick={onAdmin}>{ctx.isAdmin ? 'Admin panel' : 'Admin login'}</button>
              {!ctx.isAdmin && <button onClick={() => void onLeave()}>Leave this team</button>}
            </div>
          </details>
        </div>
      </div>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}

function DayCounter({ team }: { team: Team }) {
  if (!team.starts_on || !team.ends_on) return null;
  const start = parseDay(team.starts_on).getTime();
  const end = parseDay(team.ends_on).getTime();
  const today = parseDay(todayStr()).getTime();
  const total = Math.round((end - start) / 86400000) + 1;
  const day = Math.round((today - start) / 86400000) + 1;
  if (day < 1) return <> · starts {fmtDay(team.starts_on)}</>;
  if (day > total) return <> · ended {fmtDay(team.ends_on)}</>;
  return (
    <>
      {' '}
      · day {day} of {total}
    </>
  );
}

function PickMember({ ctx, onPick, onCancel }: { ctx: Ctx; onPick: (m: Member | null) => Promise<void>; onCancel?: () => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="gate">
      <div className="card gate-card wide">
        <span className="eyebrow">{ctx.data.team.name}</span>
        <h1>Who are you?</h1>
        <p className="dim">This device will remember you. You can switch any time from the top bar.</p>
        <div className="pick-grid">
          {ctx.data.members.map((m) => (
            <button key={m.id} className={`pick ${m.id === ctx.me?.id ? 'on' : ''}`} onClick={() => void onPick(m)}>
              <Avatar member={m} size={40} />
              <span className="pick-name">{m.name}</span>
              {m.role && <span className="dim small">{m.role}</span>}
            </button>
          ))}
        </div>
        <div className="row between gate-foot wrap gap-s">
          {!ctx.readOnly ? (
            <button className="link-btn" onClick={() => setAdding(true)}>
              I'm not on the list
            </button>
          ) : (
            <span />
          )}
          <div className="row gap-s">
            {ctx.isAdmin && (
              <button className="link-btn" onClick={() => void onPick(null)}>
                Continue as admin only
              </button>
            )}
            {onCancel && (
              <button className="link-btn" onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
      {adding && <MemberModal ctx={ctx} member={null} onClose={() => setAdding(false)} onCreated={(m) => void onPick(m)} />}
    </div>
  );
}

function SetupNeeded() {
  return (
    <div className="gate">
      <div className="card gate-card wide">
        <h1>Almost there</h1>
        <p>
          Copy <code>.env.example</code> to <code>.env</code> and fill in your Supabase URL and anon key, then restart <code>npm run dev</code>.
        </p>
        <p className="dim small">See README → Setup.</p>
      </div>
    </div>
  );
}
