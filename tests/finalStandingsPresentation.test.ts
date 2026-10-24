import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FinalStandingsList } from '@/components/FinalStandingsList';

const phaseNames = ['Schweizer System', 'K.-o.-Phase'];

describe('Endplatzierungen: kompakte Darstellung', () => {
  it('zeigt Platzierung, Teilnehmer und letzte Phase in einer gemeinsamen Gruppe', () => {
    const html = renderToStaticMarkup(createElement(FinalStandingsList, {
      standings: [{ name: 'Test Spieler 16', placement: 'Platz 1', status: 'Turniersieger', stageIndex: 1, placementNumber: 1 }],
      phaseNames,
    }));
    expect(html).toContain('final-standing-identity');
    expect(html).toContain('Platz 1');
    expect(html).toContain('<strong>Test Spieler 16</strong>');
    expect(html).toContain('<small>K.-o.-Phase</small>');
    expect(html).toContain('final-standing-status is-winner');
  });

  it('kennzeichnet ausgeschiedene und zurückgezogene Spieler unterschiedlich, ohne den Platzierungsbereich aufzulösen', () => {
    const html = renderToStaticMarkup(createElement(FinalStandingsList, {
      standings: [
        { name: 'Test Spieler 03', placement: 'Platz 9', status: 'Ausgeschieden', stageIndex: 0, placementNumber: 9 },
        { name: 'Test Spieler 10', placement: 'Platz 11', status: 'Zurückgezogen', stageIndex: 0, placementNumber: 11 },
        { name: 'Test Spieler 12', placement: 'Platz 3', status: 'Ausgeschieden', stageIndex: 1, placementNumber: 3 },
        { name: 'Test Spieler 18', placement: 'Platz 3', status: 'Ausgeschieden', stageIndex: 1, placementNumber: 3 },
      ],
      phaseNames,
    }));
    expect(html).toContain('final-standing-status is-eliminated');
    expect(html).toContain('final-standing-status is-withdrawn');
    expect(html.match(/final-standing-rank is-third/g)).toHaveLength(2);
    expect(html.match(/role="listitem"/g)).toHaveLength(4);
  });
});
