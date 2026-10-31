import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { sidebarLiveTournaments, type SidebarLiveTournament } from '@/domain/sidebarTournaments';
import { getAllMockTournaments } from '@/services/mockTournamentStore';

type SidebarIconName = 'trophy' | 'grid' | 'plus' | 'user' | 'calendar' | 'chart' | 'settings';

function SidebarIcon({ name }: { name: SidebarIconName }) {
  const common = { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  switch (name) {
    case 'trophy': return <svg {...common}><path d="M8 4h8v7a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5v2a4 4 0 0 0 4 4m7-6h3v2a4 4 0 0 1-4 4M12 15v4m-4 2h8m-8-2h8"/></svg>;
    case 'grid': return <svg {...common}><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>;
    case 'plus': return <svg {...common}><path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="3"/></svg>;
    case 'user': return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M5 21v-1a7 7 0 0 1 14 0v1"/></svg>;
    case 'calendar': return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h3m3 0h3"/></svg>;
    case 'chart': return <svg {...common}><path d="M4 20V5M4 20h17M8 16v-4m5 4V8m5 8V5"/></svg>;
    case 'settings': return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1M19.1 4.9 17 7m-10 10-2.1 2.1"/></svg>;
  }
}

const MAX_SIDEBAR_TOURNAMENTS = 4;

function SidebarLiveList({ tournaments }: { tournaments: SidebarLiveTournament[] }) {
  if (tournaments.length === 0) {
    return <div className="sidebar-live-empty"><span className="sidebar-live-empty-dot" aria-hidden="true"/>
      <span>Derzeit läuft kein Turnier.</span></div>;
  }

  return (
    <div className="sidebar-live-items">
      {tournaments.slice(0, MAX_SIDEBAR_TOURNAMENTS).map((tournament) => (
        <Link key={tournament.id} className="sidebar-live-item"
          to={`/tournaments/${tournament.id}/control`}
          title={`${tournament.name} – ${tournament.statusLabel}. Turnierleitung öffnen`}>
          <span className="sidebar-live-item-top">
            <strong>{tournament.name}</strong>
            <span className={`sidebar-live-badge ${tournament.status === 'PAUSED' ? 'paused' : 'running'}`}>
              <span className="sidebar-live-status-dot" aria-hidden="true"/>{tournament.statusLabel}
            </span>
          </span>
          <span className="sidebar-live-phase">{tournament.phaseLabel}</span>
          {tournament.needsApproval && <span className="sidebar-live-approval">Freigabe erforderlich</span>}
          <span className="sidebar-live-progress" aria-hidden="true">
            <span style={{ width: `${tournament.progressPercent}%` }}/>
          </span>
          <span className="sidebar-live-progress-label">{tournament.completedPhases}/{tournament.totalPhases} Phasen abgeschlossen</span>
        </Link>
      ))}
      {tournaments.length > MAX_SIDEBAR_TOURNAMENTS && (
        <p className="sidebar-live-overflow">{tournaments.length - MAX_SIDEBAR_TOURNAMENTS} weitere aktive Turniere im Dashboard</p>
      )}
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('online-tournament:')) refresh();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', onStorage);
    window.addEventListener('mock-runtime-change', refresh);
    window.addEventListener('mock-phase-change', refresh);
    window.addEventListener('mock-audit-change', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('mock-runtime-change', refresh);
      window.removeEventListener('mock-phase-change', refresh);
      window.removeEventListener('mock-audit-change', refresh);
    };
  }, []);

  const activeTournaments = useMemo(
    () => sidebarLiveTournaments(getAllMockTournaments()),
    [revision, location.key],
  );

  return (
    <div className="shell">
      <aside className="sidebar no-print">
        <div className="sidebar-inner">
          <Link className="sidebar-brand-link" to="/" aria-label="OnlineTournament – Turniere">
            <span className="sidebar-brand-symbol"><SidebarIcon name="trophy"/></span>
            <span className="sidebar-brand-copy"><strong>OnlineTournament</strong><small>Turnierverwaltung</small></span>
          </Link>

          <div className="sidebar-navigation-group">
            <p className="sidebar-section-label">WORKSPACE</p>
            <nav className="nav sidebar-navigation" aria-label="Hauptnavigation">
              <NavLink to="/" end><SidebarIcon name="grid"/><span>Turniere</span></NavLink>
              <NavLink to="/tournaments/new"><SidebarIcon name="plus"/><span>Turnier erstellen</span></NavLink>
              <NavLink to="/login" className="sidebar-mobile-login"><SidebarIcon name="user"/><span>Anmelden</span></NavLink>
            </nav>
          </div>

          <section className="sidebar-live-section" aria-label="Aktuelle Turniere">
            <div className="sidebar-section-heading">
              <h2>Aktuelle Turniere</h2>
              <span className="sidebar-live-total" aria-label={`${activeTournaments.length} laufende oder pausierte Turniere`}>
                {activeTournaments.length}
              </span>
            </div>
            <SidebarLiveList tournaments={activeTournaments}/>
            <Link to="/" className="sidebar-live-all">Alle Turniere anzeigen <span aria-hidden="true">→</span></Link>
          </section>

          <details className="sidebar-mobile-live">
            <summary><span className="sidebar-mobile-live-title"><span className="sidebar-live-status-dot" aria-hidden="true"/>Aktuelle Turniere</span>
              <span className="sidebar-live-total">{activeTournaments.length}</span></summary>
            <SidebarLiveList tournaments={activeTournaments}/>
            <Link className="sidebar-live-all" to="/">Alle Turniere anzeigen →</Link>
          </details>

          <section className="sidebar-future" aria-label="Geplante Funktionen">
            <p className="sidebar-section-label">SPÄTER VERFÜGBAR</p>
            <div className="sidebar-future-item"><SidebarIcon name="calendar"/><span>Turnierkalender</span><small>Geplant</small></div>
            <div className="sidebar-future-item"><SidebarIcon name="chart"/><span>Auswertungen</span><small>Geplant</small></div>
            <div className="sidebar-future-item"><SidebarIcon name="settings"/><span>Einstellungen</span><small>Geplant</small></div>
          </section>

          <div className="sidebar-footer">
            <NavLink to="/login" className="sidebar-account-link"><SidebarIcon name="user"/><span>Anmelden</span></NavLink>
            <div className="sidebar-environment"><span className="sidebar-environment-dot" aria-hidden="true"/>
              <span>Lokaler Prototyp</span></div>
          </div>
        </div>
      </aside>
      <main className="main"><Outlet/></main>
    </div>
  );
}
