import type { Segment } from '../components/ui';
import { localDay, todayStr } from './format';
import { columnOf, type Task } from './types';

export function isOverdue(t: Task, today = todayStr()): boolean {
  return !!t.due_on && t.due_on < today && t.status !== 'done';
}

export function counts(tasks: Task[]) {
  const c = { todo: 0, doing: 0, review: 0, confirmed: 0, total: tasks.length, overdue: 0 };
  const today = todayStr();
  for (const t of tasks) {
    c[columnOf(t)]++;
    if (isOverdue(t, today)) c.overdue++;
  }
  return c;
}

export type Counts = ReturnType<typeof counts>;

export function pct(c: Counts): number {
  return c.total ? Math.round((c.confirmed / c.total) * 100) : 0;
}

export function segments(c: Counts): Segment[] {
  return [
    { value: c.confirmed, className: 'seg-confirmed', label: 'Confirmed' },
    { value: c.review, className: 'seg-review', label: 'Needs confirmation' },
    { value: c.doing, className: 'seg-doing', label: 'In progress' },
  ];
}

/** Finished on or before its due date (or its milestone's time). */
export function onTime(t: Task, eventDue?: string): boolean | null {
  if (!t.done_at) return null;
  if (t.due_on) return localDay(t.done_at) <= t.due_on;
  if (eventDue) return t.done_at <= eventDue;
  return null;
}
