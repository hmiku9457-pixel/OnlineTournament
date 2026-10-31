import { describe, expect, it } from 'vitest';
import type { DemoTournament } from '@/data/demoTournaments';
import { sidebarLiveTournaments } from '@/domain/sidebarTournaments';

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

describe('live tournament sidebar', () => {
  it('includes running and paused tournaments, not ready or finished ones', () => {
    const rows = sidebarLiveTournaments([
      tournament('ready', 'READY'),
      tournament('paused', 'PAUSED'),
      tournament('running', 'RUNNING'),
      tournament('ended', 'FINISHED'),
      tournament('aborted', 'ABORTED'),
    ]);
    expect(rows.map((entry) => entry.id)).toEqual(['running', 'paused']);
    expect(rows.map((entry) => entry.statusLabel)).toEqual(['Läuft', 'Pausiert']);
  });

  it('shows the actual active phase and phase-based progress', () => {
    const [row] = sidebarLiveTournaments([tournament('active', 'RUNNING')]);
    expect(row.phaseLabel).toContain('Phase 1: Gruppenphase');
    expect(row.completedPhases).toBe(0);
    expect(row.totalPhases).toBe(1);
    expect(row.progressPercent).toBe(0);
  });

  it('handles an empty list without placeholder tournaments', () => {
    expect(sidebarLiveTournaments([])).toEqual([]);
    expect(sidebarLiveTournaments([tournament('ready', 'READY')])).toEqual([]);
  });
});
