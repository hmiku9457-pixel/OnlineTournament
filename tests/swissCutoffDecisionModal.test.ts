import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SwissCutoffDecisionModal } from '@/components/SwissCutoffDecisionModal';
import type { SwissCutoffStatus } from '@/services/mockRuntime';
import { createMockTournament } from '@/services/mockTournamentStore';

const tournament = createMockTournament({
  name: 'Cutoff Table', sport: 'table_tennis', discipline: 'SINGLES',
  tables: 2, minimumMatches: 1, estimatedDurationMinutes: 30,
  participantNames: ['Spieler 12', 'Spieler 13', 'Spieler 14', 'Spieler 15'],
  phases: [{ type: 'SWISS', label: 'Swiss', entrantCount: 4, groupCount: 1,
    swissRounds: 1, bestOf: 1, knockoutBestOf: [] }],
});
const status: SwissCutoffStatus = {
  stageId: tournament.stages[0].id,
  tie: { players: ['Spieler 12', 'Spieler 13'], slots: 1, firstRank: 1 },
  signature: 'test',
  decision: null,
};
const ignore = () => null;
const props = { status, tournament, onSet: ignore, onLot: ignore, onBegin: ignore, onResult: ignore, onReset: () => {} };

describe('Modal für Schweizer Qualifikationsgleichstand', () => {
  it('blockiert die Phase sichtbar und bietet Entscheidungssatz oder physischen Losentscheid an', () => {
    const html = renderToStaticMarkup(createElement(SwissCutoffDecisionModal, {
      ...props,
    }));
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Gleichstand an der Qualifikationsgrenze');
    expect(html).toContain('Spieler 12');
    expect(html).toContain('Spieler 13');
    expect(html).toContain('Entscheidungssatz spielen');
    expect(html).toContain('Physischer Losentscheid');
    expect(html).toContain('alphabetische Reihenfolge entscheidet nicht');
    expect(html).toContain('Schweizer Tabelle');
    expect(html).toContain('swiss-cutoff-highlight');
    expect(html).toContain('swiss-cutoff-table-side');
  });

  it('bietet ab drei gleichplatzierten Spielern die zusätzliche Runde und Jeder gegen Jeden an', () => {
    const large: SwissCutoffStatus = { ...status,
      tie: { players: ['Spieler 12', 'Spieler 13', 'Spieler 14'], slots: 1, firstRank: 1 } };
    const html = renderToStaticMarkup(createElement(SwissCutoffDecisionModal, { ...props, status: large }));
    expect(html).toContain('Weitere Runde ausspielen');
    expect(html).toContain('Physischer Losentscheid');
    expect(html).toContain('Jeder gegen Jeden');
    expect(html).not.toContain('Entscheidungssatz spielen');
  });

  it('benutzt für den begonnenen Zusatzmodus denselben Satzeingabe-Knopf wie normale Spiele', () => {
    const large: SwissCutoffStatus = { ...status,
      tie: { players: ['Spieler 12', 'Spieler 13', 'Spieler 14'], slots: 1, firstRank: 1 },
      decision: {
        signature: 'test', mode: 'ROUND', eliminated: [], sets: [],
        extraRounds: [{ kind: 'ROUND', bye: 'Spieler 14', matches: [{ sideA: 'Spieler 12', sideB: 'Spieler 13' }] }],
      },
    };
    const html = renderToStaticMarkup(createElement(SwissCutoffDecisionModal, { ...props, status: large }));
    expect(html).toContain('Zusätzliche Entscheidungsrunde');
    expect(html).toContain('Satz 1 bestätigen');
    expect(html).toContain('aria-label="Satz 1"');
    expect(html).toContain('Freilos');
  });
});
