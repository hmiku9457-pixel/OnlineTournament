import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import { buildMockBracket, buildMockGroups, buildSwissStandings } from '@/services/mockCompetitionViews';
import { getStageEntrants, isStageCompleted, isStageStarted } from '@/services/mockPhaseLifecycle';
import { getMockStageBaseMatches, getMockStoredResult, isMockParticipantWithdrawn } from '@/services/mockRuntime';
import { getRuntimeParticipantNames } from '@/services/mockParticipants';

export interface MockParticipantProgress {
  status: 'Aktiv' | 'Ausgeschieden' | 'Zurückgezogen' | 'Turniersieger' | 'Beendet';
  placement?: string;
}

function winnerFor(matchId: string, sideA: string, sideB: string, autoWinner?: string): string | undefined {
  if (autoWinner) return autoWinner;
  const result = getMockStoredResult(matchId);
  if (!result || result.status !== 'FINISHED' || result.thirdPlaceSkipped) return undefined;
  if (result.forcedWinner) return result.forcedWinner;
  const winsA = result.sets.filter((set) => set.sideAScore > set.sideBScore).length;
  const winsB = result.sets.filter((set) => set.sideBScore > set.sideAScore).length;
  return winsA > winsB ? sideA : winsB > winsA ? sideB : undefined;
}

function knockoutPlacement(tournament: DemoTournament, stage: TournamentStage, name: string): string | undefined {
  const matches = getMockStageBaseMatches(tournament, stage);
  const bronze = matches.find((match) => match.round === 'Spiel um Platz 3');
  const bronzeResult = bronze && getMockStoredResult(bronze.id);
  if (bronze && (bronze.sideA === name || bronze.sideB === name) && bronzeResult?.status === 'FINISHED') {
    if (bronzeResult.thirdPlaceSkipped) return 'Platz 3';
    return winnerFor(bronze.id, bronze.sideA, bronze.sideB) === name ? 'Platz 3' : 'Platz 4';
  }

  const final = matches.find((match) => match.round === 'Finale');
  if (final && (final.sideA === name || final.sideB === name)) {
    const winner = winnerFor(final.id, final.sideA, final.sideB, final.autoWinner);
    if (winner) return winner === name ? 'Platz 1' : 'Platz 2';
  }

  const regularRounds = buildMockBracket(tournament, stage).filter((round) => round.label !== 'Spiel um Platz 3');
  for (let index = 0; index < regularRounds.length; index += 1) {
    for (const match of regularRounds[index].matches) {
      if (match.sideA !== name && match.sideB !== name) continue;
      const winner = winnerFor(match.id, match.sideA, match.sideB, match.autoWinner);
      if (!winner || winner === name) continue;
      if (match.sideA === 'Freilos' || match.sideB === 'Freilos') continue;
      if (regularRounds[index].label === 'Halbfinale' && bronze && (bronze.sideA === name || bronze.sideB === name)) {
        return undefined; // Das Spiel um Platz 3 ist noch offen.
      }
      const distanceFromFinal = regularRounds.length - 1 - index;
      const firstPlace = 2 ** distanceFromFinal + 1;
      const lastPlace = Math.min(getStageEntrants(tournament, stage).length, 2 ** (distanceFromFinal + 1));
      return firstPlace === lastPlace ? `Platz ${firstPlace}` : `Platz ${firstPlace}–${lastPlace}`;
    }
  }
  return undefined;
}

function placementInStage(tournament: DemoTournament, stage: TournamentStage, name: string): string | undefined {
  if (stage.type === 'GROUPS') {
    for (const group of buildMockGroups(tournament, stage)) {
      const row = group.standings.find((item) => item.name === name);
      if (row) return `${group.label} · Platz ${row.rank}`;
    }
  }
  if (stage.type === 'SWISS') {
    const row = buildSwissStandings(tournament, stage).find((item) => item.name === name);
    return row ? `Platz ${row.rank}` : undefined;
  }
  if (stage.type === 'ROUND_ROBIN') {
    // Bei nur einer Jeder-gegen-jeden-Phase wird die Rangfolge wie in der Gruppe berechnet.
    return undefined;
  }
  if (stage.type === 'KNOCKOUT' || stage.type === 'DOUBLE_ELIMINATION' || stage.type === 'PLACEMENT') {
    return knockoutPlacement(tournament, stage, name);
  }
  return undefined;
}

export function getMockParticipantProgress(tournament: DemoTournament, name: string): MockParticipantProgress {
  const withdrawn = isMockParticipantWithdrawn(tournament, name);
  const started = tournament.stages.filter((stage) => isStageStarted(tournament, stage));
  if (!started.length) return { status: withdrawn ? 'Zurückgezogen' : 'Aktiv' };
  const latest = started[started.length - 1];

  // A withdrawal is a status, not a placement: players retain the rank
  // earned in their last actually entered stage (including Swiss standings).
  // Never treat withdrawal as an automatic last place in the final ranking.
  if (withdrawn) {
    const lastPlayed = [...started].reverse().find((stage) => getStageEntrants(tournament, stage).includes(name));
    return { status: 'Zurückgezogen', placement: lastPlayed ? placementInStage(tournament, lastPlayed, name) : undefined };
  }

  if (!getStageEntrants(tournament, latest).includes(name)) {
    // Teilnehmer hat sich nicht für die gestartete Folgephase qualifiziert.
    const previous = [...started].reverse().find((stage) => getStageEntrants(tournament, stage).includes(name));
    return { status: 'Ausgeschieden', placement: previous ? placementInStage(tournament, previous, name) : undefined };
  }

  if (latest.type === 'KNOCKOUT' || latest.type === 'DOUBLE_ELIMINATION' || latest.type === 'PLACEMENT') {
    const placement = knockoutPlacement(tournament, latest, name);
    if (placement) return { status: placement === 'Platz 1' ? 'Turniersieger' : 'Ausgeschieden', placement };
  }
  if (isStageCompleted(tournament, latest)) {
    const nextStage = tournament.stages[tournament.stages.findIndex((stage) => stage.id === latest.id) + 1];
    // Ein Gruppen- oder Schweizer Abschluss ist noch kein Ausscheiden,
    // solange die Folgerunde nicht gestartet wurde.
    if (nextStage && !isStageStarted(tournament, nextStage)) return { status: 'Aktiv' };
    return { status: 'Beendet', placement: placementInStage(tournament, latest, name) };
  }
  return { status: 'Aktiv' };
}

/** Completed-tournament summary: placements from older elimination phases retain their group/phase context. */
export function getMockFinalStandings(tournament: DemoTournament) {
  return getRuntimeParticipantNames(tournament).map((name) => {
    const progress = getMockParticipantProgress(tournament, name);
    const stageIndex = tournament.stages.reduce((latest, stage, index) =>
      isStageStarted(tournament, stage) && getStageEntrants(tournament, stage).includes(name) ? index : latest, -1);
    const placementNumber = Number(progress.placement?.match(/Platz\s+(\d+)/)?.[1] ?? Number.MAX_SAFE_INTEGER);
    return { name, ...progress, stageIndex, placementNumber };
  }).sort((a, b) => b.stageIndex - a.stageIndex || a.placementNumber - b.placementNumber || a.name.localeCompare(b.name, 'de'));
}
