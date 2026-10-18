import { storageSuffix } from './supabase';

/** Which team this device is looking at, and which teammate this device is, per team. */
type Stored = { teamId: string | null; memberByTeam: Record<string, string> };

const KEY = `tpt-identity${storageSuffix}`;

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { teamId: null, memberByTeam: {}, ...JSON.parse(raw) };
  } catch {
    /* private mode etc. */
  }
  return { teamId: null, memberByTeam: {} };
}

function write(s: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function storedTeamId(): string | null {
  return read().teamId;
}

export function storeTeamId(teamId: string | null) {
  write({ ...read(), teamId });
}

export function storedMemberId(teamId: string): string | null {
  return read().memberByTeam[teamId] ?? null;
}

export function storeMemberId(teamId: string, memberId: string | null) {
  const s = read();
  const memberByTeam = { ...s.memberByTeam };
  if (memberId) memberByTeam[teamId] = memberId;
  else delete memberByTeam[teamId];
  write({ ...s, memberByTeam });
}
