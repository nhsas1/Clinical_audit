import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, AlertTriangle, BookOpen, CalendarDays, ChevronRight, ClipboardCheck, FileText, FlaskConical, GraduationCap, LayoutDashboard, Menu, Moon, Settings2, ShieldCheck, Sun, Users, X } from 'lucide-react';
import ToastHost from './components/ToastHost';
import { ErrorBoundary, PageIntro, useEscape } from './components/ui';
import { HubProvider, useHub } from './lib/store';
import { ScopeFilter } from './components/hierarchy';
import { Actions, Overview, Pending, Planned, Unplanned, useScoped } from './pages/AuditPages';
import { Certificates, Initiatives, Liaisons, Reports, Standards, Tools, Training, Verify } from './pages/ResourcePages';
import { plural } from './lib/utils';

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
    { href: '/certificates', label: 'Certificates', icon: ShieldCheck }, { href: '/liaisons', label: 'Quality liaisons', icon: Users }] },
];
const allItems = navGroups.flatMap(g => g.items);

function Shell() {
  const hub = useHub();
  const { queue, open } = useScoped();
  const [dark, setDark] = useState(false);
  const [mobile, setMobile] = useState(false);
  const location = useLocation();
  const path = location.pathname === '/' ? '/overview' : location.pathname;
  const title = allItems.find(x => x.href === path)?.label ?? (path.startsWith('/verify') ? 'Certificate verification' : 'Page not found');
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => { document.title = `${title} · Nursing Audit Hub`; }, [title]);
  useEscape(mobile, () => setMobile(false));
  const headerHospital = hub.scope.hospital ? hub.hospital(hub.scope.hospital)?.name ?? 'All hospitals' : 'All hospitals';
  const badge = (b?: NavItem['badge']) => hub.loading || !b ? null : b === 'pending'
    ? { n: queue.length, label: plural(queue.length, 'pending audit') }
    : { n: open.length, label: plural(open.length, 'open action') };

  return <div className="app-shell">
    <aside className={mobile ? 'sidebar open' : 'sidebar'} aria-label="Main navigation">
      <div className="brand"><div className="brand-mark"><ShieldCheck size={19} aria-hidden="true" /></div><div><div className="brand-name">Nursing Audit</div><div className="brand-sub">Clinical quality hub</div></div><button className="icon-btn mobile-close" onClick={() => setMobile(false)} aria-label="Close navigation"><X size={18} aria-hidden="true" /></button></div>
      <nav>{navGroups.map(group => <div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{group.items.map(item => { const Icon = item.icon; const b = badge(item.badge); return <NavLink onClick={() => setMobile(false)} className={({ isActive }) => isActive || (item.href === '/overview' && location.pathname === '/') ? 'nav-item active' : 'nav-item'} to={item.href} key={item.href}><Icon size={17} aria-hidden="true" /><span>{item.label}</span>{b && b.n > 0 && <span className="nav-badge" aria-label={b.label}>{b.n}</span>}</NavLink>; })}</div>)}</nav>
      <div className="sidebar-foot"><div className="user-chip"><div className="avatar" aria-hidden="true">QA</div><div><strong>Quality admin</strong><span>Simulation role</span></div></div></div>
    </aside>
    {mobile && <div className="sidebar-scrim" onClick={() => setMobile(false)} aria-hidden="true" />}
    <main className="main">
      <header className="topbar">
        <button className="icon-btn menu-trigger" onClick={() => setMobile(true)} aria-label="Open navigation" aria-expanded={mobile}><Menu size={20} aria-hidden="true" /></button>
        <div className="crumb"><span className="crumb-hospital">{headerHospital}</span><ChevronRight size={14} aria-hidden="true" /><strong>{title}</strong></div>
        <div className="top-actions">
          <button className="icon-btn" onClick={() => setDark(!dark)} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>{dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}</button>
          <div className="avatar top-avatar" aria-hidden="true">QA</div>
        </div>
      </header>
      <div className="filter-bar"><ScopeFilter /></div>
      <nav className="mobile-nav" aria-label="Pages">{allItems.map(item => <NavLink key={item.href} to={item.href}>{item.label}</NavLink>)}</nav>
      <section className="page-wrap">
        <ErrorBoundary key={location.pathname}>
          <Routes>
            <Route path="/" element={<Overview />} /><Route path="/overview" element={<Overview />} />
            <Route path="/planned" element={<Planned />} /><Route path="/unplanned" element={<Unplanned />} />
            <Route path="/pending" element={<Pending />} /><Route path="/actions" element={<Actions />} />
            <Route path="/tools" element={<Tools />} /><Route path="/reports" element={<Reports />} />
            <Route path="/standards" element={<Standards />} /><Route path="/initiatives" element={<Initiatives />} />
            <Route path="/training" element={<Training />} /><Route path="/certificates" element={<Certificates />} />
            <Route path="/liaisons" element={<Liaisons />} /><Route path="/verify/:certificateNumber" element={<Verify />} />
            <Route path="*" element={<><PageIntro title="Page not found" subtitle="This address does not match a page in the hub. Use the navigation to continue." /></>} />
          </Routes>
        </ErrorBoundary>
      </section>
      <footer>Simulation with sample data. Not for clinical or operational use.</footer>
      <ToastHost />
    </main>
  </div>;
}

export default function App() {
  return <HubProvider><Shell /></HubProvider>;
}
