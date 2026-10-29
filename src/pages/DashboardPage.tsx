import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { disciplineLabel } from '@/domain/sports';
import {
  buildDashboardTournament, filterAndSortDashboard, summarizeDashboard,
  type DashboardFilter, type DashboardSort, type DashboardTournament,
} from '@/domain/tournamentDashboard';
import { getAllMockTournaments, removeLocalPrototypeTournaments } from '@/services/mockTournamentStore';
import { getVenueTerminology } from '@/domain/venueTerminology';

const filters: Array<{ value: DashboardFilter; name: string }> = [
  { value: 'all', name: 'Alle' },
  { value: 'before', name: 'Vor Start' },
  { value: 'active', name: 'Läuft' },
  { value: 'paused', name: 'Pausiert' },
  { value: 'finished', name: 'Beendet' },
];

function TournamentCard({ item }: { item: DashboardTournament }) {
  const { tournament } = item;
  const progress = Math.max(0, Math.min(100, item.percent));
  const open = `/tournaments/${tournament.id}/control`;
  const isLive = item.statusGroup === 'active' || item.statusGroup === 'paused';
  const next = item.currentStage ?? item.nextStage ?? tournament.stages.find((stage) => !tournament.hasStarted && stage.type !== 'BREAK');
  const currentStep = next ? tournament.stages.findIndex((stage) => stage.id === next.id) + 1 : 0;
  const stageNames = tournament.stages.slice(0, 3);
  const hiddenStages = tournament.stages.length - stageNames.length;
  const notice = item.needsPlanReview
    ? 'Teilnehmerzahl geändert – Phasenplanung vor dem Start prüfen'
    : item.pendingApproval ? 'Ergebnisse benötigen die Freigabe der Turnierleitung' : null;
  return (
    <article className="dashboard-tournament-card">
      <div className="dashboard-tournament-top">
        <div className="dashboard-tournament-ident">
          <div className="dashboard-tournament-statusline">
            <span className={`dashboard-status dashboard-status-${item.statusGroup}`}>
              <span className="dashboard-status-dot" aria-hidden="true" />{item.statusLabel}
            </span>
            {notice && <span className="dashboard-action-required">Handlungsbedarf</span>}
          </div>
          <h3><Link to={open}>{tournament.name}</Link></h3>
          <p className="dashboard-tournament-subtitle">{tournament.sport} · {disciplineLabel(tournament.discipline)}</p>
        </div>
        <div className="dashboard-tournament-people">
          <strong>{item.activePlayers}</strong>
          <span>Aktive Teilnehmer</span>
        </div>
      </div>

      {notice && <div className="dashboard-tournament-notice"><span aria-hidden="true">!</span>{notice}</div>}

      <div className="dashboard-tournament-meta">
        <span><strong>{tournament.tables}</strong> {getVenueTerminology(tournament.sport).plural}</span>
        <span><strong>{tournament.stages.length}</strong> Phasen</span>
        {item.withdrawals > 0 && <span><strong>{item.withdrawals}</strong> zurückgezogen</span>}
        {item.runningMatches > 0 && <span className="dashboard-running"><strong>{item.runningMatches}</strong> laufende Spiele</span>}
        {item.waitingMatches > 0 && <span><strong>{item.waitingMatches}</strong> warten</span>}
      </div>

      <div className="dashboard-tournament-progress">
        <div className="dashboard-progress-label">
          <span>Turnierfortschritt</span>
          <strong>{progress} %</strong>
        </div>
        <div className="dashboard-progress-track" role="progressbar" aria-label={`Fortschritt von ${tournament.name}`}
          aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="dashboard-progress-footnote">
          <span>{item.completedStages} von {tournament.stages.length} Phasen abgeschlossen</span>
          <span>{item.statusGroup === 'before' ? tournament.estimatedDuration : isLive ? 'Turnier in Bearbeitung' : item.statusLabel}</span>
        </div>
      </div>

      <div className="dashboard-tournament-phase">
        <div className="dashboard-current-phase">
          <span>{item.currentStage ? 'Aktuelle Phase' : item.nextStage ? 'Nächste Phase' : tournament.hasStarted ? 'Phasen abgeschlossen' : 'Startphase'}</span>
          <strong>{next ? `${currentStep}. ${next.name}` : tournament.stages.length ? 'Keine weitere Phase' : 'Noch keine Phasen angelegt'}</strong>
        </div>
        <div className="dashboard-phase-preview" aria-label="Phasenfolge">
          {stageNames.map((stage, index) => (
            <span key={stage.id} className={`dashboard-phase-chip${index < item.completedStages ? ' done' : next?.id === stage.id ? ' current' : ''}`}
              title={`Phase ${index + 1}: ${stage.name}`}>
              {index + 1}. {stage.name}
            </span>
          ))}
          {hiddenStages > 0 && <span className="dashboard-phase-more">+{hiddenStages} weitere</span>}
        </div>
      </div>

      <div className="dashboard-tournament-footer">
        <Link className="btn primary dashboard-tournament-open" to={open}>Turnierleitung öffnen</Link>
        <div className="dashboard-tournament-secondary-actions">
          <Link to={`/player/${tournament.id}`} title="Spieleransicht öffnen">Spieleransicht</Link>
          <Link to={`/live/${tournament.id}`} title="Zuschaueransicht öffnen">Zuschaueransicht</Link>
        </div>
      </div>
    </article>
  );
}

export function DashboardPage() {
  const [tournaments, setTournaments] = useState(getAllMockTournaments);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<DashboardFilter>('all');
  const [sort, setSort] = useState<DashboardSort>('recent');
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const resetDialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => {
      setTournaments(getAllMockTournaments());
      setRevision((current) => current + 1);
    };
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('online-tournament:')) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    window.addEventListener('mock-runtime-change', refresh);
    window.addEventListener('mock-phase-change', refresh);
    window.addEventListener('mock-audit-change', refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('mock-runtime-change', refresh);
      window.removeEventListener('mock-phase-change', refresh);
      window.removeEventListener('mock-audit-change', refresh);
    };
  }, []);

  useEffect(() => {
    if (!resetConfirmOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    resetDialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function handleDialogKeys(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setResetConfirmOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !resetDialogRef.current) return;
      const buttons = Array.from(resetDialogRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', handleDialogKeys);
    return () => {
      window.removeEventListener('keydown', handleDialogKeys);
      previousFocus?.focus();
    };
  }, [resetConfirmOpen]);

  const items = useMemo(() => tournaments.map(buildDashboardTournament), [tournaments, revision]);
  const summary = useMemo(() => summarizeDashboard(items), [items]);
  const visible = useMemo(() => filterAndSortDashboard(items, query, filter, sort), [items, query, filter, sort]);
  const counts: Record<DashboardFilter, number> = {
    all: summary.total, before: summary.before,
    active: items.filter((item) => item.statusGroup === 'active').length,
    paused: summary.paused, finished: summary.finished,
  };
  const hasFilter = query.trim() !== '' || filter !== 'all';

  function resetAll() {
    removeLocalPrototypeTournaments();
    setResetConfirmOpen(false);
    setTournaments([]);
    setRevision((value) => value + 1);
    setQuery('');
    setFilter('all');
  }

  return (
    <div className="tournament-dashboard">
      <header className="dashboard-page-hero">
        <div>
          <p className="dashboard-kicker">TURNIERZENTRALE</p>
          <h1>Turniere</h1>
          <p className="muted">Alle Turniere, ihre aktuellen Stände und die nächsten Schritte an einem Ort.</p>
        </div>
        <Link className="btn primary dashboard-new-button" to="/tournaments/new">+ Neues Turnier</Link>
      </header>

      <section className="dashboard-kpis" aria-label="Kennzahlen aller Turniere">
        <div className="dashboard-kpi"><span>Turniere gesamt</span><strong>{summary.total}</strong><small>Im aktuellen Browser</small></div>
        <div className="dashboard-kpi"><span>Vor Turnierstart</span><strong>{summary.before}</strong><small>Entwurf, Anmeldung oder bereit</small></div>
        <div className="dashboard-kpi"><span>Laufend &amp; pausiert</span><strong>{summary.active}</strong><small>{summary.playing} laufende {summary.playing === 1 ? 'Partie' : 'Partien'}</small></div>
        <div className="dashboard-kpi"><span>Freigaben offen</span><strong>{summary.approvals}</strong><small>{summary.confirmations} offene Spielerbestätigungen</small></div>
      </section>

      <section className="dashboard-collection" aria-label="Turnierübersicht">
        <div className="dashboard-collection-heading">
          <div>
            <h2>Deine Turniere</h2>
            <p className="muted">{visible.length} von {summary.total} Turnieren angezeigt</p>
          </div>
          <label className="dashboard-sort">
            <span>Sortieren</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as DashboardSort)}>
              <option value="recent">Zuletzt erstellt</option>
              <option value="status">Aktive zuerst</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>

        {summary.total > 0 && <>
          <div className="dashboard-search">
            <label className="dashboard-search-field">
              <span className="dashboard-search-icon" aria-hidden="true">⌕</span>
              <input type="search" value={query} placeholder="Turniere, Sportarten oder Phasen suchen …"
                aria-label="Turniere suchen" onChange={(event) => setQuery(event.target.value)} />
            </label>
            {query && <button className="btn small" type="button" onClick={() => setQuery('')}>Suche löschen</button>}
          </div>
          <div className="dashboard-filters" role="group" aria-label="Turniere nach Status filtern">
            {filters.map((option) => <button key={option.value} type="button"
              className={filter === option.value ? 'dashboard-filter is-selected' : 'dashboard-filter'}
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}>
              {option.name}<span>{counts[option.value]}</span>
            </button>)}
          </div>
        </>}

        {summary.total === 0 ? (
          <div className="dashboard-empty">
            <div className="dashboard-empty-icon" aria-hidden="true">+</div>
            <h3>Dein erstes Turnier wartet</h3>
            <p>Lege ein Turnier an, füge die Teilnehmer hinzu und konfiguriere das passende Turniersystem.</p>
            <Link className="btn primary" to="/tournaments/new">Erstes Turnier erstellen</Link>
          </div>
        ) : visible.length === 0 ? (
          <div className="dashboard-empty dashboard-filter-empty">
            <h3>Keine passenden Turniere</h3>
            <p>Versuche eine andere Suche oder einen anderen Statusfilter.</p>
            {hasFilter && <button className="btn" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>Alle Turniere anzeigen</button>}
          </div>
        ) : (
          <div className="dashboard-tournament-grid">{visible.map((item) =>
            <TournamentCard key={item.tournament.id} item={item} />)}</div>
        )}
      </section>

      {summary.total > 0 && (
        <details className="dashboard-maintenance no-print">
          <summary>Lokale Testdaten verwalten</summary>
          <p>Die Turniere und ihre Ergebnisse sind derzeit nur in diesem Browser gespeichert. Das Zurücksetzen löscht sämtliche lokalen Turnierdaten.</p>
          <button type="button" className="btn small" onClick={() => setResetConfirmOpen(true)}>Alle lokalen Testdaten zurücksetzen</button>
        </details>
      )}

      {resetConfirmOpen && <div className="dashboard-reset-backdrop" role="presentation">
        <div className="dashboard-reset-dialog" ref={resetDialogRef} role="alertdialog" aria-modal="true"
          aria-labelledby="dashboard-reset-title" aria-describedby="dashboard-reset-description">
          <h2 id="dashboard-reset-title">Alle lokalen Testdaten löschen?</h2>
          <p id="dashboard-reset-description">Diese Aktion entfernt alle Turniere, Spieler, Auslosungen, Ergebnisse und Protokolle in diesem Browser. Sie kann nicht rückgängig gemacht werden.</p>
          <div className="dashboard-reset-actions">
            <button type="button" className="btn" onClick={() => setResetConfirmOpen(false)}>Abbrechen</button>
            <button type="button" className="btn danger" onClick={resetAll}>Ja, alles löschen</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
