import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BracketStageHeader, BracketStageValues } from '@/components/BracketScoreStages';
import { getBracketScoreStages } from '@/domain/bracketScoreStages';
import { ScoreMatchEntry } from '@/components/ScoreMatchEntry';
import { sportScoring, parseSportSet, isValidSportSet, resultScore, resultWinnerSide, scoreWithDecision, scoreDecisionTimeline, validateScoreDecision, validateCompleteResult, compareRankingRows } from '@/domain/sportScoring';
import { createMockTournament, updateMockTournamentStatus } from '@/services/mockTournamentStore';
import { startFirstStage } from '@/services/mockPhaseLifecycle';
import { completeMockMatch, getMockRuntimeMatches, getMockStoredResult, restoreMockCorrectedResult, saveMockMatchSets } from '@/services/mockRuntime';
import { buildMockBracket, buildMockGroups } from '@/services/mockCompetitionViews';
import { getMockAudit } from '@/services/mockAudit';
import type { MatchSet } from '@/domain/types';

const set = (a: number, b: number, number = 1): MatchSet => ({ number, sideAScore: a, sideBScore: b });

describe('Sportartspezifische Ergebniserfassung', () => {
  it('nutzt Tor-/Punktstände für Mannschaftssport und Satzstände für Rückschlagsport', () => {
    for (const sport of ['football', 'handball', 'basketball', 'futsal', 'hockey', 'ice_hockey']) {
      expect(sportScoring(sport).mode).toBe('score');
      expect(resultScore(sport, [set(12, 10)])).toBe('12:10');
    }
    for (const sport of ['table_tennis', 'tennis', 'volleyball', 'beach_volleyball', 'badminton', 'padel', 'squash']) {
      expect(sportScoring(sport).mode).toBe('sets');
    }
    expect(sportScoring('Fußball (Tore)').mode).toBe('score');
    expect(resultScore('Volleyball', [set(25, 15), set(19, 25, 2), set(25, 16, 3)])).toBe('2:1');
  });

  it('validiert typische Sätze und die Entscheidungssätze', () => {
    expect(parseSportSet('Tischtennis', 3, 0, '7')).toEqual(set(11, 7));
    expect(parseSportSet('badminton', 3, 0, '21:19')).toEqual(set(21, 19));
    expect(parseSportSet('badminton', 3, 0, '30:29')).toEqual(set(30, 29));
    expect(parseSportSet('badminton', 3, 0, '31:29')).toBeNull();
    expect(isValidSportSet('volleyball', 5, 0, set(25, 23))).toBe(true);
    expect(isValidSportSet('volleyball', 5, 4, set(15, 13))).toBe(true);
    expect(isValidSportSet('volleyball', 5, 4, set(25, 23))).toBe(true);
    expect(isValidSportSet('volleyball', 5, 4, set(15, 14))).toBe(false);
    expect(isValidSportSet('beach_volleyball', 3, 2, set(15, 13))).toBe(true);
    expect(isValidSportSet('tennis', 3, 0, set(6, 4))).toBe(true);
    expect(isValidSportSet('padel', 3, 0, set(7, 6))).toBe(true);
    expect(isValidSportSet('tennis', 3, 0, set(6, 5))).toBe(false);
    expect(isValidSportSet('squash', 3, 0, set(13, 11))).toBe(true);
  });

  it('wertet Unentschieden nur dort, wo sie zugelassen sind', () => {
    expect(validateCompleteResult('Fußball', 1, [set(1, 1)], false)).toBeNull();
    expect(validateCompleteResult('Fußball', 1, [set(1, 1)], true)).toContain('Sieger');
    expect(validateCompleteResult('Fußball', 1, [set(1, 1)], true, 'B')).toBeNull();
    expect(resultWinnerSide('Fußball', [set(1, 1)], 'B')).toBe('B');
    expect(resultScore('Fußball', [set(1, 1)])).toBe('1:1');
    expect(validateCompleteResult('Basketball', 1, [set(64, 64)], false)).toContain('Verlängerung');
    expect(validateCompleteResult('Basketball', 1, [set(64, 64)], true, 'A')).toContain('Verlängerung');
    expect(validateCompleteResult('Volleyball', 5, [set(25, 18)] , false)).toContain('3 gewonnene');
  });

  it('zeigt Verlängerung, Elfmeterschießen und Losentscheid eindeutig an und validiert die Entscheidung', () => {
    const tie = [set(1, 1)];
    const overtime = { type: 'EXTRA_TIME' as const, regulationScore: set(1, 1) };
    const penalties = { type: 'PENALTIES' as const, penaltyScore: set(4, 5) };
    expect(scoreWithDecision('football', [set(2, 1)], overtime)).toBe('2:1 n.V.');
    expect(validateScoreDecision('football', [set(2, 1)], undefined, overtime)).toBeNull();
    expect(validateScoreDecision('football', [set(1, 1)], undefined, overtime)).not.toBeNull();
    expect(scoreWithDecision('football', tie, penalties)).toBe('1:1 (4:5 i.E.)');
    expect(scoreWithDecision('football', tie, penalties, true)).toBe('1:1 (5:4 i.E.)');
    expect(validateScoreDecision('football', tie, 'B', penalties)).toBeNull();
    expect(validateScoreDecision('football', tie, 'A', penalties)).not.toBeNull();
    expect(validateScoreDecision('football', tie, 'A', { type: 'PENALTIES', penaltyScore: set(4, 4) })).not.toBeNull();
    expect(scoreWithDecision('football', tie, { type: 'LOT' })).toBe('1:1 (Losentscheid)');
    expect(validateScoreDecision('football', tie, undefined, { type: 'LOT' })).not.toBeNull();
    expect(validateScoreDecision('football', tie, 'A', { type: 'LOT' })).toBeNull();
    const overtimePenalties = { type: 'PENALTIES' as const, penaltyScore: set(5, 4), regulationScore: set(1, 1) };
    expect(scoreDecisionTimeline([set(2, 2)], overtimePenalties)).toEqual([
      { label: 'FT', score: '1:1' }, { label: 'n.V.', score: '2:2' }, { label: 'i.E.', score: '5:4' },
    ]);
    expect(validateScoreDecision('football', [set(2, 2)], 'A', overtimePenalties)).toBeNull();
    expect(validateScoreDecision('football', [set(0, 0)], 'A', overtimePenalties)).not.toBeNull();
    expect(scoreDecisionTimeline([set(1, 1)], penalties)).toEqual([
      { label: 'FT', score: '1:1' }, { label: 'i.E.', score: '4:5' },
    ]);
    expect(scoreDecisionTimeline([set(2, 1)], overtime)).toEqual([
      { label: 'FT', score: '1:1' }, { label: 'n.V.', score: '2:1' },
    ]);
    const stages = getBracketScoreStages([set(2, 2)], overtimePenalties, undefined, 'Anna', 'Anna', 'Ben');
    expect(stages.map((stage) => [stage.label, stage.sideA, stage.sideB])).toEqual([
      ['FT', '1', '1'], ['n.V.', '2', '2'], ['i.E.', '5', '4'],
    ]);
    const header = renderToStaticMarkup(createElement(BracketStageHeader, { stages }));
    expect(header.indexOf('FT')).toBeLessThan(header.indexOf('n.V.'));
    expect(header.indexOf('n.V.')).toBeLessThan(header.indexOf('i.E.'));
    const winnerScores = renderToStaticMarkup(createElement(BracketStageValues, { stages, sideIndex: 0 }));
    const loserScores = renderToStaticMarkup(createElement(BracketStageValues, { stages, sideIndex: 1 }));
    expect(winnerScores).toMatch(/>1<.*>2<.*>5</);
    expect(loserScores).toMatch(/>1<.*>2<.*>4</);
    expect(header).not.toContain('1:1');
    const lotStages = getBracketScoreStages([set(0, 0)], { type: 'LOT' }, undefined, 'Ben', 'Anna', 'Ben');
    expect(lotStages.map((stage) => [stage.label, stage.sideA, stage.sideB])).toEqual([
      ['FT', '0', '0'], ['Los', '–', '✓'],
    ]);
    expect(getBracketScoreStages([set(2, 1)], undefined, undefined, 'Anna', 'Anna', 'Ben')).toEqual([
      { label: 'FT', sideA: '2', sideB: '1', live: false, deciding: true },
    ]);
    expect(getBracketScoreStages([set(2, 1)], undefined, undefined, undefined, 'Anna', 'Ben', true)).toEqual([
      { label: 'FT', sideA: '2', sideB: '1', live: true, deciding: false },
    ]);
    expect(getBracketScoreStages(undefined, undefined, undefined, undefined, 'Anna', 'Ben')).toEqual([]);
  });

  it('sortiert direkte Ergebnisse nach Tabellenpunkten, Tor-/Punktedifferenz und erzielten Toren', () => {
    const row = (name: string, wins: number, draws: number, ballsWon: number, ballsLost: number) => ({ name, wins, draws, setsWon: 0, setsLost: 0, ballsWon, ballsLost });
    expect(compareRankingRows('Fußball', row('A', 1, 0, 3, 1), row('B', 0, 2, 8, 1))).toBeLessThan(0);
    expect(compareRankingRows('Fußball', row('A', 1, 0, 3, 1), row('B', 1, 0, 8, 5))).toBeGreaterThan(0);
  });
});

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: {
    getItem(key: string) { return storage.get(key) ?? null; },
    setItem(key: string, value: string) { storage.set(key, value); },
    removeItem(key: string) { storage.delete(key); },
  } }));
  vi.stubGlobal('CustomEvent', class extends Event { constructor(name: string) { super(name); } });
});
afterEach(() => vi.unstubAllGlobals());

function sampleTournament(sport: string, type: 'GROUPS' | 'KNOCKOUT') {
  const created = createMockTournament({
    name: 'Sporttest', sport, discipline: 'SINGLES', tables: 2, minimumMatches: 1,
    participantNames: ['Anna A', 'Ben B', 'Cora C', 'Dora D'],
    phases: [{ type, label: type, bestOf: 1, entrantCount: 4, groupCount: 1, swissRounds: 1, knockoutBestOf: [1, 1] }],
    estimatedDurationMinutes: 50, matchDurationMinutes: 12, venueTurnoverMinutes: 0,
  });
  startFirstStage(created);
  return updateMockTournamentStatus(created.id, 'RUNNING');
}

describe('Sportwertung in gespeicherten Turnieren', () => {
  it('speichert einen unentschiedenen Live-Stand in der Verlängerung und bewahrt den FT-Stand auf', () => {
    const tournament = sampleTournament('football', 'KNOCKOUT');
    const game = getMockRuntimeMatches(tournament).find((entry) => entry.round === 'Halbfinale')!;
    saveMockMatchSets(game.id, [set(1, 1)], 'LIVE', { regulationScore: set(1, 1) });
    saveMockMatchSets(game.id, [set(2, 2)], 'LIVE', { regulationScore: set(1, 1) });
    const live = getMockRuntimeMatches(tournament).find((entry) => entry.id === game.id)!;
    expect(live.score).toBe('2:2');
    expect(live.status).toBe('LIVE');
    expect(live.extraTimeProgress?.regulationScore).toEqual(set(1, 1));
    const liveBracket = buildMockBracket(tournament, tournament.stages[0]).flatMap((round) => round.matches).find((entry) => entry.id === game.id)!;
    expect(liveBracket.extraTimeProgress?.regulationScore).toEqual(set(1, 1));
    const liveStages = getBracketScoreStages(liveBracket.sets, undefined, liveBracket.extraTimeProgress, undefined, game.sideA, game.sideB);
    const bracketPreview = renderToStaticMarkup(createElement(BracketStageHeader, { stages: liveStages }));
    expect(bracketPreview).toContain('FT');
    expect(bracketPreview).toContain('n.V.');
    expect(bracketPreview).toContain('LIVE');
    expect(liveStages.map((stage) => `${stage.sideA}:${stage.sideB}`)).toEqual(['1:1', '2:2']);
    const form = renderToStaticMarkup(createElement(ScoreMatchEntry, { match: live }));
    expect(form).toContain('Verlängerung');
    expect(form).toContain('Reguläre Spielzeit 1:1');
    expect(form).toContain('Zwischenstand speichern');
    expect(form).not.toContain('sport-score-saved');
    completeMockMatch(game.id, [set(2, 2)], 'FINISHED', false, 'B', { type: 'PENALTIES', penaltyScore: set(3, 4), regulationScore: set(1, 1) });
    const final = getMockRuntimeMatches(tournament).find((entry) => entry.id === game.id)!;
    expect(final.extraTimeProgress).toBeUndefined();
    expect(final.decision?.regulationScore).toEqual(set(1, 1));
    const bracket = buildMockBracket(tournament, tournament.stages[0]).flatMap((round) => round.matches).find((entry) => entry.id === game.id)!;
    expect(bracket.winner).toBe(game.sideB);
    expect(scoreWithDecision('football', bracket.sets!, bracket.decision)).toBe('2:2 (3:4 i.E.)');
  });
  it('übernimmt Remis als 1 Tabellenpunkt und zeigt Tore in der Gruppenwertung', () => {
    const tournament = sampleTournament('football', 'GROUPS');
    const game = getMockRuntimeMatches(tournament)[0];
    completeMockMatch(game.id, [set(2, 2)]);
    const standings = buildMockGroups(tournament, tournament.stages[0])[0].standings;
    expect(standings.filter((row) => row.draws === 1 && row.points === 1 && row.balls === '2:2')).toHaveLength(2);
    expect(getMockRuntimeMatches(tournament)[0].score).toBe('2:2');
  });

  it('übernimmt bei remis im K.-o. den gewählten Sieger in die nächste Runde', () => {
    const tournament = sampleTournament('futsal', 'KNOCKOUT');
    const match = getMockRuntimeMatches(tournament).find((entry) => entry.round === 'Halbfinale')!;
    completeMockMatch(match.id, [set(3, 3)], 'FINISHED', false, 'B');
    const bracket = buildMockBracket(tournament, tournament.stages[0]);
    expect(bracket.find((round) => round.label === 'Halbfinale')?.matches.find((entry) => entry.id === match.id)?.winner).toBe(match.sideB);
    const result = getMockRuntimeMatches(tournament).find((entry) => entry.id === match.id)!;
    expect(result.score).toBe('3:3');
    expect(result.decisionSide).toBe('B');
  });

  it('speichert jede KO-Entscheidungsart samt Sieger, Anzeige und Korrektur-Rollback', () => {
    const tournament = sampleTournament('football', 'KNOCKOUT');
    const game = getMockRuntimeMatches(tournament).find((entry) => entry.round === 'Halbfinale')!;
    completeMockMatch(game.id, [set(2, 1)], 'FINISHED', false, undefined, { type: 'EXTRA_TIME', regulationScore: set(1, 1) });
    expect(getMockStoredResult(game.id)?.decision?.type).toBe('EXTRA_TIME');
    expect(buildMockBracket(tournament, tournament.stages[0]).find((round) => round.label === 'Halbfinale')?.matches.find((entry) => entry.id === game.id)?.decision?.type).toBe('EXTRA_TIME');
    expect(getMockRuntimeMatches(tournament).find((entry) => entry.id === game.id)?.score).toBe('2:1');
    expect(getMockRuntimeMatches(tournament).find((entry) => entry.id === game.id)?.sideA).toBe(game.sideA);
    completeMockMatch(game.id, [set(1, 1)], 'FINISHED', false, 'B', { type: 'PENALTIES', penaltyScore: set(4, 5) });
    const penaltyResult = getMockStoredResult(game.id);
    expect(scoreWithDecision('football', penaltyResult!.sets, penaltyResult!.decision)).toBe('1:1 (4:5 i.E.)');
    expect(buildMockBracket(tournament, tournament.stages[0]).find((round) => round.label === 'Halbfinale')?.matches.find((entry) => entry.id === game.id)?.winner).toBe(game.sideB);
    const correction = getMockAudit(tournament.id).find((entry) => entry.matchId === game.id && entry.action === 'RESULT_CORRECTED')!;
    expect(restoreMockCorrectedResult(tournament, correction.id)).toBe(true);
    expect(getMockStoredResult(game.id)?.decision?.type).toBe('EXTRA_TIME');
    completeMockMatch(game.id, [set(1, 1)], 'FINISHED', false, 'A', { type: 'LOT' });
    expect(buildMockBracket(tournament, tournament.stages[0]).find((round) => round.label === 'Halbfinale')?.matches.find((entry) => entry.id === game.id)?.winner).toBe(game.sideA);
    expect(getMockRuntimeMatches(tournament).find((entry) => entry.id === game.id)?.decision).toEqual({ type: 'LOT' });
    expect(() => completeMockMatch(game.id, [set(1, 1)], 'FINISHED', false, 'A', { type: 'PENALTIES', penaltyScore: set(2, 3) })).toThrow(/Sieger/);
  });

  it('stellt bei einer Ergebniskorrektur auch die frühere Siegerentscheidung wieder her', () => {
    const tournament = sampleTournament('football', 'KNOCKOUT');
    const game = getMockRuntimeMatches(tournament).find((entry) => entry.round === 'Halbfinale')!;
    completeMockMatch(game.id, [set(1, 1)], 'FINISHED', false, 'A');
    completeMockMatch(game.id, [set(2, 2)], 'FINISHED', false, 'B');
    const audit = getMockAudit(tournament.id).find((entry) => entry.matchId === game.id && entry.action === 'RESULT_CORRECTED');
    expect(audit).toBeDefined();
    expect(restoreMockCorrectedResult(tournament, audit!.id)).toBe(true);
    expect(getMockStoredResult(game.id)?.sets).toEqual([set(1, 1)]);
    expect(getMockStoredResult(game.id)?.decisionSide).toBe('A');
    expect(buildMockBracket(tournament, tournament.stages[0]).find((round) => round.label === 'Halbfinale')?.matches.find((entry) => entry.id === game.id)?.winner).toBe(game.sideA);
  });
});
