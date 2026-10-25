import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MatchResultDetails } from '@/components/MatchResultDetails';
import { BracketScoreCells, BracketStageValues } from '@/components/BracketScoreStages';
import { SwissRoundCard } from '@/components/SwissRoundCard';

const ignoreClick = () => {};

describe('Ergebnisse im Turnierverlauf direkt öffnen', () => {
  it('kennzeichnet direkte Ergebnisaktionen, ohne die Popover-Bedienung anderswo zu ändern', () => {
    const props = { score: '1:0', sets: [{ number: 1, sideAScore: 11, sideBScore: 7 }] };
    const direct = renderToStaticMarkup(createElement(MatchResultDetails, { ...props, onOpenResult: ignoreClick }));
    const regular = renderToStaticMarkup(createElement(MatchResultDetails, props));
    expect(direct).toContain('direct-result-trigger');
    expect(regular).not.toContain('direct-result-trigger');
    expect(direct).toContain('1:0');
  });

  it('öffnet Bracket-Ergebniszellen direkt, lässt nicht anklickbare Werte als Text stehen', () => {
    const stages = [{ label: 'FT', sideA: '2', sideB: '1', live: false, deciding: true }];
    const active = renderToStaticMarkup(createElement(BracketStageValues, { stages, sideIndex: 0, onOpenResult: ignoreClick }));
    const passive = renderToStaticMarkup(createElement(BracketStageValues, { stages, sideIndex: 0 }));
    expect(active).toContain('<button');
    expect(active).toContain('bracket-result-action');
    expect(passive).not.toContain('<button');
    const fallback = renderToStaticMarkup(createElement(BracketScoreCells, { onOpenResult: ignoreClick, children: '3' }));
    expect(fallback).toContain('bracket-result-action');
    expect(fallback).toContain('>3</button>');
  });

  it('stellt laufende Schweizer Ergebnisse als direkte Aktionen dar', () => {
    const html = renderToStaticMarkup(createElement(SwissRoundCard, {
      fixtures: [{ id: 'swiss-1', round: 'Runde 1', sideA: 'Anna', sideB: 'Ben' }],
      matches: [{ id: 'swiss-1', score: '1:0', status: 'LIVE', table: 'Tisch 1', sets: [{ number: 1, sideAScore: 11, sideBScore: 7 }] }],
      sport: 'Tischtennis', editable: false, onEditResult: ignoreClick,
    }));
    expect(html).toContain('direct-result-trigger');
    expect(html).toContain('Anna');
    expect(html).toContain('Ben');
  });
});
