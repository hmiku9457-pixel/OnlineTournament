import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SetBySetEntry } from '@/components/SetBySetEntry';
import type { MockRuntimeMatch } from '@/services/mockRuntime';

const match = {
  id: 'sample-match',
  sport: 'table_tennis',
  status: 'LIVE',
  bestOf: 3,
  sideA: 'Anna',
  sideB: 'Ben',
  sets: [],
} as MockRuntimeMatch;

describe('Hilfe zur Satzeingabe in der Tischübersicht', () => {
  it('zeigt den Hilfeknopf rechts neben Satz bestätigen ohne permanente Kurzformzeile', () => {
    const html = renderToStaticMarkup(createElement(SetBySetEntry, { match, compact: true }));
    const confirmIndex = html.indexOf('Satz 1 bestätigen');
    const helpIndex = html.indexOf('aria-label="Hilfe zur Satzeingabe"');
    expect(confirmIndex).toBeGreaterThan(0);
    expect(helpIndex).toBeGreaterThan(confirmIndex);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Kurzform (linker Spieler)');
    expect(html).not.toContain('set-entry-quick-hint');
  });

  it('ändert die normale Ergebniseingabe außerhalb der Tischübersicht nicht', () => {
    const html = renderToStaticMarkup(createElement(SetBySetEntry, { match }));
    expect(html).toContain('Satz 1 bestätigen');
    expect(html).not.toContain('aria-label="Hilfe zur Satzeingabe"');
  });
});
