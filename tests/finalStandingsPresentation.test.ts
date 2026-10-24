import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FinalStandingsList } from '@/components/FinalStandingsList';

const phaseNames = ['Schweizer System', 'K.-o.-Phase'];

const standings = [
  { name: 'Test Spieler 16', placement: 'Platz 1', status: 'Turniersieger' as const, stageIndex: 1, placementNumber: 1 },
  { name: 'Test Spieler 01', placement: 'Platz 2', status: 'Ausgeschieden' as const, stageIndex: 1, placementNumber: 2 },
  { name: 'Test Spieler 12', placement: 'Platz 3', status: 'Ausgeschieden' as const, stageIndex: 1, placementNumber: 3 },
  { name: 'Test Spieler 18', placement: 'Platz 3', status: 'Ausgeschieden' as const, stageIndex: 1, placementNumber: 3 },
  { name: 'Test Spieler 05', placement: 'Platz 5–8', status: 'Ausgeschieden' as const, stageIndex: 1, placementNumber: 5 },
  { name: 'Test Spieler 07', placement: 'Platz 5–8', status: 'Ausgeschieden' as const, stageIndex: 1, placementNumber: 5 },
  { name: 'Test Spieler 09', placement: 'Platz 5–8', status: 'Ausgeschieden' as const, stageIndex: 1, placementNumber: 5 },
  { name: 'Test Spieler 17', placement: 'Platz 5–8', status: 'Ausgeschieden' as const, stageIndex: 1, placementNumber: 5 },
  { name: 'Test Spieler 03', placement: 'Platz 9', status: 'Ausgeschieden' as const, stageIndex: 0, placementNumber: 9 },
  { name: 'Test Spieler 10', placement: 'Platz 11', status: 'Zurückgezogen' as const, stageIndex: 0, placementNumber: 11 },
];

describe('Endplatzierungen: verdichtete Ergebnisübersicht', () => {
  it('zeigt alle drei Podestplätze in flachen Karten und bündelt den geteilten dritten Platz', () => {
    const html = renderToStaticMarkup(createElement(FinalStandingsList, { standings, phaseNames }));
    const podium = html.split('class="final-ranking"')[0];
    expect(podium).toContain('Siegerpodest');
    expect(podium).toContain('🏆');
    expect(podium).toContain('🥈');
    expect(podium).toContain('🥉');
    expect((podium.match(/final-podium-card/g) ?? [])).toHaveLength(3);
    expect((podium.match(/Platz 3/g) ?? [])).toHaveLength(1);
    expect(podium).toContain('Test Spieler 12');
    expect(podium).toContain('Test Spieler 18');
    expect(podium).toContain('· geteilt');
    expect(podium).toContain('final-standing-tag is-winner');
  });

  it('fasst gemeinsame Platzierungen zusammen und zeigt Phasen nur in Abschnittsüberschriften', () => {
    const html = renderToStaticMarkup(createElement(FinalStandingsList, { standings, phaseNames }));
    expect((html.match(/Platz 5–8/g) ?? [])).toHaveLength(1);
    expect(html).toContain('final-ranking-card is-shared is-wide');
    expect(html).toContain('4 Teilnehmer');
    expect(html).toContain('<h4>K.-o.-Phase</h4>');
    expect(html).toContain('<h4>Schweizer System</h4>');
    expect((html.match(/<h4>/g) ?? [])).toHaveLength(2);
    expect(html).toContain('final-standing-tag is-withdrawn');
    expect(html).not.toContain('final-standing-tag is-eliminated');
    expect((html.match(/<strong>/g) ?? [])).toHaveLength(standings.length);
    for (const row of standings) expect(html).toContain(row.name);
  });

  it('zeigt bei Gruppenrangbereichen nur den Gesamtplatz im Badge und die Gruppe beim Namen', () => {
    const html = renderToStaticMarkup(createElement(FinalStandingsList, {
      standings: [
        { name: 'Spieler A', placement: 'Platz 14–16 · 4. Platz Gruppe A', placementNumber: 14, stageIndex: 0, status: 'Ausgeschieden' },
        { name: 'Spieler B', placement: 'Platz 14–16 · 4. Platz Gruppe B', placementNumber: 14, stageIndex: 0, status: 'Ausgeschieden' },
        { name: 'Spieler C', placement: 'Platz 14–16 · 4. Platz Gruppe C', placementNumber: 14, stageIndex: 0, status: 'Zurückgezogen' },
      ],
      phaseNames,
    }));
    expect((html.match(/final-ranking-badge/g) ?? [])).toHaveLength(1);
    expect((html.match(/Platz 14–16/g) ?? [])).toHaveLength(1);
    expect(html).toContain('4. Platz Gruppe C');
    expect(html).toContain('final-standing-origin');
    expect(html).toContain('Spieler A');
    expect(html).toContain('Spieler B');
    expect(html).toContain('Spieler C');
  });

  it('zeigt auch einzelne Phasen ohne Podest und teilt gleiche Ränge nicht auf', () => {
    const html = renderToStaticMarkup(createElement(FinalStandingsList, {
      standings: [
        { name: 'A', placement: 'Platz 1–3', status: 'Beendet', stageIndex: 0, placementNumber: 1 },
        { name: 'B', placement: 'Platz 1–3', status: 'Beendet', stageIndex: 0, placementNumber: 1 },
        { name: 'C', placement: 'Platz 1–3', status: 'Beendet', stageIndex: 0, placementNumber: 1 },
      ],
      phaseNames,
    }));
    expect(html).not.toContain('Siegerpodest');
    expect(html).toContain('<h4>Schweizer System</h4>');
    expect((html.match(/Platz 1–3/g) ?? [])).toHaveLength(1);
    expect((html.match(/<strong>/g) ?? [])).toHaveLength(3);
  });
});
