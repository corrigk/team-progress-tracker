import type { Ctx } from './ctx';
import { logActivity } from './teamData';
import { must, supabase } from './supabase';
import type { Task, TaskStatus } from './types';

async function updateTask(ctx: Ctx, task: Task, patch: Partial<Task>, verb: string) {
  await must(supabase.from('tpt_tasks').update(patch).eq('id', task.id));
  await logActivity(ctx.data.team.id, ctx.me?.id ?? null, verb, task.title);
  await ctx.reload();
}

export function moveTask(ctx: Ctx, task: Task, status: TaskStatus) {
  const verb = status === 'doing' ? (task.status === 'done' ? 'reopened' : 'started') : status === 'done' ? 'finished' : 'moved back';
  return updateTask(
    ctx,
    task,
    {
      status,
      done_at: status === 'done' ? new Date().toISOString() : null,
      confirmed_by: null,
      confirmed_at: null,
    },
    verb,
  );
}

export function confirmTask(ctx: Ctx, task: Task) {
  if (!ctx.me) throw new Error('Pick who you are first');
  return updateTask(ctx, task, { confirmed_by: ctx.me.id, confirmed_at: new Date().toISOString() }, 'confirmed');
}

export function unconfirmTask(ctx: Ctx, task: Task) {
  return updateTask(ctx, task, { confirmed_by: null, confirmed_at: null }, 'un-confirmed');
}

/** The rule shown everywhere: anyone but the owner can confirm. */
export function canConfirm(ctx: Ctx, task: Task): boolean {
  return !ctx.readOnly && !!ctx.me && task.status === 'done' && !task.confirmed_by && task.owner_id !== ctx.me.id;
}
