import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import { disciplineLabel } from '@/domain/sports';
import { summarizeControlProgress } from '@/domain/controlOverview';
import { initialPrestartPhases, normalizePrestartPhases, validatePrestartPhases } from '@/domain/prestartPhasePlanning';
import { getPhaseLifecycle, getActiveStage, getNextStartableStage } from '@/services/mockPhaseLifecycle';
import { getRuntimeParticipantNames } from '@/services/mockParticipants';
import { isParticipantWithdrawn } from '@/services/mockWithdrawals';
import { countMockOpenConfirmations, getMockRuntimeMatches, getPendingMockApproval } from '@/services/mockRuntime';

export type DashboardFilter = 'all' | 'before' | 'active' | 'paused' | 'finished';
export type DashboardSort = 'recent' | 'name' | 'status';

export interface DashboardTournament {
  tournament: DemoTournament;
  originalIndex: number;
  statusLabel: string;
  statusGroup: DashboardFilter;
  activePlayers: number;
  withdrawals: number;
  currentStage: TournamentStage | null;
  nextStage: TournamentStage | null;
  completedStages: number;
  percent: number;
  runningMatches: number;
  waitingMatches: number;
  pendingApproval: boolean;
  openConfirmations: number;
  needsPlanReview: boolean;
}

export function dashboardStatus(status: DemoTournament['status']): { label: string; group: DashboardFilter } {
  switch (status) {
    case 'DRAFT': return { label: 'Entwurf', group: 'before' };
    case 'REGISTRATION': return { label: 'Anmeldung', group: 'before' };
    case 'READY': return { label: 'Bereit', group: 'before' };
    case 'RUNNING': return { label: 'Läuft', group: 'active' };
    case 'PAUSED': return { label: 'Pausiert', group: 'paused' };
    case 'FINISHED': return { label: 'Abgeschlossen', group: 'finished' };
    case 'ARCHIVED': return { label: 'Archiviert', group: 'finished' };
    case 'ABORTED': return { label: 'Abgebrochen', group: 'finished' };
    default: return { label: status, group: 'finished' };
  }
}

export function buildDashboardTournament(tournament: DemoTournament, originalIndex: number): DashboardTournament {
  const status = dashboardStatus(tournament.status);
  const names = getRuntimeParticipantNames(tournament);
  const activePlayers = names.filter((name) => !isParticipantWithdrawn(tournament, name)).length;
  const lifecycle = getPhaseLifecycle(tournament);
  const activeStage = status.group !== 'finished' ? getActiveStage(tournament) ?? null : null;
  const nextStage = status.group !== 'finished' ? getNextStartableStage(tournament) ?? null : null;
  const matches = activeStage ? getMockRuntimeMatches(tournament) : [];
  const progress = summarizeControlProgress(
    tournament.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      started: lifecycle.startedStageIds.includes(stage.id),
      completed: lifecycle.completedStageIds.includes(stage.id),
    })),
    activeStage?.id ?? null,
    matches,
  );
  const beforeStart = status.group === 'before' && !tournament.hasStarted;
  const configuredFirstField = Number(tournament.stages.find((stage) => stage.type !== 'BREAK')?.settings.entrants);
  const planErrors = beforeStart ? validatePrestartPhases(
    normalizePrestartPhases(initialPrestartPhases(tournament), activePlayers), activePlayers,
  ) : [];
  return {
    tournament,
    originalIndex,
    statusLabel: status.label,
    statusGroup: status.group,
    activePlayers,
    withdrawals: names.length - activePlayers,
    currentStage: activeStage,
    nextStage,
    completedStages: progress.completedPhases,
    percent: tournament.status === 'FINISHED' || tournament.status === 'ARCHIVED' ? 100 : progress.percent,
    runningMatches: matches.filter((match) => ['READY', 'LIVE', 'CONFIRMATION'].includes(match.status)).length,
    waitingMatches: matches.filter((match) => match.status === 'WAITING').length,
    pendingApproval: Boolean(activeStage && getPendingMockApproval(tournament)),
    openConfirmations: tournament.hasStarted ? countMockOpenConfirmations(tournament) : 0,
    needsPlanReview: beforeStart && (!Number.isFinite(configuredFirstField) || configuredFirstField !== activePlayers || planErrors.length > 0),
  };
}

export function filterAndSortDashboard(items: DashboardTournament[], query: string, filter: DashboardFilter, sort: DashboardSort) {
  const term = query.trim().toLocaleLowerCase('de-DE');
  const priorities: Record<DashboardFilter, number> = { active: 0, paused: 1, before: 2, finished: 3, all: 4 };
  return items.filter((item) => {
    if (filter !== 'all' && item.statusGroup !== filter) return false;
    if (!term) return true;
    const searchText = [
      item.tournament.name, item.tournament.sport, disciplineLabel(item.tournament.discipline),
      item.statusLabel, ...item.tournament.stages.map((stage) => stage.name),
    ].join(' ').toLocaleLowerCase('de-DE');
    return searchText.includes(term);
  }).sort((a, b) => {
    if (sort === 'name') return a.tournament.name.localeCompare(b.tournament.name, 'de-DE') || a.originalIndex - b.originalIndex;
    if (sort === 'status') return priorities[a.statusGroup] - priorities[b.statusGroup] || a.originalIndex - b.originalIndex;
    return a.originalIndex - b.originalIndex;
  });
}

export function summarizeDashboard(items: DashboardTournament[]) {
  return {
    total: items.length,
    before: items.filter((item) => item.statusGroup === 'before').length,
    active: items.filter((item) => item.statusGroup === 'active' || item.statusGroup === 'paused').length,
    paused: items.filter((item) => item.statusGroup === 'paused').length,
    finished: items.filter((item) => item.statusGroup === 'finished').length,
    playing: items.reduce((sum, item) => sum + item.runningMatches, 0),
    approvals: items.filter((item) => item.pendingApproval).length,
    confirmations: items.reduce((sum, item) => sum + item.openConfirmations, 0),
  };
}
