import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DrawActionButton } from '@/components/DrawActionButton';

describe('Visuelle Rückmeldung bei Auslosungsbuttons', () => {
  it.each(['Neue Zufallsverteilung', 'Tabellen nach Seeding erstellen', 'Brackets nach Seeding zuteilen'])(
    'rendert %s mit Platzhalter für eine Rückmeldung ohne Layoutverschiebung', (label) => {
      const html = renderToStaticMarkup(createElement(DrawActionButton, {
        label,
        onAction: () => true,
        onChanged: () => {},
      }));
      expect(html).toContain(label);
      expect(html).toContain('draw-action-feedback');
      expect(html).toContain('draw-action-original');
      expect(html).not.toContain('is-saved');
      expect(html).not.toContain('Gespeichert ✓');
      expect(html).toContain('type="button"');
    },
  );
});
