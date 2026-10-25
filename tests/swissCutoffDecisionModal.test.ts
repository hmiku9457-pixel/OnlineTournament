import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SwissCutoffDecisionModal } from '@/components/SwissCutoffDecisionModal';
import type { SwissCutoffStatus } from '@/services/mockRuntime';

const status: SwissCutoffStatus = {
  stageId: 'swiss-1',
  tie: { players: ['Spieler 12', 'Spieler 13'], slots: 1, firstRank: 12 },
  signature: 'test',
  decision: null,
};

describe('Modal für Schweizer Qualifikationsgleichstand', () => {
  it('blockiert die Phase sichtbar und bietet Entscheidungssatz oder physischen Losentscheid an', () => {
    const html = renderToStaticMarkup(createElement(SwissCutoffDecisionModal, {
      status, sport: 'table_tennis', onSet: () => null, onLot: () => null, onReset: () => {},
    }));
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Gleichstand an der Qualifikationsgrenze');
    expect(html).toContain('Spieler 12');
    expect(html).toContain('Spieler 13');
    expect(html).toContain('Entscheidungssatz spielen');
    expect(html).toContain('Physischer Losentscheid');
    expect(html).toContain('alphabetische Reihenfolge entscheidet nicht');
  });
});
