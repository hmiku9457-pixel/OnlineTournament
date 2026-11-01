import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { recommendedEqualGroupQualifiers, needsGroupStreichungsregel, discardedGroupOpponents } from '@/domain/groupQualification';
import { isAllowedParticipantName, sanitizeParticipantName } from '@/domain/participantNames';
import { getVenueTerminology } from '@/domain/venueTerminology';
import { estimateKnockoutRoundMinutes, estimatePhaseMetrics, minimumPlayedMatches } from '@/domain/tournamentCreation';
import { buildPlannedTimeline } from '@/domain/tournamentSchedule';
import { recommendTournamentFormats } from '@/engine/recommendations';
import { QualificationRuleDialog } from '@/components/QualificationRuleDialog';
import { rankStandings, type RankingMatch } from '@/domain/standingRankings';

describe('creation revision: group fairness and qualified participants', () => {
  it('recommends equal qualifiers and flags partial cutoff in uneven groups', () => {
    expect(needsGroupStreichungsregel(19, 4, 7)).toBe(true);
    expect(needsGroupStreichungsregel(19, 4, 8)).toBe(false);
    expect(needsGroupStreichungsregel(20, 4, 7)).toBe(false);
    expect(recommendedEqualGroupQualifiers(19, 4, 7)).toBe(8);
    expect(recommendedEqualGroupQualifiers(19, 4, 8)).toBe(8);
    expect(recommendedEqualGroupQualifiers(19, 4, 10)).toBe(12);
  });

  it('drops only matches against extra bottom-ranked opponents for cross-group comparison', () => {
    const a = ['Anna', 'Berit', 'Clara', 'Dora', 'Eva'];
    const allMatches: RankingMatch[] = [];
    for (let i = 0; i < a.length; i++) {
      for (let j = i + 1; j < a.length; j++) {
        allMatches.push({ sideA: a[i], sideB: a[j], status: 'FINISHED', sets: [{ number: 1, sideAScore: 11, sideBScore: 5 }] });
      }
    }
    const full = rankStandings(a, allMatches, 'table_tennis');
    expect(full.map((row) => row.name)).toEqual(a);
    const discarded = discardedGroupOpponents(full, 4);
    expect([...discarded]).toEqual(['Eva']);
    const remaining = a.filter((name) => !discarded.has(name));
    const comparison = rankStandings(remaining,
      allMatches.filter((match) => !discarded.has(match.sideA) && !discarded.has(match.sideB)), 'table_tennis');
    expect(full.find((row) => row.name === 'Berit')?.wins).toBe(3);
    expect(comparison.find((row) => row.name === 'Berit')?.wins).toBe(2);
    expect(full.find((row) => row.name === 'Eva')?.played).toBe(4);
  });

  it('explains the rule in a modal and offers adoption of the balanced count', () => {
    const html = renderToStaticMarkup(createElement(QualificationRuleDialog, {
      groupCount: 4, groupEntrants: 19, qualifiers: 7, recommended: 8,
      onCancel: () => {}, onApply: () => {},
    }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Streichungsregel');
    expect(html).toContain('Letztplatzierten');
    expect(html).toContain('Empfehlung: 8 Qualifikationsplätze');
    expect(html).toContain('8 Qualifikationsplätze übernehmen');
  });
});

describe('creation revision: names, venues, timing and recommendations', () => {
  it('allows Unicode letters and hyphenated names, but no special separators or digits', () => {
    for (const name of ['Søren', 'Müller-Lüdenscheidt', 'Øyvind', 'Zoë', 'Jean-Luc', 'FC Nord']) {
      expect(isAllowedParticipantName(name)).toBe(true);
    }
    for (const name of ['Hans/Erik', 'FC 08', 'Tom_Lee', 'A.B', 'Test 01', '-Hans']) {
      expect(isAllowedParticipantName(name)).toBe(false);
    }
    expect(sanitizeParticipantName('Løwe/Max_01')).toBe('LøweMax');
  });

  it('uses Tische only for table sports and Plätze for court/field sports', () => {
    expect(getVenueTerminology('table_tennis').plural).toBe('Tische');
    for (const sport of ['tennis', 'football', 'handball', 'badminton', 'volleyball']) {
      expect(getVenueTerminology(sport).plural).toBe('Plätze');
    }
  });

  it('places KO breaks after the true cumulative match durations with mixed Best-of', () => {
    const roundMinutes = estimateKnockoutRoundMinutes(8, 8, 1, [1, 1, 7], { minutesPerSet: 5 });
    expect(roundMinutes).toEqual([5, 5, 28]);
    const estimated = estimatePhaseMetrics({
      type: 'KNOCKOUT', entrantCount: 8, bestOf: 1, knockoutBestOf: [1, 1, 7],
    }, 8, { minutesPerSet: 5 });
    expect(estimated.estimatedDurationMinutes).toBe(38);
    const timeline = buildPlannedTimeline('2030-11-01T10:00', [
      { label: 'Finalrunde', type: 'KNOCKOUT', estimatedMinutes: 38, roundCount: 3,
        roundDurationsMinutes: roundMinutes, inlineBreakAfterRound: 2,
        inlineBreakKind: 'minutes', inlineBreakMinutes: 15 },
    ]);
    expect(timeline.items.find((x) => x.id === 'inline-break-1')?.at).toBe('2030-11-01T10:10');
    expect(timeline.estimatedEnd).toBe('2030-11-01T10:53');
    expect(minimumPlayedMatches('KNOCKOUT', 6)).toBe(1);
  });

  it('prefers 3.5h and pads available formats up to five without overriding an explicit hard limit', () => {
    const input = { playerCount: 20, tableCount: 8, minimumMatches: 3, sport: 'table_tennis', matchDurationMinutes: 5 };
    const formats = recommendTournamentFormats(input);
    expect(formats.length).toBe(5);
    const firstLong = formats.findIndex((item) => item.estimatedDurationMinutes > 210);
    if (firstLong !== -1) {
      expect(formats.slice(firstLong).every((item) => item.estimatedDurationMinutes > 210)).toBe(true);
    }
    expect(recommendTournamentFormats(input, { maxRecommendedDurationMinutes: 180 })
      .every((item) => item.estimatedDurationMinutes <= 180)).toBe(true);
  });
});
