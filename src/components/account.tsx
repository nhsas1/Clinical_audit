import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LockKeyhole, LogIn, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { useAuth, type Permission } from '../lib/auth';
import { useEscape, PageIntro } from './ui';
import { T } from '../lib/content';

const ROLE_LABEL = { admin: 'Admin', auditor: 'Auditor', viewer: 'Viewer' } as const;

function initials(email: string | null) {
  if (!email) return '?';
  const name = email.split('@')[0].split(/[._-]+/).filter(Boolean);
  return ((name[0]?.[0] ?? '') + (name[1]?.[0] ?? name[0]?.[1] ?? '')).toUpperCase();
}

/** Top-right account control: sign-in icon when signed out; avatar, role and sign-out when signed in. */
export function UserMenu() {
  const auth = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEscape(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!auth.enabled) return <span className="role-badge sample" title="Supabase is not configured; nothing is saved">Sample mode</span>;
  if (!auth.session) return <Link className="icon-btn signin-btn" to="/signin" state={{ from: location.pathname }} aria-label="Sign in" title="Sign in"><LogIn size={18} aria-hidden="true" /></Link>;

  return <div className="user-menu" ref={ref}>
    <button className="avatar-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Account: ${auth.email}, ${auth.role ? ROLE_LABEL[auth.role] : 'loading role'}`} onClick={() => setOpen(o => !o)}>
      <span className="avatar" aria-hidden="true">{initials(auth.email)}</span>
      {auth.role && <span className={'role-badge ' + auth.role}>{ROLE_LABEL[auth.role]}</span>}
    </button>
    {open && <div className="menu" role="menu">
      <div className="menu-head"><strong>{auth.email}</strong><span>Role: {auth.role ? ROLE_LABEL[auth.role] : '…'}</span></div>
      <button role="menuitem" className="menu-item" onClick={async () => { setOpen(false); await auth.signOut(); }}><LogOut size={15} aria-hidden="true" /> <T>Sign out</T></button>
    </div>}
  </div>;
}

/** Wraps a page that needs a signed-in user. */
export function RequireSignIn({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (!auth.enabled || auth.session) return <>{children}</>;
  if (!auth.ready) return null;
  return <><PageIntro title="Sign in to continue" subtitle="Dashboards are open to everyone. Registers, reports and directories need a signed-in account." />
    <div className="empty module-empty"><LockKeyhole size={28} aria-hidden="true" /><strong>This page needs a signed-in account</strong><span>Ask an admin for access if you do not have an account.</span><Link className="btn primary" to="/signin" state={{ from: location.pathname }}><LogIn size={15} aria-hidden="true" /> <T>Sign in</T></Link></div></>;
}

/** Shows children only when the current role has `perm`; otherwise an optional fallback. */
export function Can({ perm, children, fallback = null }: { perm: Permission; children: ReactNode; fallback?: ReactNode }) {
  return useAuth().can(perm) ? <>{children}</> : <>{fallback}</>;
}

export function SignIn() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/overview';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  useEffect(() => { if (auth.session) navigate(from, { replace: true }); }, [auth.session, from, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage(null);
    const err = await auth.signIn(email.trim(), password);
    setBusy(false);
    if (err) setMessage({ tone: 'error', text: err });
  }
  async function link() {
    if (!email.trim()) { setMessage({ tone: 'error', text: 'Enter your email address first.' }); return; }
    setBusy(true); setMessage(null);
    const err = await auth.sendLink(email.trim());
    setBusy(false);
    setMessage(err ? { tone: 'error', text: err } : { tone: 'ok', text: 'If the address has an account, a sign-in link is on its way.' });
  }

  return <><PageIntro eyebrow="ACCOUNT" title="Sign in" subtitle="Use the account an admin created for you. There is no self-registration." />
    <div className="signin-card">
      {!auth.enabled ? <div className="notice"><LockKeyhole size={15} aria-hidden="true" /> Sign-in is not available: this copy runs as a sample without Supabase.</div> :
        <form onSubmit={submit} noValidate>
          <label className="field-label">Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label className="field-label">Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
          {message && <div className={message.tone === 'error' ? 'form-msg error' : 'form-msg ok'} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</div>}
          <div className="signin-actions">
            <button className="btn primary" type="submit" disabled={busy || !email || !password}><LogIn size={15} aria-hidden="true" /> {busy ? 'Signing in…' : 'Sign in'}</button>
            <button className="btn" type="button" disabled={busy} onClick={link}><Mail size={15} aria-hidden="true" /> Email me a sign-in link</button>
          </div>
        </form>}
      <p className="muted signin-note"><ShieldCheck size={13} aria-hidden="true" /> Simulation with fictional data. Roles: viewer (read), auditor (audit records), admin (everything, including page text).</p>
    </div></>;
}
