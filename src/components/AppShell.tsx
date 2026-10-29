import { NavLink, Outlet } from 'react-router-dom';

export function AppShell() {
  return (
    <div className="shell">
      <aside className="sidebar no-print">
        <div className="brand">OnlineTournament</div>
        <nav className="nav" aria-label="Hauptnavigation">
          <NavLink to="/">Turniere</NavLink>
          <NavLink to="/tournaments/new">Turnier erstellen</NavLink>
          <NavLink to="/login">Anmelden</NavLink>
        </nav>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
