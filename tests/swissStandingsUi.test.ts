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

describe('Schweizer Tabelle: Spalten und Sonneborn-Berger-Hilfe', () => {
  it('ordnet S / N / SB / Sätze / ± / Bälle / ± und zeigt die SB normalgewichtig', () => {
    const html = renderToStaticMarkup(createElement(SwissStandingsTable, { ...common, scoreSport: false, scoreUnit: 'Bälle' }));
    const head = html.split('<thead>')[1].split('</thead>')[0];
    const headers = [...head.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)]
      .map(([, value]) => value.replace(/<[^>]+>/g, '').replace('?', '').trim());
    expect(headers).toEqual(['#', 'Teilnehmer', 'Sp.', 'S', 'N', 'SB', 'Sätze', '±', 'Bälle', '±']);
    expect(head.match(/swiss-stat-ratio swiss-stat-group-start/g)).toHaveLength(2);
    expect(head).toContain('Sonneborn-Berger-Wertung (SB) erklären');
    const body = html.split('<tbody>')[1].split('</tbody>')[0];
    expect(body).toContain('class="swiss-buchholz-cell">12,5</td>');
    expect(body).toContain('<span class="swiss-difference-sign">+</span><span class="swiss-difference-digits">4</span>');
    expect(body).toContain('<span class="swiss-difference-sign">+</span><span class="swiss-difference-digits">16</span>');
    expect(body.indexOf('class="swiss-difference-digits">4')).toBeGreaterThan(body.indexOf('>8</span><span>:</span><span>4</span>'));
    expect(body.indexOf('class="swiss-difference-digits">16')).toBeGreaterThan(body.indexOf('>110</span><span>:</span><span>94</span>'));
    expect(html).toContain('class="swiss-legend-symbol"');
    expect(html).toContain('Mindestens ein Sieg durch Freilos oder kampflose Wertung');
    expect(html).toContain('Rangfolge');
    expect(html).not.toContain('swiss-ranking-legend');
  });

  it('ordnet für Ergebnissportarten die SB nach S / U / N und die Differenz hinter die Tore', () => {
    const html = renderToStaticMarkup(createElement(SwissStandingsTable, { ...common, scoreSport: true, scoreUnit: 'Tore' }));
    const head = html.split('<thead>')[1].split('</thead>')[0];
    const headers = [...head.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)]
      .map(([, value]) => value.replace(/<[^>]+>/g, '').replace('?', '').trim());
    expect(headers).toEqual(['#', 'Teilnehmer', 'Sp.', 'S', 'U', 'N', 'SB', 'Tore', '±', 'Pkt.']);
    expect(head.match(/swiss-stat-ratio swiss-stat-group-start/g)).toHaveLength(1);
    expect(html).toContain('class="swiss-buchholz-cell">12,5</td>');
    expect(html).toContain('<span class="swiss-difference-sign">+</span><span class="swiss-difference-digits">16</span>');
    expect(html.indexOf('class="swiss-difference-digits">16')).toBeGreaterThan(html.indexOf('>110</span><span>:</span><span>94</span>'));
  });

  it('reserviert dieselbe Vorzeichenposition bei negativen und neutralen Differenzen', () => {
    const html = renderToStaticMarkup(createElement(SwissStandingsTable, {
      ...common,
      standings: [{ ...row, setDifference: -4, ballDifference: 0 }],
      scoreSport: false,
      scoreUnit: 'Bälle',
    }));
    expect(html).toContain('<span class="swiss-difference-sign">-</span><span class="swiss-difference-digits">4</span>');
    expect(html).toContain('<span class="swiss-difference-sign"></span><span class="swiss-difference-digits">0</span>');
  });

  it('zeigt im Modal die Formel, ein Rechenbeispiel und die zur Phase passende Freilos-Obergrenze', () => {
    const html = renderToStaticMarkup(createElement(SwissBuchholzHelpModal, { rounds: 5, onClose: () => {} }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Was ist die Sonneborn-Berger-Wertung (SB)?');
    expect(html).toContain('Sieg gegen einen Spieler mit 4 Punkten');
    expect(html).toContain('SB 5,5</strong>');
    expect(html).toContain('5 Runden');
    expect(html).toContain('2,5</strong> SB pro Freilos');
    expect(html).toContain('Kampfloser Sieg');
    expect(html).toContain('Schließen');
  });
});
