import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStatus } from '@/domain/types';
import { getActiveStage, getNextStartableStage, getPhaseLifecycle } from '@/services/mockPhaseLifecycle';
import { getPendingMockApproval } from '@/services/mockRuntime';

const sidebarStatuses = {
  DRAFT: { label: 'Entwurf', order: 5 },
  REGISTRATION: { label: 'Anmeldung', order: 4 },
  READY: { label: 'Bereit', order: 3 },
  RUNNING: { label: 'Läuft', order: 1 },
  PAUSED: { label: 'Pausiert', order: 2 },
} as const;

export interface SidebarTournament {
  id: string;
  name: string;
  status: keyof typeof sidebarStatuses;
  statusLabel: string;
  phaseLabel: string;
  completedPhases: number;
  totalPhases: number;
  progressPercent: number;
  needsApproval: boolean;
}

/** Relevant, not yet finished tournaments from this browser. Completed,
 * archived and aborted events are still reachable through "Alle Turniere".
 */
export function sidebarTournaments(tournaments: DemoTournament[]): SidebarTournament[] {
  return tournaments.flatMap((tournament) => {
    if (!(tournament.status in sidebarStatuses)) return [];
    const status = tournament.status as keyof typeof sidebarStatuses;
    const lifecycle = getPhaseLifecycle(tournament);
    const activeStage = getActiveStage(tournament);
    const nextStage = activeStage ? undefined : getNextStartableStage(tournament);
    const stage = activeStage ?? nextStage
      ?? (!tournament.hasStarted ? tournament.stages[0] : undefined);
    const stageNumber = stage ? tournament.stages.findIndex((item) => item.id === stage.id) + 1 : 0;
    const completedPhases = tournament.stages.filter((item) => lifecycle.completedStageIds.includes(item.id)).length;
    const totalPhases = tournament.stages.length;
    const beforeStart = status === 'DRAFT' || status === 'REGISTRATION' || status === 'READY';
    return [{
      id: tournament.id,
      name: tournament.name,
      status,
      statusLabel: sidebarStatuses[status].label,
      phaseLabel: stageNumber > 0
        ? `${beforeStart ? 'Startphase' : activeStage ? 'Phase' : 'Als Nächstes'} ${stageNumber}: ${stage?.name ?? ''}`
        : beforeStart ? 'Noch keine Phase eingerichtet' : 'Nächster Schritt in der Turnierleitung',
      completedPhases,
      totalPhases,
      progressPercent: totalPhases ? Math.round(completedPhases / totalPhases * 100) : 0,
      needsApproval: Boolean(activeStage && getPendingMockApproval(tournament)),
    }];
  }).sort((a, b) =>
    Number(b.needsApproval) - Number(a.needsApproval)
    || sidebarStatuses[a.status].order - sidebarStatuses[b.status].order);
}
