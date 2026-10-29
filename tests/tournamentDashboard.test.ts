import { describe, expect, it } from 'vitest';
import {
  dashboardStatus, filterAndSortDashboard, summarizeDashboard,
  type DashboardTournament,
} from '@/domain/tournamentDashboard';

const item = (
  id: string,
  name: string,
  sport: string,
  status: 'READY' | 'RUNNING' | 'PAUSED' | 'FINISHED' | 'ABORTED',
  index: number,
  stages: string[] = ['Gruppenphase'],
  extras: { runningMatches?: number; pendingApproval?: boolean; openConfirmations?: number } = {},
): DashboardTournament => ({
  tournament: {
    id, name, sport, discipline: 'SINGLES',
    stages: stages.map((label, i) => ({ name: label, id: `${id}-phase-${i}` })),
  },
  originalIndex: index,
  statusGroup: dashboardStatus(status).group,
  statusLabel: dashboardStatus(status).label,
  activePlayers: 10, withdrawals: 0, currentStage: null, nextStage: null,
  completedStages: 0, percent: 0, waitingMatches: 0, needsPlanReview: false,
  runningMatches: extras.runningMatches ?? 0,
  pendingApproval: extras.pendingApproval ?? false,
  openConfirmations: extras.openConfirmations ?? 0,
} as DashboardTournament);

describe('tournament dashboard', () => {
  const items = [
    item('1', 'Herbstpokal', 'Tischtennis', 'READY', 0, ['Gruppenphase']),
    item('2', 'Sommer Cup', 'Badminton', 'RUNNING', 1, ['Schweizer System'], { runningMatches: 3, pendingApproval: true }),
    item('3', 'Vereinscup', 'Volleyball', 'PAUSED', 2, ['K.-o.-Phase'], { openConfirmations: 2 }),
    item('4', 'Jahresfinale', 'Tischtennis', 'FINISHED', 3),
    item('5', 'Frühjahr', 'Tischtennis', 'ABORTED', 4),
  ];

  it('shows all live and historical states with user-readable labels', () => {
    expect(dashboardStatus('READY')).toEqual({ label: 'Bereit', group: 'before' });
    expect(dashboardStatus('REGISTRATION').group).toBe('before');
    expect(dashboardStatus('PAUSED').label).toBe('Pausiert');
    expect(dashboardStatus('ARCHIVED').group).toBe('finished');
    expect(dashboardStatus('ABORTED').label).toBe('Abgebrochen');
  });

  it('filters by status independently of the search term', () => {
    expect(filterAndSortDashboard(items, '', 'active', 'recent').map((entry) => entry.tournament.id)).toEqual(['2']);
    expect(filterAndSortDashboard(items, '', 'paused', 'recent').map((entry) => entry.tournament.id)).toEqual(['3']);
    expect(filterAndSortDashboard(items, '', 'finished', 'recent').map((entry) => entry.tournament.id)).toEqual(['4', '5']);
  });

  it('finds turniere by names, sports and phases in a case-insensitive way', () => {
    expect(filterAndSortDashboard(items, 'SOMMER', 'all', 'recent').map((entry) => entry.tournament.id)).toEqual(['2']);
    expect(filterAndSortDashboard(items, 'badminton', 'all', 'recent').map((entry) => entry.tournament.id)).toEqual(['2']);
    expect(filterAndSortDashboard(items, 'schweizer', 'all', 'recent').map((entry) => entry.tournament.id)).toEqual(['2']);
    expect(filterAndSortDashboard(items, 'badminton', 'before', 'recent')).toHaveLength(0);
  });

  it('sorts by name or operational priority without changing the original array', () => {
    expect(filterAndSortDashboard(items, '', 'all', 'name')[0].tournament.name).toBe('Frühjahr');
    expect(filterAndSortDashboard(items, '', 'all', 'status').map((entry) => entry.tournament.id))
      .toEqual(['2', '3', '1', '4', '5']);
    expect(items[0].tournament.id).toBe('1');
  });

  it('summarizes real item metrics instead of saved placeholder counters', () => {
    expect(summarizeDashboard(items)).toMatchObject({
      total: 5, before: 1, active: 2, paused: 1,
      finished: 2, playing: 3, approvals: 1, confirmations: 2,
    });
  });

  it('supports empty dashboards and no matching results', () => {
    expect(summarizeDashboard([]).total).toBe(0);
    expect(filterAndSortDashboard(items, 'xyz', 'all', 'recent')).toEqual([]);
  });
});
