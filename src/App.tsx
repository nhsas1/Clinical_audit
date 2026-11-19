import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, AlertTriangle, BookOpen, CalendarDays, ChevronRight, ClipboardCheck, FileText, FlaskConical, GraduationCap, LayoutDashboard, LockKeyhole, Menu, Moon, Settings2, ShieldCheck, Sun, Users, X } from 'lucide-react';
import ToastHost from './components/ToastHost';
import { ErrorBoundary, PageIntro, useEscape } from './components/ui';
import { HubProvider, useHub } from './lib/store';
import { ScopeFilter } from './components/hierarchy';
import { Actions, Overview, Pending, Planned, Unplanned, useScoped } from './pages/AuditPages';
import { Initiatives, Liaisons, Reports, Standards, Tools, Verify } from './pages/ResourcePages';
import { TrainingLibrary } from './pages/training/TrainingLibrary';
import { TrainingProvider } from './lib/trainingStore';
import { plural } from './lib/utils';
import { AuthProvider, isPublicPath, useAuth } from './lib/auth';
import { RequireSignIn, SignIn, UserMenu } from './components/account';
import { ContentPage, ContentProvider, T } from './lib/content';
import { EditBar, EditToggle, TextEditor } from './components/editing';

type NavItem = { href: string; label: string; icon: React.ElementType; badge?: 'pending' | 'actions' };
const navGroups: { label: string; items: NavItem[] }[] = [
  { label: 'Audit programme', items: [
    { href: '/overview', label: 'Overview', icon: LayoutDashboard }, { href: '/planned', label: 'Planned audits', icon: CalendarDays },
    { href: '/unplanned', label: 'Unplanned audits', icon: AlertTriangle }, { href: '/pending', label: 'Pending audits', icon: Activity, badge: 'pending' },
    { href: '/actions', label: 'Action plans', icon: ClipboardCheck, badge: 'actions' }] },
  { label: 'Resources', items: [
    { href: '/tools', label: 'Audit tools', icon: Settings2 }, { href: '/reports', label: 'Reports', icon: FileText }, { href: '/standards', label: 'Standards and policies', icon: BookOpen }] },
  { label: 'People and learning', items: [
    { href: '/initiatives', label: 'Quality initiatives', icon: FlaskConical }, { href: '/training', label: 'Training library', icon: GraduationCap },
 { href: '/liaisons', label: 'Quality liaisons', icon: Users }] },
];
const allItems = navGroups.flatMap(g => g.items);

function Shell() {
  const hub = useHub();
  const auth = useAuth();
  const locked = (href: string) => auth.enabled && !auth.session && !isPublicPath(href);
  const { queue, open } = useScoped();
  const [dark, setDark] = useState(false);
  const [mobile, setMobile] = useState(false);
  const location = useLocation();
  const path = location.pathname === '/' ? '/overview' : location.pathname;
  const title = allItems.find(x => x.href === path)?.label ?? (path.startsWith('/verify') ? 'Certificate verification' : path === '/signin' ? 'Sign in' : 'Page not found');
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => { document.title = `${title} · Nursing Audit Hub`; }, [title]);
  useEscape(mobile, () => setMobile(false));
  const pageName = path.startsWith('/verify') ? 'verify' : path.replace(/^\//, '') || 'overview';
  const headerHospital = hub.scope.hospital ? hub.hospital(hub.scope.hospital)?.name ?? 'All hospitals' : 'All hospitals';
  const badge = (b?: NavItem['badge']) => hub.loading || !b ? null : b === 'pending'
    ? { n: queue.length, label: plural(queue.length, 'pending audit') }
    : { n: open.length, label: plural(open.length, 'open action') };

  return <div className="app-shell">
    <aside className={mobile ? 'sidebar open' : 'sidebar'} aria-label="Main navigation">
      <div className="brand"><div className="brand-mark"><ShieldCheck size={19} aria-hidden="true" /></div><div><div className="brand-name"><T page="shell">Nursing Audit</T></div><div className="brand-sub"><T page="shell">Clinical quality hub</T></div></div><button className="icon-btn mobile-close" onClick={() => setMobile(false)} aria-label="Close navigation"><X size={18} aria-hidden="true" /></button></div>
      <nav>{navGroups.map(group => <div className="nav-group" key={group.label}><div className="nav-label"><T page="shell">{group.label}</T></div>{group.items.map(item => { const Icon = item.icon; const b = badge(item.badge); return <NavLink onClick={() => setMobile(false)} className={({ isActive }) => isActive || (item.href === '/overview' && location.pathname === '/') ? 'nav-item active' : 'nav-item'} to={item.href} key={item.href}><Icon size={17} aria-hidden="true" /><span><T page="shell">{item.label}</T></span>{locked(item.href) ? <LockKeyhole size={13} className="nav-lock" aria-label="Sign-in needed" /> : b && b.n > 0 && <span className="nav-badge" aria-label={b.label}>{b.n}</span>}</NavLink>; })}</div>)}</nav>
      <div className="sidebar-foot"><div className="user-chip"><ShieldCheck size={16} aria-hidden="true" /><div><strong>{!auth.enabled ? 'Sample mode' : auth.session ? auth.email : 'Signed out'}</strong><span>{!auth.enabled ? 'Nothing is saved' : auth.session ? `Role: ${auth.role ?? '…'}` : 'Dashboards only'}</span></div></div></div>
    </aside>
    {mobile && <div className="sidebar-scrim" onClick={() => setMobile(false)} aria-hidden="true" />}
    <main className="main">
      <header className="topbar">
        <button className="icon-btn menu-trigger" onClick={() => setMobile(true)} aria-label="Open navigation" aria-expanded={mobile}><Menu size={20} aria-hidden="true" /></button>
        <div className="crumb"><span className="crumb-hospital">{headerHospital}</span><ChevronRight size={14} aria-hidden="true" /><strong>{title}</strong></div>
        <div className="top-actions">
          <button className="icon-btn" onClick={() => setDark(!dark)} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>{dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}</button>
          <EditToggle />
          <UserMenu />
        </div>
      </header>
      <EditBar />
      <div className="filter-bar"><ScopeFilter /></div>
      <nav className="mobile-nav" aria-label="Pages">{allItems.map(item => <NavLink key={item.href} to={item.href}>{item.label}</NavLink>)}</nav>
      <section className="page-wrap">
        <ContentPage name={pageName}>
        <ErrorBoundary key={location.pathname}>
          <Routes>
            <Route path="/" element={<Overview />} /><Route path="/overview" element={<Overview />} />
            {([['/planned', Planned], ['/unplanned', Unplanned], ['/pending', Pending], ['/actions', Actions], ['/tools', Tools], ['/reports', Reports], ['/standards', Standards], ['/initiatives', Initiatives], ['/liaisons', Liaisons]] as const)
              .map(([href, Page]) => <Route key={href} path={href} element={<RequireSignIn><Page /></RequireSignIn>} />)}
            <Route path="/training" element={<TrainingLibrary />} />
            <Route path="/certificates" element={<Navigate to="/training?tab=exams" replace />} />
            <Route path="/verify/:certificateNumber" element={<Verify />} /><Route path="/signin" element={<SignIn />} />
            <Route path="*" element={<><PageIntro title="Page not found" subtitle="This address does not match a page in the hub. Use the navigation to continue." /></>} />
          </Routes>
        </ErrorBoundary>
        </ContentPage>
      </section>
      <footer><T page="shell">Simulation with sample data. Not for clinical or operational use.</T></footer>
      <TextEditor />
      <ToastHost />
    </main>
  </div>;
}

export default function App() {
  return <AuthProvider><ContentProvider><HubProvider><TrainingProvider><Shell /></TrainingProvider></HubProvider></ContentProvider></AuthProvider>;
}
