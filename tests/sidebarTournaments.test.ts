import { describe, expect, it } from 'vitest';
import type { DemoTournament } from '@/data/demoTournaments';
import { sidebarTournaments } from '@/domain/sidebarTournaments';

function tournament(id: string, status: DemoTournament['status']): DemoTournament {
  return {
    id,
    name: `Turnier ${id}`,
    subtitle: '',
    status,
    visibility: 'PRIVATE',
    sport: 'Tischtennis',
    discipline: 'SINGLES',
    participants: 8,
    tables: 4,
    activeTables: 0,
    runningMatches: 0,
    openConfirmations: 0,
    phasesLabel: 'Gruppenphase',
    estimatedDuration: 'ca. 2h',
    lastUpdate: '',
    hasStarted: status === 'RUNNING' || status === 'PAUSED' || status === 'FINISHED',
    stages: [{
      id: `${id}-group`,
      tournamentId: id,
      name: 'Gruppenphase',
      type: 'GROUPS',
      orderIndex: 0,
      bestOf: 1,
      settings: { entrants: 8, groups: 2 },
      advancement: { type: 'top_n', value: 4 },
    }],
    areas: [],
    participantNames: Array.from({ length: 8 }, (_, i) => `Teilnehmer ${i + 1}`),
  };
}

describe('Deine Turniere sidebar', () => {
  it('includes tournaments before their first start as well as running and paused ones', () => {
    const rows = sidebarTournaments([
      tournament('ready', 'READY'),
      tournament('paused', 'PAUSED'),
      tournament('registration', 'REGISTRATION'),
      tournament('running', 'RUNNING'),
      tournament('draft', 'DRAFT'),
      tournament('ended', 'FINISHED'),
      tournament('archived', 'ARCHIVED'),
      tournament('aborted', 'ABORTED'),
    ]);
    expect(rows.map((entry) => entry.id)).toEqual([
      'running', 'paused', 'ready', 'registration', 'draft',
    ]);
    expect(rows.map((entry) => entry.statusLabel)).toEqual([
      'Läuft', 'Pausiert', 'Bereit', 'Anmeldung', 'Entwurf',
    ]);
  });

  it('shows the actual playing phase and phase-based progress', () => {
    const [row] = sidebarTournaments([tournament('active', 'RUNNING')]);
    expect(row.phaseLabel).toContain('Phase 1: Gruppenphase');
    expect(row.completedPhases).toBe(0);
    expect(row.totalPhases).toBe(1);
    expect(row.progressPercent).toBe(0);
  });

  it('shows a start phase for an unstarted tournament', () => {
    const [row] = sidebarTournaments([tournament('ready', 'READY')]);
    expect(row.phaseLabel).toBe('Startphase 1: Gruppenphase');
    expect(row.statusLabel).toBe('Bereit');
    expect(row.needsApproval).toBe(false);
  });

  it('keeps ordering stable for tournaments with the same status', () => {
    const rows = sidebarTournaments([tournament('ready1', 'READY'), tournament('ready2', 'READY')]);
    expect(rows.map((entry) => entry.id)).toEqual(['ready1', 'ready2']);
  });

  it('handles an empty list and excludes only completed or aborted tournaments', () => {
    expect(sidebarTournaments([])).toEqual([]);
    expect(sidebarTournaments([tournament('ended', 'FINISHED'), tournament('aborted', 'ABORTED')])).toEqual([]);
  });
});
