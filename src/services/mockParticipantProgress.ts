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
    const groups = buildMockGroups(tournament, stage);
    for (const group of groups) {
      const row = group.standings.find((item) => item.name === name);
      if (!row) continue;
      const before = groups.reduce((sum, item) => sum + item.standings.filter((entry) => entry.rank < row.rank).length, 0);
      const shared = groups.reduce((sum, item) => sum + item.standings.filter((entry) => entry.rank === row.rank).length, 0);
      const first = before + 1;
      const last = before + shared;
      return `${group.label} · Platz ${first}${last > first ? `–${last}` : ''}`;
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

/**
 * Endplatzierungen müssen turnierweit eindeutig bzw. bewusst geteilt sein.
 * Jede spätere gestartete Phase steht vor den Teilnehmern, die in einer
 * früheren Phase ausschieden oder zurückgezogen wurden. Innerhalb einer
 * Ausscheidungsstufe entscheidet die Platzierung in genau dieser Phase.
 * Rückzug bleibt ein Status und ändert die sportlich erreichte Reihenfolge nicht.
 */
export function getMockFinalStandings(tournament: DemoTournament) {
  const rows = getRuntimeParticipantNames(tournament).map((name) => {
    const progress = getMockParticipantProgress(tournament, name);
    const stageIndex = tournament.stages.reduce((latest, stage, index) =>
      isStageStarted(tournament, stage) && getStageEntrants(tournament, stage).includes(name) ? index : latest, -1);
    return { name, ...progress, stageIndex, placementNumber: Number.MAX_SAFE_INTEGER };
  });
  let nextPlace = 1;
  const asRange = (from: number, count: number) => `Platz ${from}${count > 1 ? `–${from + count - 1}` : ''}`;

  for (let stageIndex = tournament.stages.length - 1; stageIndex >= -1; stageIndex -= 1) {
    const participants = rows.filter((row) => row.stageIndex === stageIndex);
    if (!participants.length) continue;
    const stage = tournament.stages[stageIndex];
    // Die letzte Phase ist für ihre Teilnehmer eine eigene Ergebnisklasse.
    // Gruppenplatzierungen verschiedener Gruppen sind gleichrangig.
    if (stage?.type === 'GROUPS') {
      const positions = new Map<string, { rank: number; group: string }>();
      for (const group of buildMockGroups(tournament, stage)) {
        for (const standing of group.standings) positions.set(standing.name, { rank: standing.rank, group: group.label });
      }
      const ranks = [...new Set(participants.map((row) => positions.get(row.name)?.rank ?? Number.MAX_SAFE_INTEGER))].sort((a, b) => a - b);
      for (const rank of ranks) {
        const tied = participants.filter((row) => (positions.get(row.name)?.rank ?? Number.MAX_SAFE_INTEGER) === rank);
        const label = asRange(nextPlace, tied.length);
        for (const row of tied) {
          const group = positions.get(row.name)?.group;
          row.placement = group && Number.isFinite(rank) ? `${label} · ${rank}. Platz ${group}` : label;
          row.placementNumber = nextPlace;
        }
        nextPlace += tied.length;
      }
    } else if (stage?.type === 'SWISS') {
      const ranks = new Map(buildSwissStandings(tournament, stage).map((standing) => [standing.name, standing.rank]));
      participants.sort((a, b) => (ranks.get(a.name) ?? Infinity) - (ranks.get(b.name) ?? Infinity) || a.name.localeCompare(b.name, 'de'));
      for (const row of participants) {
        row.placement = asRange(nextPlace, 1);
        row.placementNumber = nextPlace++;
      }
    } else if (stage?.type === 'KNOCKOUT' || stage?.type === 'DOUBLE_ELIMINATION' || stage?.type === 'PLACEMENT') {
      const ranks = (name: string) => {
        const placement = knockoutPlacement(tournament, stage, name);
        return Number(placement?.match(/Platz\s+(\d+)/)?.[1] ?? Number.MAX_SAFE_INTEGER);
      };
      const rankValues = [...new Set(participants.map((row) => ranks(row.name)))].sort((a, b) => a - b);
      for (const rank of rankValues) {
        const tied = participants.filter((row) => ranks(row.name) === rank);
        // Bei abgewähltem Bronze-Spiel sind zwei dritte Plätze ausdrücklich
        // gleichrangig. Kein künstliches Platz-3–4 daraus machen.
        const jointThirdPlace = rank === 3 && tied.length > 1 && tied.every((row) => knockoutPlacement(tournament, stage, row.name) === 'Platz 3');
        const label = jointThirdPlace ? `Platz ${nextPlace}` : asRange(nextPlace, tied.length);
        for (const row of tied) {
          row.placement = label;
          row.placementNumber = nextPlace;
        }
        nextPlace += tied.length;
      }
    } else {
      // Ohne absolvierte Phase gibt es keinen sportlichen Vergleich.
      // Diese Teilnehmer teilen sich die letzten noch freien Plätze.
      const label = asRange(nextPlace, participants.length);
      for (const row of participants) {
        row.placement = label;
        row.placementNumber = nextPlace;
      }
      nextPlace += participants.length;
    }
  }
  return rows.sort((a, b) => a.placementNumber - b.placementNumber || a.name.localeCompare(b.name, 'de'));
}
