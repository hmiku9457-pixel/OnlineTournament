import type { DemoTournament } from '@/data/demoTournaments';
import { getActiveStage, getNextStartableStage, getPhaseLifecycle } from '@/services/mockPhaseLifecycle';
import { getPendingMockApproval } from '@/services/mockRuntime';

export interface SidebarLiveTournament {
  id: string;
  name: string;
  status: 'RUNNING' | 'PAUSED';
  statusLabel: string;
  phaseLabel: string;
  completedPhases: number;
  totalPhases: number;
  progressPercent: number;
  needsApproval: boolean;
}

/** The sidebar deliberately lists only tournaments that have started but are
 * still active or paused. Ready, finished and aborted tournaments stay on the
 * dashboard. Use the live lifecycle instead of stored UI placeholder counters.
 */
export function sidebarLiveTournaments(tournaments: DemoTournament[]): SidebarLiveTournament[] {
  return tournaments.flatMap((tournament) => {
    if (tournament.status !== 'RUNNING' && tournament.status !== 'PAUSED') return [];
    const lifecycle = getPhaseLifecycle(tournament);
    const activeStage = getActiveStage(tournament);
    const nextStage = activeStage ? undefined : getNextStartableStage(tournament);
    const stage = activeStage ?? nextStage;
    const stageNumber = stage ? tournament.stages.findIndex((item) => item.id === stage.id) + 1 : 0;
    const completedPhases = tournament.stages.filter((item) => lifecycle.completedStageIds.includes(item.id)).length;
    const totalPhases = tournament.stages.length;
    return [{
      id: tournament.id,
      name: tournament.name,
      status: tournament.status,
      statusLabel: tournament.status === 'PAUSED' ? 'Pausiert' : 'Läuft',
      phaseLabel: stageNumber > 0
        ? `${activeStage ? 'Phase' : 'Als Nächstes'} ${stageNumber}: ${stage?.name ?? ''}`
        : 'Nächster Schritt in der Turnierleitung',
      completedPhases,
      totalPhases,
      progressPercent: totalPhases ? Math.round(completedPhases / totalPhases * 100) : 0,
      needsApproval: Boolean(activeStage && getPendingMockApproval(tournament)),
    }];
  }).sort((a, b) =>
    Number(b.needsApproval) - Number(a.needsApproval)
    || Number(a.status === 'PAUSED') - Number(b.status === 'PAUSED'));
}
