import { useCallback, useEffect, useRef, useState } from 'react';
import { must, supabase } from './supabase';
import type { Activity, Lesson, Member, Task, Team, TeamData, TeamEvent } from './types';

export async function fetchTeamData(teamId: string): Promise<TeamData> {
  const [team, members, events, tasks, activity, lessons] = await Promise.all([
    must(supabase.from('tpt_teams').select('*').eq('id', teamId).single<Team>()),
    must(supabase.from('tpt_members').select('*').eq('team_id', teamId).order('sort').order('created_at').returns<Member[]>()),
    must(supabase.from('tpt_events').select('*').eq('team_id', teamId).order('due_at').returns<TeamEvent[]>()),
    must(supabase.from('tpt_tasks').select('*').eq('team_id', teamId).order('created_at').returns<Task[]>()),
    must(
      supabase
        .from('tpt_activity')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(1000)
        .returns<Activity[]>(),
    ),
    must(supabase.from('tpt_lessons').select('*').eq('team_id', teamId).order('created_at').returns<Lesson[]>()),
  ]);
  return { team, members, events, tasks, activity, lessons };
}

const TABLES = ['tpt_teams', 'tpt_members', 'tpt_events', 'tpt_tasks', 'tpt_activity', 'tpt_lessons'];

/** All of one team's data, kept live: any change from any teammate triggers a (debounced) refetch. */
export function useTeamData(teamId: string) {
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(teamId);
  latest.current = teamId;

  const reload = useCallback(async () => {
    try {
      const next = await fetchTeamData(teamId);
      if (latest.current === teamId) {
        setData(next);
        setError(null);
      }
    } catch (e) {
      if (latest.current === teamId) setError(e instanceof Error ? e.message : String((e as { message?: string }).message ?? e));
    }
  }, [teamId]);

  useEffect(() => {
    setData(null);
    void reload();
    let timer: number | undefined;
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void reload(), 250);
    };
    let channel = supabase.channel(`tpt-${teamId}-${Math.random().toString(36).slice(2)}`);
    for (const table of TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, soon);
    }
    channel.subscribe();
    const onFocus = () => soon();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      void supabase.removeChannel(channel);
    };
  }, [teamId, reload]);

  return { data, error, reload };
}

export async function logActivity(teamId: string, memberId: string | null, verb: string, subject: string) {
  // Best effort: the log is nice to have, never worth failing an action over.
  await supabase.from('tpt_activity').insert({ team_id: teamId, member_id: memberId, verb, subject });
}

export async function downloadTeamExport(teamId: string) {
  const data = await fetchTeamData(teamId);
  const code = await supabase.rpc('tpt_join_code', { p_team: teamId });
  const payload = { exported_at: new Date().toISOString(), join_code: code.data ?? null, ...data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const slug = data.team.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  a.href = URL.createObjectURL(blob);
  a.download = `${slug || 'team'}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
