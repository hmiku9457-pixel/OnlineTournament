import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HALL_ZOOM_MAX, HALL_ZOOM_MIN, HALL_ZOOM_STEP, HALL_ZOOM_PREFERENCE_KEY, clampHallZoom, readHallZoomPreference, saveHallZoomPreference, TournamentHallView } from '@/components/TournamentHallView';
import type { VenueLayout } from '@/domain/venueLayout';

const layout: VenueLayout = {
  columns: 2,
  rows: 2,
  cells: ['table:1', 'space', 'table:2', 'desk'],
  deskDock: 'none',
};

afterEach(() => vi.unstubAllGlobals());

describe('Zoom der Planansicht', () => {
  it('speichert die Zoomstufe unabhängig vom Turnier im Browserprofil und stellt sie bei erneutem Öffnen wieder her', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
      },
    });
    expect(readHallZoomPreference()).toBe(100);
    saveHallZoomPreference(130);
    expect(store.get(HALL_ZOOM_PREFERENCE_KEY)).toBe('130');
    expect(readHallZoomPreference()).toBe(130);

    const markup = renderToStaticMarkup(<TournamentHallView
      layout={layout}
      matchesByTable={new Map()}
      blockedTables={new Set()}
      selectedTable={null}
      canAssign
      sport="table_tennis"
      onSelectTable={() => {}}
      onAssignToTable={() => true}
    />);
    expect(markup).toContain('--hall-zoom:1.3');

    saveHallZoomPreference(100);
    expect(readHallZoomPreference()).toBe(100);
  });

  it('verwendet bei defekten Einstellungen wieder den Standardzoom', () => {
    let stored = '';
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => stored,
        setItem: (_key: string, value: string) => { stored = value; },
      },
    });
    expect(readHallZoomPreference()).toBe(100);
    stored = 'unbekannt';
    expect(readHallZoomPreference()).toBe(100);
    saveHallZoomPreference(400);
    expect(readHallZoomPreference()).toBe(150);
  });

  it('bleibt verwendbar, wenn der Browser den Zugriff auf lokale Einstellungen blockiert', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => { throw new Error('blocked'); },
        setItem: () => { throw new Error('blocked'); },
      },
    });
    expect(readHallZoomPreference()).toBe(100);
    expect(() => saveHallZoomPreference(120)).not.toThrow();
  });


  it('begrenzt die Zoomstufen auf 70–150 Prozent in 10-Prozent-Schritten', () => {
    expect([HALL_ZOOM_MIN, HALL_ZOOM_MAX, HALL_ZOOM_STEP]).toEqual([70, 150, 10]);
    expect(clampHallZoom(30)).toBe(70);
    expect(clampHallZoom(75)).toBe(80);
    expect(clampHallZoom(100)).toBe(100);
    expect(clampHallZoom(147)).toBe(150);
    expect(clampHallZoom(400)).toBe(150);
  });

  it('zeichnet echte Planfelder sowie Zoomsteuerung bei Standardgröße', () => {
    const markup = renderToStaticMarkup(<TournamentHallView
      layout={layout}
      matchesByTable={new Map()}
      blockedTables={new Set()}
      selectedTable={null}
      canAssign
      sport="table_tennis"
      onSelectTable={() => {}}
      onAssignToTable={() => true}
    />);
    expect(markup).toContain('aria-label="Zoom der Planansicht"');
    expect(markup).toContain('aria-label="Plan vergrößern"');
    expect(markup).toContain('aria-label="Plan verkleinern"');
    expect(markup).toContain('100 %');
    expect(markup).toContain('--hall-zoom:1');
    expect(markup).toContain('repeat(2, var(--hall-tile-width))');
    expect(markup).toContain('aria-label="Tisch 1, frei. Details öffnen"');
    expect(markup).toContain('aria-label="Tisch 2, frei. Details öffnen"');
  });
});
