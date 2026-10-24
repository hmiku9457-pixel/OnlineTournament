import type { DemoTournament } from '@/data/demoTournaments';
import { buildSwissStandings } from '@/services/mockCompetitionViews';
import { getActiveStage } from '@/services/mockPhaseLifecycle';

type SwissRecordLookup = (match: { stageId: string }, name: string) => string | undefined;

/** Schweizer Bilanzen gehören ausschließlich zu Partien der aktuell laufenden Schweizer Phase. */
export function getActiveSwissRecordLookup(tournament: DemoTournament): SwissRecordLookup {
  const stage = getActiveStage(tournament);
  if (stage?.type !== 'SWISS') {
    return () => undefined;
  }
  const records = new Map(buildSwissStandings(tournament, stage).map((row) => [row.name, `${row.wins}:${row.losses}`]));
  return (match: { stageId: string }, name: string): string | undefined =>
    match.stageId === stage.id ? records.get(name) : undefined;
}
