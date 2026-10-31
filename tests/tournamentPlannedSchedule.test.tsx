import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isValidLocalDateTime, parseLocalDateTime, toLocalDateTime, suggestPlannedSchedule, validatePlannedSchedule, type PlannedScheduleItem } from '@/domain/tournamentSchedule';
import { TournamentPlannedSchedule } from '@/components/TournamentPlannedSchedule';
import { createMockTournament, getMockTournament } from '@/services/mockTournamentStore';

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('window', Object.assign(new EventTarget(), {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, String(value)); },
      removeItem: (key: string) => { storage.delete(key); },
    },
  }));
  vi.stubGlobal('CustomEvent', class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) { super(type); this.detail = init?.detail as T; }
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('optionaler vorläufiger Zeitplan', () => {
  const start = '2026-10-31T09:00';
  const example: PlannedScheduleItem[] = [
    { id: 'p1', at: '2026-10-31T09:00', title: 'Gruppenphase', type: 'competition' },
    { id: 'lunch', at: '2026-10-31T12:00', title: 'Mittagspause', type: 'break', note: 'Verpflegung im Foyer' },
    { id: 'final', at: '2026-10-31T16:30', title: 'Siegerehrung', type: 'other' },
  ];
  it('validiert Datum und Uhrzeit einschließlich Kalenderfehlern', () => {
    expect(isValidLocalDateTime(start)).toBe(true);
    expect(isValidLocalDateTime('2028-02-29T09:00')).toBe(true);
    expect(isValidLocalDateTime('2027-02-29T09:00')).toBe(false);
    expect(isValidLocalDateTime('2026-11-31T09:00')).toBe(false);
    expect(isValidLocalDateTime('2026-10-31T25:00')).toBe(false);
    expect(isValidLocalDateTime('2026-10-31T09:60')).toBe(false);
    expect(isValidLocalDateTime('2026-10-31')).toBe(false);
    expect(isValidLocalDateTime('')).toBe(false);
    expect(toLocalDateTime(parseLocalDateTime(start)!)).toBe(start);
  });

  it('erzeugt nach den Phasendauern einen editierbaren Ablauf mit Dauer- und Uhrzeitpause', () => {
    const suggestion = suggestPlannedSchedule(start, [
      { label: 'Gruppenphase', type: 'GROUPS', estimatedMinutes: 120 },
      { label: 'Mittagspause', type: 'BREAK', estimatedMinutes: 30, breakKind: 'minutes', breakMinutes: 30 },
      { label: 'Schweizer Phase', type: 'SWISS', estimatedMinutes: 45 },
      { label: 'Pause bis', type: 'BREAK', estimatedMinutes: 0, breakKind: 'until', breakUntil: '15:30' },
      { label: 'Finale', type: 'KNOCKOUT', estimatedMinutes: 60 },
    ]);
    expect(suggestion.map((item) => [item.at, item.title, item.type])).toEqual([
      ['2026-10-31T09:00', 'Gruppenphase', 'competition'],
      ['2026-10-31T11:00', 'Mittagspause', 'break'],
      ['2026-10-31T11:30', 'Schweizer Phase', 'competition'],
      ['2026-10-31T12:15', 'Pause bis', 'break'],
      ['2026-10-31T15:30', 'Finale', 'competition'],
    ]);
    expect(validatePlannedSchedule(suggestion)).toEqual([]);
    const edited = suggestion.map((row) => row.title === 'Finale' ? { ...row, at: '2026-10-31T16:00' } : row);
    expect(edited[4].at).toBe('2026-10-31T16:00');
    expect(suggestion[4].at).toBe('2026-10-31T15:30');
  });

  it('setzt nach Spieltagsende den nächsten Tag und springt bei verstrichener Pause-bis-Uhrzeit ebenfalls weiter', () => {
    const dates = suggestPlannedSchedule('2026-10-31T17:00', [
      { label: 'Phase', type: 'ROUND_ROBIN', estimatedMinutes: 60 },
      { label: 'Nacht', type: 'BREAK', estimatedMinutes: 0, breakKind: 'overnight', nextDayStart: '09:00' },
      { label: 'Phase 2', type: 'GROUPS', estimatedMinutes: 70 },
      { label: 'Pause bis', type: 'BREAK', estimatedMinutes: 0, breakKind: 'until', breakUntil: '08:00' },
      { label: 'Finale', type: 'KNOCKOUT', estimatedMinutes: 30 },
    ]);
    expect(dates.map((item) => item.at)).toEqual([
      '2026-10-31T17:00', '2026-10-31T18:00', '2026-11-01T09:00', '2026-11-01T10:10', '2026-11-02T08:00',
    ]);
  });

  it('lässt leere Pläne zu, prüft aber unvollständige Einträge und Duplikate', () => {
    expect(validatePlannedSchedule([])).toEqual([]);
    expect(validatePlannedSchedule([{ ...example[0], at: '2026-10-99T09:00' }])).toContain('Zeitplan-Eintrag 1: Gültiges Datum und Uhrzeit erforderlich.');
    expect(validatePlannedSchedule([{ ...example[0], title: '  ' }]).some((msg) => msg.includes('Bezeichnung'))).toBe(true);
    expect(validatePlannedSchedule([example[0], { ...example[1], id: example[0].id }]).some((msg) => msg.includes('doppelt'))).toBe(true);
  });

  it('speichert Turnierbeginn und unverbindlichen Ablauf dauerhaft, ohne Live-Phasen zu verändern', () => {
    const input = { name: 'Zeitplan-Cup', sport: 'table_tennis', discipline: 'SINGLES' as const, tables: 2,
      minimumMatches: 1, participantNames: ['Anna', 'Bernd'],
      phases: [{ type: 'ROUND_ROBIN' as const, label: 'Jeder gegen Jeden', entrantCount: 2, groupCount: 1,
        swissRounds: 1, bestOf: 1, knockoutBestOf: [] }], estimatedDurationMinutes: 45,
      scheduledStart: start, plannedSchedule: example };
    const tournament = createMockTournament(input);
    expect(tournament.scheduledStart).toBe(start);
    expect(tournament.plannedSchedule).toEqual(example);
    example[0].title = 'Später geändert';
    expect(getMockTournament(tournament.id).plannedSchedule?.[0].title).toBe('Gruppenphase');
    expect(getMockTournament(tournament.id).hasStarted).toBe(false);
    const without = createMockTournament({ ...input, name: 'Ohne Zeitplan', plannedSchedule: [] });
    expect(getMockTournament(without.id).plannedSchedule).toEqual([]);
    expect(() => createMockTournament({ ...input, scheduledStart: '2026-02-30T09:00' })).toThrow('Ungültiges Turnierdatum');
  });

  it('zeigt öffentliche Informationen chronologisch und als unverbindlich markiert', () => {
    const markup = renderToStaticMarkup(createElement(TournamentPlannedSchedule, {
      scheduledStart: start, items: [example[2], example[0], example[1]],
    }));
    expect(markup).toContain('Geplanter Turnierbeginn');
    expect(markup).toContain('unverbindlich');
    expect(markup.indexOf('Gruppenphase')).toBeLessThan(markup.indexOf('Mittagspause'));
    expect(markup.indexOf('Mittagspause')).toBeLessThan(markup.indexOf('Siegerehrung'));
    expect(markup).toContain('Verpflegung im Foyer');
    expect(renderToStaticMarkup(createElement(TournamentPlannedSchedule, {}))).toBe('');
  });
});
