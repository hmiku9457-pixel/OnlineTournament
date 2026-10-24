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

describe('Endplatzierungen: Siegerpodest und kompakte Rangliste', () => {
  it('zeigt die ersten drei Plätze im Podest und bündelt einen geteilten dritten Platz', () => {
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
    expect(podium).toContain('K.-o.-Phase');
  });

  it('zeigt einen geteilten Platzierungsbereich nur einmal und alle vier Spieler', () => {
    const html = renderToStaticMarkup(createElement(FinalStandingsList, { standings, phaseNames }));
    expect((html.match(/Platz 5–8/g) ?? [])).toHaveLength(1);
    expect(html).toContain('4 Teilnehmer');
    for (const name of ['Test Spieler 05', 'Test Spieler 07', 'Test Spieler 09', 'Test Spieler 17']) {
      expect(html).toContain(name);
    }
    expect(html).toContain('final-ranking-grid');
    expect(html).not.toContain('final-standing-tag is-eliminated');
    expect(html).toContain('final-standing-tag is-withdrawn');
    expect(html).toContain('Schweizer System');
    expect((html.match(/<strong>/g) ?? [])).toHaveLength(standings.length);
  });

  it('bleibt bei einer einzelnen Schweizer Phase ohne K.-o.-Podest vollständig sichtbar', () => {
    const html = renderToStaticMarkup(createElement(FinalStandingsList, {
      standings: [
        { name: 'A', placement: 'Platz 1–3', status: 'Beendet', stageIndex: 0, placementNumber: 1 },
        { name: 'B', placement: 'Platz 1–3', status: 'Beendet', stageIndex: 0, placementNumber: 1 },
        { name: 'C', placement: 'Platz 1–3', status: 'Beendet', stageIndex: 0, placementNumber: 1 },
      ],
      phaseNames,
    }));
    expect(html).not.toContain('Siegerpodest');
    expect(html).toContain('3 Teilnehmer');
    expect((html.match(/<strong>/g) ?? [])).toHaveLength(3);
  });
});
