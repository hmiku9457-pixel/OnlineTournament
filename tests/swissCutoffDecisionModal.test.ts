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
const props = { status, tournament, onSet: ignore, onLot: ignore, onBegin: ignore, onReset: () => {} };

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
    expect(html).toContain('Der Name entscheidet niemals über das Weiterkommen');
    expect(html).toContain('Offene Qualifikationsplätze');
    expect((html.match(/class="swiss-cutoff-method"/g) ?? [])).toHaveLength(2);
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
    expect((html.match(/class="swiss-cutoff-method"/g) ?? [])).toHaveLength(3);
  });

  it('fordert bei drei identischen 1:1-Spielern zwingend den physischen Losentscheid', () => {
    const players = ['Spieler 12', 'Spieler 13', 'Spieler 14'];
    const cycle: SwissCutoffStatus = {
      ...status,
      tie: { players, slots: 1, firstRank: 1 },
      decision: {
        signature: 'test', mode: 'ROUND_ROBIN', eliminated: [], sets: [],
        extraRounds: [{ kind: 'ROUND_ROBIN', matches: [
          { sideA: players[0], sideB: players[1], pointsA: 11, pointsB: 7, matchDay: 1 },
          { sideA: players[1], sideB: players[2], pointsA: 11, pointsB: 7, matchDay: 2 },
          { sideA: players[2], sideB: players[0], pointsA: 11, pointsB: 7, matchDay: 3 },
        ] }],
      },
    };
    const html = renderToStaticMarkup(createElement(SwissCutoffDecisionModal, { ...props, status: cycle }));
    expect(html).toContain('direkte Vergleich');
    expect(html).toContain('physischer Losentscheid zwingend erforderlich');
    expect(html).toContain('Losentscheid verbindlich bestätigen');
    expect(html).toContain('1 offenen Losplätzen ausgewählt');
    expect(html).not.toContain('Weitere Runde ausspielen');
    expect(html).not.toContain('Zurück zur Auswahl');
    expect(html).not.toContain('Jeder gegen Jeden</strong>');
  });

  it('leitet für eine begonnene Phase 1.5 zur regulären Turnierleitung statt einer Satzeingabe im Modal', () => {
    const large: SwissCutoffStatus = { ...status,
      tie: { players: ['Spieler 12', 'Spieler 13', 'Spieler 14'], slots: 1, firstRank: 1 },
      decision: {
        signature: 'test', mode: 'ROUND_ROBIN', eliminated: [], sets: [],
        extraRounds: [{ kind: 'ROUND_ROBIN', matches: [{ sideA: 'Spieler 12', sideB: 'Spieler 13' }] }],
      },
    };
    const html = renderToStaticMarkup(createElement(SwissCutoffDecisionModal, { ...props, status: large }));
    expect(html).toContain('Phase 1.5 läuft in der Turnierleitung');
    expect(html).toContain('Tische zu');
    expect(html).not.toContain('Satz 1 bestätigen');
  });
});
