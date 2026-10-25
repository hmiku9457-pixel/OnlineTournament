import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SwissStandingsTable } from '@/components/SwissStandingsTable';
import { SwissBuchholzHelpModal } from '@/components/SwissBuchholzHelpModal';
import type { MockStanding } from '@/services/mockCompetitionViews';

const row: MockStanding = {
  rank: 1, name: 'Anna', played: 5, wins: 3, losses: 2, draws: 0,
  points: 9, buchholz: 12.5,
  sets: '8:4', setDifference: 4, balls: '110:94', ballDifference: 16,
};

const common = {
  standings: [row],
  unplayedWinners: new Set(['Anna']),
  previousFinishLabels: {},
  withdrawalLabel: () => null,
  qualifyingPlaces: 1,
  cutoffIndex: null,
  finalized: true,
  onSelectPlayer: () => {},
  onShowBuchholz: () => {},
};

describe('Schweizer Tabelle: Spalten und BHZ-Hilfe', () => {
  it('ordnet S / N / BHZ / Satz ± / Sätze / Ball ± / Bälle und zeigt die BHZ normalgewichtig', () => {
    const html = renderToStaticMarkup(createElement(SwissStandingsTable, { ...common, scoreSport: false, scoreUnit: 'Bälle' }));
    const head = html.split('<thead>')[1].split('</thead>')[0];
    const columns = ['Sp.', 'S', 'N', 'BHZ', 'Satz ±', 'Sätze', 'Ball ±', 'Bälle'];
    const positions = columns.map((label) => head.indexOf(`>${label}<`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(head).toContain('Buchholzzahl (BHZ) erklären');
    const body = html.split('<tbody>')[1].split('</tbody>')[0];
    expect(body).toContain('class="swiss-buchholz-cell">12,5</td>');
    expect(body.indexOf('>+4</td>')).toBeLessThan(body.indexOf('>8</span><span>:</span><span>4</span>'));
    expect(body.indexOf('>+16</td>')).toBeLessThan(body.indexOf('>110</span><span>:</span><span>94</span>'));
    expect(html).toContain('class="swiss-legend-symbol"');
    expect(html).toContain('Mindestens ein Sieg durch Freilos oder kampflose Wertung');
    expect(html).toContain('Rangfolge');
    expect(html).not.toContain('swiss-ranking-legend');
  });

  it('ordnet für Ergebnissportarten die BHZ nach S / U / N und die Differenz vor die Tore', () => {
    const html = renderToStaticMarkup(createElement(SwissStandingsTable, { ...common, scoreSport: true, scoreUnit: 'Tore' }));
    const head = html.split('<thead>')[1].split('</thead>')[0];
    const positions = ['Sp.', 'S', 'U', 'N', 'BHZ', '±', 'Tore', 'Pkt.'].map((label) => head.indexOf(`>${label}<`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html).toContain('class="swiss-buchholz-cell">12,5</td>');
    expect(html).toContain('>+16</td>');
  });

  it('zeigt im Modal die Formel, ein Rechenbeispiel und die zur Phase passende Freilos-Obergrenze', () => {
    const html = renderToStaticMarkup(createElement(SwissBuchholzHelpModal, { rounds: 5, onClose: () => {} }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Was ist die Buchholzzahl (BHZ)?');
    expect(html).toContain('Gegner mit 4, 3 und 2,5');
    expect(html).toContain('BHZ von <strong>9,5</strong>');
    expect(html).toContain('5 Runden');
    expect(html).toContain('bei 2,5 pro Freilos');
    expect(html).toContain('Kampfloses Spiel');
    expect(html).toContain('Schließen');
  });
});
