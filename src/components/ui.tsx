import { useEffect, type ReactNode } from 'react';
import { initials } from '../lib/format';
import type { Member } from '../lib/types';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Avatar({ member, size = 28 }: { member: Member | null | undefined; size?: number }) {
  if (!member) {
    return (
      <span className="avatar avatar-empty" style={{ width: size, height: size, fontSize: size * 0.4 }} title="Unassigned">
        ?
      </span>
    );
  }
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.4, background: member.color }}
      title={member.name}
    >
      {initials(member.name)}
    </span>
  );
}

export type Segment = { value: number; className: string; label: string };

export function ProgressBar({ total, segments, thin }: { total: number; segments: Segment[]; thin?: boolean }) {
  return (
    <div className={`bar ${thin ? 'bar-thin' : ''}`} role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(', ')}>
      {total > 0 &&
        segments.map((s) =>
          s.value > 0 ? <span key={s.label} className={s.className} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} /> : null,
        )}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="center-screen">
      <div className="spinner" />
    </div>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? <p className="error">{error}</p> : null;
}
