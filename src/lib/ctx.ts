import type { Member, TeamData } from './types';

/** What every team screen needs. */
export type Ctx = {
  data: TeamData;
  me: Member | null;
  isAdmin: boolean;
  /** Archived team viewed by a student: everything is read-only. */
  readOnly: boolean;
  reload: () => Promise<void>;
};

export function memberName(ctx: Ctx, id: string | null): string {
  if (!id) return 'Unassigned';
  return ctx.data.members.find((m) => m.id === id)?.name ?? 'Former member';
}
