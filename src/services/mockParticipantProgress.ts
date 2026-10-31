import type { DemoTournament } from '@/data/demoTournaments';
import type { TournamentStage } from '@/domain/types';
import { buildMockBracket, buildMockGroups, buildRoundRobinStandings, buildSwissStandings } from '@/services/mockCompetitionViews';
import { getStageEntrants, getNextCompetitionStage, isStageCompleted, isStageStarted } from '@/services/mockPhaseLifecycle';
import { getMockStageBaseMatches, getMockStoredResult, isMockParticipantWithdrawn } from '@/services/mockRuntime';
import { getRuntimeParticipantNames } from '@/services/mockParticipants';
import { resultWinnerSide } from '@/domain/sportScoring';

export interface MockParticipantProgress {
  status: 'Aktiv' | 'Ausgeschieden' | 'Zurückgezogen' | 'Turniersieger' | 'Beendet' | `Nicht für Phase ${string} qualifiziert`;
  placement?: string;
}

function winnerFor(matchId: string, sideA: string, sideB: string, sport: string, autoWinner?: string): string | undefined {
  if (autoWinner) return autoWinner;
  const result = getMockStoredResult(matchId);
  if (!result || result.status !== 'FINISHED' || result.thirdPlaceSkipped) return undefined;
  if (result.forcedWinner) return result.forcedWinner;
  const winner = resultWinnerSide(sport, result.sets, result.decisionSide);
  return winner === 'A' ? sideA : winner === 'B' ? sideB : undefined;
}

function knockoutPlacement(tournament: DemoTournament, stage: TournamentStage, name: string): string | undefined {
  const matches = getMockStageBaseMatches(tournament, stage);
  const bronze = matches.find((match) => match.round === 'Spiel um Platz 3');
  const bronzeResult = bronze && getMockStoredResult(bronze.id);
  if (bronze && (bronze.sideA === name || bronze.sideB === name) && bronzeResult?.status === 'FINISHED') {
    if (bronzeResult.thirdPlaceSkipped) return 'Platz 3';
    return winnerFor(bronze.id, bronze.sideA, bronze.sideB, tournament.sport) === name ? 'Platz 3' : 'Platz 4';
  }

  const final = matches.find((match) => match.round === 'Finale');
  if (final && (final.sideA === name || final.sideB === name)) {
    const winner = winnerFor(final.id, final.sideA, final.sideB, tournament.sport, final.autoWinner);
    if (winner) return winner === name ? 'Platz 1' : 'Platz 2';
  }

  const regularRounds = buildMockBracket(tournament, stage).filter((round) => round.label !== 'Spiel um Platz 3');
  for (let index = 0; index < regularRounds.length; index += 1) {
    for (const match of regularRounds[index].matches) {
      if (match.sideA !== name && match.sideB !== name) continue;
      const winner = winnerFor(match.id, match.sideA, match.sideB, tournament.sport, match.autoWinner);
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
    const row = buildRoundRobinStandings(tournament, stage).find((item) => item.name === name);
    return row ? `Platz ${row.rank}` : undefined;
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

  // Between phase approval and the next competition's actual start, a
  // non-qualifier remains eligible as a replacement without being "Aktiv".
  // Scheduled break phases must not hide this status.
  for (const previous of [...started].reverse()) {
    if (previous.type === 'BREAK' || !isStageCompleted(tournament, previous)
      || !getStageEntrants(tournament, previous).includes(name)) continue;
    const nextCompetition = getNextCompetitionStage(tournament, previous);
    if (nextCompetition && !isStageStarted(tournament, nextCompetition)
      && !getStageEntrants(tournament, nextCompetition).includes(name)) {
      return { status: `Nicht für Phase ${nextCompetition.name} qualifiziert`,
        placement: placementInStage(tournament, previous, name) };
    }
    break;
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
    } else if (stage?.type === 'SWISS' || stage?.type === 'ROUND_ROBIN') {
      const standings = stage.type === 'SWISS'
        ? buildSwissStandings(tournament, stage) : buildRoundRobinStandings(tournament, stage);
      const ranks = new Map(standings.map((standing) => [standing.name, standing.rank]));
      const rankValues = [...new Set(participants.map((row) => ranks.get(row.name) ?? Number.MAX_SAFE_INTEGER))]
        .sort((a, b) => a - b);
      for (const rank of rankValues) {
        const tied = participants.filter((row) => (ranks.get(row.name) ?? Number.MAX_SAFE_INTEGER) === rank);
        const label = asRange(nextPlace, tied.length);
        for (const row of tied) {
          row.placement = label;
          row.placementNumber = nextPlace;
        }
        nextPlace += tied.length;
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

/** Confirmed tournament-wide places while later phases are still open.
 * Survivors are intentionally excluded: their final place is not known.
 * A completed stage is required before its non-qualifiers receive a place. */
export function getMockConfirmedFinalStandings(tournament: DemoTournament): ReturnType<typeof getMockFinalStandings> {
  if (tournament.status === 'FINISHED') return getMockFinalStandings(tournament);

  const eliminated: Array<{ name: string; stageIndex: number; rank: number; origin?: string }> = [];
  tournament.stages.forEach((stage, stageIndex) => {
    if (stage.type === 'BREAK' || !isStageCompleted(tournament, stage)) return;
    const next = getNextCompetitionStage(tournament, stage);
    // A non-qualifier can still replace someone until the next real
    // competition starts (even if a scheduled break has already begun).
    if (!next || !isStageStarted(tournament, next)) return;
    const advancing = new Set(getStageEntrants(tournament, next));
    const leaving = getStageEntrants(tournament, stage).filter((name) => !advancing.has(name));
    if (!leaving.length) return;

    const groups = stage.type === 'GROUPS' ? buildMockGroups(tournament, stage) : [];
    const ranks = stage.type === 'SWISS' ? buildSwissStandings(tournament, stage)
      : stage.type === 'ROUND_ROBIN' ? buildRoundRobinStandings(tournament, stage) : [];

    leaving.forEach((name) => {
      const group = groups.find((item) => item.standings.some((row) => row.name === name));
      const rank = group
        ? group.standings.find((row) => row.name === name)!.rank
        : stage.type === 'KNOCKOUT' || stage.type === 'DOUBLE_ELIMINATION' || stage.type === 'PLACEMENT'
          ? Number(knockoutPlacement(tournament, stage, name)?.match(/Platz\s+(\d+)/)?.[1] ?? 999999)
          : ranks.find((row) => row.name === name)?.rank ?? 999999;
      eliminated.push({ name, stageIndex, rank, origin: group ? `${rank}. Platz ${group.label}` : undefined });
    });
  });
  if (!eliminated.length) return [];

  const first = tournament.stages[0];
  const entrantCount = first ? getStageEntrants(tournament, first).length : getRuntimeParticipantNames(tournament).length;
  const order = [...eliminated].sort((a, b) => b.stageIndex - a.stageIndex || a.rank - b.rank
    || a.name.localeCompare(b.name, 'de'));
  let place = Math.max(1, entrantCount - eliminated.length + 1);
  const result: ReturnType<typeof getMockFinalStandings> = [];

  for (let i = 0; i < order.length;) {
    const current = order[i];
    let end = i + 1;
    // Same-group rankings across different groups are intentionally shared.
    while (end < order.length && order[end].stageIndex === current.stageIndex
      && order[end].rank === current.rank) end++;
    const count = end - i;
    const label = `Platz ${place}${count > 1 ? `–${place + count - 1}` : ''}`;
    order.slice(i, end).forEach((row) => {
      const withdrawn = isMockParticipantWithdrawn(tournament, row.name);
      result.push({
        name: row.name,
        status: withdrawn ? 'Zurückgezogen' : 'Ausgeschieden',
        placement: row.origin ? `${label} · ${row.origin}` : label,
        stageIndex: row.stageIndex,
        placementNumber: place,
      });
    });
    place += count;
    i = end;
  }
  return result;
}
