import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, FileText, Loader2, X } from 'lucide-react';
import { band, bandLabel } from '../lib/utils';

export function PageIntro({ eyebrow = 'NURSING CLINICAL AUDIT', title, subtitle, action }: { eyebrow?: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-intro"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

export function Kpi({ label, value, meta, tone = 'navy', icon: Icon }: { label: string; value: ReactNode; meta: string; tone?: string; icon: React.ElementType }) {
  return <div className="kpi"><div className="kpi-top"><span>{label}</span><div className={'kpi-icon ' + tone}><Icon size={17} aria-hidden="true" /></div></div><strong>{value}</strong><small>{meta}</small></div>;
}

export function Status({ value }: { value: string }) {
  return <span className={'status ' + value.toLowerCase().replaceAll(' ', '-')}>{value}</span>;
}

export function Score({ value }: { value: number | null | undefined }) {
  return <span className={'score ' + band(value)}>{value == null ? '—' : `${value}%`}<em>{value != null && bandLabel(value)}</em></span>;
}

export function Section({ title, meta, children, action }: { title: string; meta?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="panel"><div className="panel-head"><div><h2>{title}</h2>{meta && <span>{meta}</span>}</div>{action}</div>{children}</section>;
}

export function Loading({ label = 'Loading records…' }: { label?: string }) {
  return <div className="empty" role="status"><Loader2 size={22} className="spin" aria-hidden="true" /><span>{label}</span></div>;
}

export function Empty({ title = 'No records match these filters', hint = 'Try changing the ward filter or the status selection.' }: { title?: string; hint?: string }) {
  return <div className="empty"><FileText size={24} aria-hidden="true" /><strong>{title}</strong><span>{hint}</span></div>;
}

/** Table shell: loading state first, empty state only once data has arrived. */
export function Table({ children, empty = false, loading = false, emptyTitle, emptyHint, className = '' }: { children: ReactNode; empty?: boolean; loading?: boolean; emptyTitle?: string; emptyHint?: string; className?: string }) {
  return <div className="table-wrap">{loading ? <Loading /> : empty ? <Empty title={emptyTitle} hint={emptyHint} /> : <table className={'data-table ' + className}>{children}</table>}</div>;
}

/** Calls `onEscape` when Escape is pressed while `active`. */
export function useEscape(active: boolean, onEscape: () => void) {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') ref.current(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active]);
}

/** Side drawer: labelled close button, Escape to close, focus moved inside. */
export function Drawer({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEscape(true, onClose);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" role="dialog" aria-modal="true" aria-label={label} onClick={e => e.stopPropagation()}><button ref={closeRef} className="drawer-close" onClick={onClose} aria-label={`Close ${label.toLowerCase()}`}><X size={20} aria-hidden="true" /></button>{children}</aside></div>;
}

export function Modal({ label, eyebrow, onClose, children }: { label: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  useEscape(true, onClose);
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" role="dialog" aria-modal="true" aria-label={label} onClick={e => e.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">{eyebrow}</div><h2>{label}</h2></div><button className="icon-btn" onClick={onClose} aria-label="Close dialog"><X size={18} aria-hidden="true" /></button></div>{children}</div></div>;
}

/** Keeps one broken page from blanking the whole app. Reset on route change via `key`. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Page error', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="empty module-empty" role="alert"><AlertTriangle size={28} aria-hidden="true" /><strong>This page could not be displayed</strong><span>Something in the sample data could not be shown. Other pages still work.</span><button className="btn" onClick={() => this.setState({ error: null })}>Try again</button></div>;
  }
}
