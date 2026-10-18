const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** 'YYYY-MM-DD' (a date column) as a local Date at midnight. */
export function parseDay(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDay(d: string): string {
  return dayFmt.format(parseDay(d));
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${dayFmt.format(d)} · ${timeFmt.format(d)}`;
}

export function fmtTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

export function fmtDayOf(iso: string): string {
  return dayFmt.format(new Date(iso));
}

/** "in 2d 4h", "in 35m", "3h ago" */
export function relative(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const text = d >= 1 ? `${d}d ${h % 24}h` : h >= 1 ? `${h}h ${m % 60}m` : `${Math.max(m, 1)}m`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

/** ISO -> value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export const MEMBER_COLORS = ['#CFB991', '#8E6F3E', '#3E6FA8', '#2F7A5B', '#A23B3B', '#7A4E9C', '#C77D2E', '#555960'];

/** ISO timestamp -> local 'YYYY-MM-DD'. */
export function localDay(iso: string): string {
  return toLocalInput(iso).slice(0, 10);
}
