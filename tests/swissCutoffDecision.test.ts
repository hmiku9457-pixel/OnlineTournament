import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { getStageEntrants, isStageCompleted, isStageLockedWaiting, startFirstStage } from '@/services/mockPhaseLifecycle';
import {
  completeMockMatch, getMockStageMatches, getPendingSwissCutoff, getSwissCutoffHistory,
  getMockRuntimeMatches, getSwissRoundRobinMatches, assignMockMatchToTable, findMockRuntimeMatch,
  recordSwissCutoffSet, recordSwissCutoffLot, resetSwissCutoffSets, refreshCompletedStageQualifiers,
  beginSwissCutoffPlayoff, recordSwissCutoffPlayoffResult,
} from '@/services/mockRuntime';
import { buildSwissStandings } from '@/services/mockCompetitionViews';
import { equalSwissSportingRank, findSwissCutoffTie } from '@/domain/swissCutoffTie';
import type { RankedParticipant } from '@/domain/standingRankings';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: {
    getItem(key: string) { return store.get(key) ?? null; },
    setItem(key: string, value: string) { store.set(key, String(value)); },
    removeItem(key: string) { store.delete(key); },
  } }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, options?: CustomEventInit<T>) { super(type); this.detail = options?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

function create(players = 4, places = 1) {
  const tournament = createMockTournament({
    name: 'Entscheid an Grenze', sport: 'table_tennis', discipline: 'SINGLES',
    tables: Math.ceil(players / 2), minimumMatches: 1,
    participantNames: Array.from({ length: players }, (_, index) => `Spieler ${index + 1}`),
    estimatedDurationMinutes: 70,
    phases: [
      { type: 'SWISS', label: 'Schweizer', entrantCount: players, groupCount: 1, swissRounds: 1, bestOf: 1, knockoutBestOf: [] },
      { type: 'KNOCKOUT', label: 'Finalrunde', entrantCount: places, groupCount: 1, swissRounds: 1, bestOf: 1, knockoutBestOf: [] },
    ],
  });
  expect(startFirstStage(tournament)).toBe(true);
  updateMockTournamentStatus(tournament.id, 'RUNNING');
  return tournament;
}

function completeRound(tournament: ReturnType<typeof create>, differences: number[] = []) {
  const matches = getMockStageMatches(tournament, tournament.stages[0]);
  matches.forEach((match, index) => {
    completeMockMatch(match.id, [{ number: 1, sideAScore: 11, sideBScore: 11 - (differences[index] ?? 4) }]);
  });
}

describe('Stichentscheid nach letzter Schweizer Runde', () => {
  it('blockiert die automatische Weitergabe bei komplett gleichen Tie-Breakern (auch nach Reload)', () => {
    const t = create();
    completeRound(t);
    const pending = getPendingSwissCutoff(t);
    expect(pending?.tie.slots).toBe(1);
    expect(pending?.tie.players).toHaveLength(2);
    expect(isStageCompleted(t, t.stages[0])).toBe(false);
    expect(isStageLockedWaiting(t, t.stages[1])).toBe(true);
    expect(getPendingSwissCutoff(t)?.signature).toBe(pending?.signature);
    expect(recordSwissCutoffSet(t, 5, 5)).toContain('gültig');
    expect(recordSwissCutoffSet(t, 2, 3)).toContain('Ungültiges Satzergebnis');
    expect(isStageCompleted(t, t.stages[0])).toBe(false);
  });

  it('setzt nach bestätigtem Entscheidungssatz den Sieger vor den Verlierer und gibt die Folgephase frei', () => {
    const t = create();
    completeRound(t);
    const pending = getPendingSwissCutoff(t)!;
    const [winner, loser] = pending.tie.players;
    expect(recordSwissCutoffSet(t, 11, 7)).toBeNull();
    expect(getPendingSwissCutoff(t)).toBeNull();
    expect(isStageCompleted(t, t.stages[0])).toBe(true);
    expect(getStageEntrants(t, t.stages[1])).toEqual([winner]);
    const standings = buildSwissStandings(t, t.stages[0]);
    expect(standings.findIndex((row) => row.name === winner)).toBeLessThan(standings.findIndex((row) => row.name === loser));
    expect(standings.find((row) => row.name === winner)?.wins).toBe(1);
  });

  it('speichert den physisch ermittelten Losentscheid auch gegen die alphabetische Sortierung', () => {
    const t = create();
    completeRound(t);
    const pending = getPendingSwissCutoff(t)!;
    const [alphabetical, chosen] = pending.tie.players;
    expect(recordSwissCutoffLot(t, [alphabetical, chosen])).toContain('genau 1');
    expect(isStageCompleted(t, t.stages[0])).toBe(false);
    expect(recordSwissCutoffLot(t, [chosen])).toBeNull();
    expect(getStageEntrants(t, t.stages[1])).toEqual([chosen]);
    expect(buildSwissStandings(t, t.stages[0])[0].name).toBe(chosen);
    expect(getSwissCutoffHistory(t, t.stages[0])?.mode).toBe('LOT');
    expect(getSwissCutoffHistory(t, t.stages[0])?.winners).toEqual([chosen]);
  });

  it('behandelt mehr als zwei gleichplatzierte Spieler mit mehreren Entscheidungssätzen', () => {
    const t = create(6, 2);
    completeRound(t);
    const pending = getPendingSwissCutoff(t)!;
    expect(pending.tie).toMatchObject({ slots: 2 });
    expect(pending.tie.players).toHaveLength(3);
    expect(recordSwissCutoffSet(t, 11, 7)).toBeNull();
    expect(isStageCompleted(t, t.stages[0])).toBe(true);
    expect(getStageEntrants(t, t.stages[1])).toHaveLength(2);
  });

  it('kann einen laufenden Stichentscheid zurücksetzen und anschließend auslosen', () => {
    const t = create(8, 1);
    completeRound(t);
    const initial = getPendingSwissCutoff(t)!;
    expect(recordSwissCutoffSet(t, 11, 7)).toBeNull();
    expect(getPendingSwissCutoff(t)?.decision?.sets).toHaveLength(1);
    expect(isStageCompleted(t, t.stages[0])).toBe(false);
    resetSwissCutoffSets(t);
    expect(getPendingSwissCutoff(t)?.decision).toBeNull();
    expect(recordSwissCutoffLot(t, [initial.tie.players[initial.tie.players.length - 1]])).toBeNull();
    expect(isStageCompleted(t, t.stages[0])).toBe(true);
  });

  it('eröffnet eine echte zusätzliche Schweizer Runde für sämtliche verbleibenden Spieler', () => {
    const t = create(6, 2);
    completeRound(t);
    const oldStandings = buildSwissStandings(t, t.stages[0]);
    expect(getPendingSwissCutoff(t)?.tie.players).toHaveLength(3);
    expect(beginSwissCutoffPlayoff(t, 'ROUND')).toBeNull();
    const round2 = getMockStageMatches(t, t.stages[0]).filter((match) => match.round === 'Runde 2');
    expect(round2).toHaveLength(3);
    expect(new Set(round2.flatMap((match) => [match.sideA, match.sideB]))).toEqual(
      new Set(Array.from({ length: 6 }, (_, index) => `Spieler ${index + 1}`)),
    );
    expect(getPendingSwissCutoff(t)).toBeNull();
    expect(isStageCompleted(t, t.stages[0])).toBe(false);
    const first = round2[0];
    completeMockMatch(first.id, [{ number: 1, sideAScore: 11, sideBScore: 7 }]);
    expect(isStageCompleted(t, t.stages[0])).toBe(false);
    const after = buildSwissStandings(t, t.stages[0]);
    expect(after.find((row) => row.name === first.sideA)!.wins)
      .toBe(oldStandings.find((row) => row.name === first.sideA)!.wins + 1);
    expect(after.find((row) => row.name === first.sideA)!.played)
      .toBe(oldStandings.find((row) => row.name === first.sideA)!.played + 1);
    expect(after.find((row) => row.name === first.sideB)!.played)
      .toBe(oldStandings.find((row) => row.name === first.sideB)!.played + 1);
  });

  it('spielt Jeder-gegen-Jeden und schließt erst nach sämtlichen Ergebnissen ab', () => {
    const t = create(6, 2);
    completeRound(t);
    expect(beginSwissCutoffPlayoff(t, 'ROUND_ROBIN')).toBeNull();
    let current = getPendingSwissCutoff(t)!;
    expect(current.decision?.extraRounds?.[0].matches).toHaveLength(3);
    const fixtures = current.decision!.extraRounds![0].matches;
    const favorite = current.tie.players[0];
    const second = current.tie.players[1];
    const points = (game: typeof fixtures[number]) => {
      const winner = game.sideA === favorite || game.sideB === favorite ? favorite : second;
      return game.sideA === winner ? [11, 7] : [7, 11];
    };
    const firstScore = points(fixtures[0]);
    expect(recordSwissCutoffPlayoffResult(t, 0, firstScore[0], firstScore[1])).toBeNull();
    expect(isStageCompleted(t, t.stages[0])).toBe(false);
    expect(recordSwissCutoffPlayoffResult(t, 0, firstScore[0], firstScore[1])).toContain('bereits');
    fixtures.slice(1).forEach((game, i) => {
      const [a, b] = points(game);
      expect(recordSwissCutoffPlayoffResult(t, i + 1, a, b)).toBeNull();
    });
    expect(isStageCompleted(t, t.stages[0])).toBe(true);
    current = getPendingSwissCutoff(t)!;
    expect(current).toBeNull();
    expect(getStageEntrants(t, t.stages[1])).toHaveLength(2);
    const history = getSwissCutoffHistory(t, t.stages[0]);
    expect(history?.extraRounds?.filter((round) => round.kind === 'ROUND_ROBIN')).toHaveLength(1);
    expect(history?.winners).toHaveLength(2);
  });

  it('erzwingt bei einer 1:1-Dreier-Konstellation nach direktem Vergleich einen Losentscheid', () => {
    const t = create(6, 2);
    completeRound(t);
    expect(beginSwissCutoffPlayoff(t, 'ROUND_ROBIN')).toBeNull();
    const pending = getPendingSwissCutoff(t)!;
    const [a, b, c] = pending.tie.players;
    const preferredWinners = new Set([`${a}|${b}`, `${b}|${c}`, `${c}|${a}`]);
    const games = pending.decision!.extraRounds![0].matches;
    games.forEach((game, index) => {
      const sideAWins = preferredWinners.has(`${game.sideA}|${game.sideB}`);
      const result = sideAWins ? [11, 7] : [7, 11];
      expect(recordSwissCutoffPlayoffResult(t, index, result[0], result[1])).toBeNull();
    });
    expect(isStageCompleted(t, t.stages[0])).toBe(false);
    expect(getPendingSwissCutoff(t)?.decision?.winners).toBeUndefined();
    expect(recordSwissCutoffLot(t, [a])).toContain('genau 2');
    expect(recordSwissCutoffLot(t, [a, b])).toBeNull();
    expect(isStageCompleted(t, t.stages[0])).toBe(true);
    expect(getStageEntrants(t, t.stages[1])).toEqual([a, b]);
    const history = getSwissCutoffHistory(t, t.stages[0]);
    expect(history?.mode).toBe('LOT');
    expect(history?.lotPlayers).toEqual(expect.arrayContaining([a, b, c]));
    expect(history?.lotWinners).toEqual([a, b]);
    expect(history?.extraRounds?.[0].matches).toHaveLength(3);
  });

  it('führt Phase 1.5 über normale Warteschlange, Tischzuweisung und Ergebniserfassung aus', () => {
    const t = create(6, 2);
    completeRound(t);
    expect(beginSwissCutoffPlayoff(t, 'ROUND_ROBIN')).toBeNull();
    const active = getMockRuntimeMatches(t);
    expect(active).toHaveLength(3);
    expect(active.every((match) => match.status === 'WAITING' && match.bestOf === 1
      && match.phase.includes('Phase 1.5'))).toBe(true);
    const first = active[0];
    expect(findMockRuntimeMatch(first.id)?.match.id).toBe(first.id);
    expect(assignMockMatchToTable(t, first.id, 'Tisch 1')).toBe(true);
    expect(getMockRuntimeMatches(t).find((match) => match.id === first.id)).toMatchObject({
      table: 'Tisch 1', status: 'LIVE',
    });
    expect(getMockStageMatches(t, t.stages[0]).some((match) => match.id === first.id)).toBe(false);
    const winnerOrder = [...new Set(active.flatMap((game) => [game.sideA, game.sideB]))];
    const target = (game: typeof active[number]) => {
      const aPreferred = winnerOrder.indexOf(game.sideA) < winnerOrder.indexOf(game.sideB);
      return { number: 1, sideAScore: aPreferred ? 11 : 7, sideBScore: aPreferred ? 7 : 11 };
    };
    const firstResult = target(first);
    completeMockMatch(first.id, [firstResult]);
    expect(getPendingSwissCutoff(t)?.decision?.extraRounds?.[0].matches[0].pointsA).toBe(firstResult.sideAScore);
    expect(getMockRuntimeMatches(t).find((match) => match.id === first.id)?.status).toBe('FINISHED');
    expect(isStageCompleted(t, t.stages[0])).toBe(false);
    active.slice(1).forEach((game) => completeMockMatch(game.id, [target(game)]));
    expect(isStageCompleted(t, t.stages[0])).toBe(true);
    expect(getSwissRoundRobinMatches(t, t.stages[0])).toHaveLength(3);
    expect(getStageEntrants(t, t.stages[1])).toHaveLength(2);
    expect(buildSwissStandings(t, t.stages[0]).reduce((sum, row) => sum + row.played, 0)).toBe(6);
    // A correction from the ordinary match editor must update Phase 1.5's
    // separate table and historical results, never the original Swiss record.
    const corrected = { ...firstResult, sideAScore: firstResult.sideBScore, sideBScore: firstResult.sideAScore };
    completeMockMatch(first.id, [corrected]);
    expect(getSwissCutoffHistory(t, t.stages[0])?.extraRounds?.[0].matches[0]).toMatchObject({
      pointsA: corrected.sideAScore, pointsB: corrected.sideBScore,
    });
    expect(getSwissRoundRobinMatches(t, t.stages[0]).find((game) => game.id === first.id)?.score)
      .toBe(firstResult.sideAScore > firstResult.sideBScore ? '0:1' : '1:0');
    expect(buildSwissStandings(t, t.stages[0]).reduce((sum, row) => sum + row.played, 0)).toBe(6);
  });

  it('gibt keine weitere Schweizer Runde frei, bevor alle angesetzten Spiele fertig sind', () => {
    const t = create(8, 1);
    completeRound(t);
    expect(beginSwissCutoffPlayoff(t, 'ROUND')).toBeNull();
    const round2 = getMockStageMatches(t, t.stages[0]).filter((match) => match.round === 'Runde 2');
    expect(round2).toHaveLength(4);
    expect(new Set(round2.flatMap((match) => [match.sideA, match.sideB])).size).toBe(8);
    completeMockMatch(round2[0].id, [{ number: 1, sideAScore: 11, sideBScore: 7 }]);
    expect(isStageCompleted(t, t.stages[0])).toBe(false);
    expect(getPendingSwissCutoff(t)).toBeNull();
    expect(beginSwissCutoffPlayoff(t, 'ROUND')).toContain('Kein offener Stichentscheid');
  });

  it('fordert nach Ergebniskorrekturen einen neuen Entscheid, statt eine veraltete Auswahl zu übernehmen', () => {
    const t = create();
    completeRound(t);
    const old = getPendingSwissCutoff(t)!;
    expect(recordSwissCutoffLot(t, [old.tie.players[0]])).toBeNull();
    expect(isStageCompleted(t, t.stages[0])).toBe(true);
    const fixtures = getMockStageMatches(t, t.stages[0]);
    // Erst entsteht eine klare Rangfolge. Danach besteht wieder sportlicher
    // Gleichstand, aber das ursprünglich dokumentierte Los ist nicht mehr gültig.
    completeMockMatch(fixtures[0].id, [{ number: 1, sideAScore: 11, sideBScore: 6 }]);
    expect(refreshCompletedStageQualifiers(t, t.stages[0])).toBe(true);
    completeMockMatch(fixtures[1].id, [{ number: 1, sideAScore: 11, sideBScore: 6 }]);
    expect(refreshCompletedStageQualifiers(t, t.stages[0])).toBe(false);
    expect(isStageCompleted(t, t.stages[0])).toBe(false);
    expect(isStageLockedWaiting(t, t.stages[1])).toBe(true);
    expect(getPendingSwissCutoff(t)?.decision).toBeNull();
    expect(getPendingSwissCutoff(t)?.signature).not.toBe(old.signature);
    expect(recordSwissCutoffLot(t, [getPendingSwissCutoff(t)!.tie.players[1]])).toBeNull();
    expect(isStageCompleted(t, t.stages[0])).toBe(true);
  });

  it('lässt eine eindeutige sportliche Reihenfolge ohne Modal direkt weitergehen', () => {
    const t = create();
    completeRound(t, [6, 3]);
    expect(getPendingSwissCutoff(t)).toBeNull();
    expect(isStageCompleted(t, t.stages[0])).toBe(true);
  });
});

describe('Exakter sportlicher Gleichstand', () => {
  const ranking = (name: string): RankedParticipant => ({
    name, played: 5, wins: 3, losses: 2, draws: 0,
    setsWon: 8, setsLost: 5, ballsWon: 110, ballsLost: 90, buchholz: 12.5,
  });
  it('ignoriert ausschließlich den alphabetischen Fallback und erkennt die ganze Cut-Gruppe', () => {
    const a = ranking('Anna');
    const b = ranking('Bernd');
    const c = ranking('Chris');
    expect(equalSwissSportingRank(a, b, 'table_tennis')).toBe(true);
    expect(findSwissCutoffTie([a, b, c], 'table_tennis', 1)).toEqual({
      players: ['Anna', 'Bernd', 'Chris'], slots: 1, firstRank: 1,
    });
    expect(findSwissCutoffTie([a, b, c], 'table_tennis', 3)).toBeNull();
    expect(findSwissCutoffTie([a, b, { ...c, ballsWon: 91 }], 'table_tennis', 2)).toBeNull();
  });
});
