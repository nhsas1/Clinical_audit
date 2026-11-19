// Supabase Auth session + the signed-in user's role.
//
// The UI hides or disables actions a role cannot perform, but the real
// enforcement is row level security in Supabase (migration 005): a hidden
// button is a convenience, never the protection.
//
// Without Supabase configured (local sample mode) there is nothing to sign in
// to; the app runs as an open sample with a banner saying so.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Role = 'admin' | 'auditor' | 'viewer';
export type Permission = 'view.detail' | 'audit.write' | 'report.write' | 'liaison.write' | 'reference.write' | 'content.edit';

export const PERMISSIONS: Record<Permission, Role[]> = {
  'view.detail': ['admin', 'auditor', 'viewer'],
  'audit.write': ['admin', 'auditor'],
  'report.write': ['admin', 'auditor'],
  'liaison.write': ['admin'],
  'reference.write': ['admin'],
  'content.edit': ['admin'],
};

export function roleCan(role: Role | null, p: Permission) {
  return role != null && PERMISSIONS[p].includes(role);
}

/** Routes a signed-out visitor may open: the dashboards (Overview, Training dashboard tab) and certificate checks. */
export const PUBLIC_PATHS = ['/', '/overview', '/training', '/signin'];
export const isPublicPath = (path: string) => PUBLIC_PATHS.includes(path) || path.startsWith('/verify/');

type AuthCtx = {
  /** False when Supabase is not configured (open sample mode). */
  enabled: boolean;
  ready: boolean;
  session: Session | null;
  email: string | null;
  role: Role | null;
  can: (p: Permission) => boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  sendLink: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const enabled = Boolean(supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [ready, setReady] = useState(!enabled);

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    supabase.auth.getSession().then(({ data }) => { if (live) { setSession(data.session); setReady(true); } });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => { live = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase || !session) { setRole(null); return; }
    let live = true;
    supabase.rpc('my_role').then(({ data, error }) => {
      if (!live) return;
      setRole(!error && (data === 'admin' || data === 'auditor' || data === 'viewer') ? data : 'viewer');
    });
    return () => { live = false; };
  }, [session]);

  const value = useMemo<AuthCtx>(() => {
    // Open sample mode behaves like an admin so every screen can be demonstrated;
    // nothing is saved anywhere in that mode.
    const effective: Role | null = enabled ? role : 'admin';
    return {
      enabled, ready, session, role: effective,
      email: session?.user.email ?? null,
      can: p => roleCan(effective, p),
      signIn: async (email, password) => {
        if (!supabase) return 'Sign-in is not available in sample mode.';
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? 'Email or password not recognised.' : null;
      },
      sendLink: async email => {
        if (!supabase) return 'Sign-in is not available in sample mode.';
        const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/overview` } });
        return error ? 'The sign-in link could not be sent. Check the address or ask an admin for access.' : null;
      },
      signOut: async () => { await supabase?.auth.signOut(); },
    };
  }, [enabled, ready, session, role]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
