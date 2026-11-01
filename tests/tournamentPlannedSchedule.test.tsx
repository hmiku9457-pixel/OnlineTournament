import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isValidLocalDateTime, parseLocalDateTime, toLocalDateTime, suggestPlannedSchedule, buildPlannedTimeline, plannedTimelineDurationMinutes, plannedActiveBreakMinutes, formatPlannedBreakDuration, groupPlannedScheduleDays, validatePlannedSchedule, type PlannedScheduleItem } from '@/domain/tournamentSchedule';
import { TournamentPlannedSchedule } from '@/components/TournamentPlannedSchedule';
import { estimatePhaseMetrics } from '@/domain/tournamentCreation';
import { PlannedScheduleEditor } from '@/components/PlannedScheduleEditor';
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

  it('trennt bei einer Uhrzeitpause die reine Spielzeit von der geplanten Gesamtdauer', () => {
    const tables = 9;
    const timing = { minutesPerSet: 5 };
    const group = estimatePhaseMetrics({ type: 'GROUPS', entrantCount: 19, groupCount: 3, bestOf: 1 }, tables, timing);
    const swiss = estimatePhaseMetrics({ type: 'SWISS', entrantCount: 9, swissRounds: 4, bestOf: 3 }, tables, timing);
    const knockout = estimatePhaseMetrics({ type: 'KNOCKOUT', entrantCount: 8, bestOf: 5 }, tables, timing);
    expect([group.estimatedDurationMinutes, swiss.estimatedDurationMinutes, knockout.estimatedDurationMinutes]).toEqual([30, 50, 60]);

    const timeline = buildPlannedTimeline('2026-11-01T10:00', [
      { type: 'GROUPS', label: 'Gruppenphase', estimatedMinutes: group.estimatedDurationMinutes },
      { type: 'BREAK', label: 'Pause', estimatedMinutes: 0, breakKind: 'until', breakUntil: '12:00' },
      { type: 'SWISS', label: 'Schweizer System', estimatedMinutes: swiss.estimatedDurationMinutes, roundCount: 4 },
      { type: 'KNOCKOUT', label: 'K.-o.-Phase', estimatedMinutes: knockout.estimatedDurationMinutes, roundCount: 3 },
    ]);

    expect(timeline.items.filter((item) => item.id.startsWith('phase-')).map((item) => item.at)).toEqual([
      '2026-11-01T10:00', '2026-11-01T10:30', '2026-11-01T12:00', '2026-11-01T12:50',
    ]);
    expect(timeline.estimatedEnd).toBe('2026-11-01T13:50');
    expect(timeline.warnings).toEqual([]);
    const playingMinutes = group.estimatedDurationMinutes + swiss.estimatedDurationMinutes + knockout.estimatedDurationMinutes;
    const totalMinutes = plannedTimelineDurationMinutes('2026-11-01T10:00', timeline.estimatedEnd);
    expect(playingMinutes).toBe(140);
    expect(totalMinutes).toBe(230);
    expect(totalMinutes! - playingMinutes).toBe(90);
  });

  it('zählt Spieltagswechsel nicht zur Spielzeit, Pausenzeit oder Gesamtdauer', () => {
    const start = '2026-11-01T10:00';
    const timeline = buildPlannedTimeline(start, [
      { type: 'GROUPS', label: 'Gruppenphase', estimatedMinutes: 60 },
      { type: 'BREAK', label: 'Mittagspause', estimatedMinutes: 0, breakKind: 'minutes', breakMinutes: 15 },
      { type: 'SWISS', label: 'Schweizer System', estimatedMinutes: 80,
        roundCount: 4, inlineBreakAfterRound: 2, inlineBreakKind: 'minutes', inlineBreakMinutes: 20 },
      { type: 'BREAK', label: 'Spieltagswechsel', estimatedMinutes: 0, breakKind: 'overnight',
        nextDayDate: '2026-11-03', nextDayStart: '09:00' },
      { type: 'KNOCKOUT', label: 'Finale', estimatedMinutes: 45 },
    ]);
    expect(timeline.warnings).toEqual([]);
    expect(timeline.estimatedEnd).toBe('2026-11-03T09:45');
    expect(timeline.items.find((item) => item.id === 'phase-4')?.durationMinutes).toBeGreaterThan(24 * 60);
    expect(timeline.items.find((item) => item.id === 'inline-break-3')?.durationMinutes).toBe(20);

    const playingMinutes = 60 + 80 + 45;
    const activeBreakMinutes = plannedActiveBreakMinutes(timeline);
    expect(playingMinutes).toBe(185);
    expect(activeBreakMinutes).toBe(35);
    expect(playingMinutes + activeBreakMinutes).toBe(220);
    expect(plannedTimelineDurationMinutes(start, timeline.estimatedEnd)).toBeGreaterThan(220);
  });

  it('zählt zeitgebundene Pausen am Spieltag vollständig, aber keine Nachtunterbrechung', () => {
    const timeline = buildPlannedTimeline('2026-11-01T10:00', [
      { type: 'GROUPS', label: 'Gruppenphase', estimatedMinutes: 30 },
      { type: 'BREAK', label: 'Mittag', estimatedMinutes: 0, breakKind: 'until', breakUntil: '12:00' },
      { type: 'BREAK', label: 'Spieltagsende', estimatedMinutes: 0, breakKind: 'overnight',
        nextDayDate: '2026-11-05', nextDayStart: '09:00' },
      { type: 'KNOCKOUT', label: 'Finale', estimatedMinutes: 60 },
    ]);
    expect(timeline.warnings).toEqual([]);
    expect(plannedActiveBreakMinutes(timeline)).toBe(90);
    expect(30 + plannedActiveBreakMinutes(timeline) + 60).toBe(180);
    expect(timeline.estimatedEnd).toBe('2026-11-05T10:00');
  });

  it('setzt Spieltagsende auf frei gewähltes späteres Datum statt automatisch auf morgen', () => {
    const timeline = buildPlannedTimeline('2026-11-01T10:00', [
      { label: 'Gruppenphase', type: 'GROUPS', estimatedMinutes: 30 },
      { label: 'Spieltagsende', type: 'BREAK', estimatedMinutes: 0, breakKind: 'overnight',
        nextDayDate: '2026-11-04', nextDayStart: '09:30' },
      { label: 'Finale', type: 'KNOCKOUT', estimatedMinutes: 60 },
    ]);
    expect(timeline.items.map((item) => item.at)).toEqual([
      '2026-11-01T10:00', '2026-11-01T10:30', '2026-11-04T09:30',
    ]);
    expect(timeline.items[1]).toMatchObject({ durationMinutes: 4260, durationApproximate: true });
    expect(timeline.estimatedEnd).toBe('2026-11-04T10:30');
    expect(timeline.warnings).toEqual([]);
  });

  it('warnt vor einem Fortsetzungsdatum am oder vor dem vorherigen Spieltag', () => {
    const before = [{ label: 'Phase 1', type: 'GROUPS', estimatedMinutes: 60 },
      { label: 'Spieltagsende', type: 'BREAK', estimatedMinutes: 0, breakKind: 'overnight' as const,
        nextDayDate: '2026-11-01', nextDayStart: '09:00' }];
    const invalid = buildPlannedTimeline('2026-11-01T10:00', before);
    expect(invalid.warnings).toHaveLength(1);
    expect(invalid.warnings[0].message).toContain('Fortsetzungsdatum');
    expect(invalid.estimatedEnd).toBe('2026-11-02T09:00');
    const legacy = buildPlannedTimeline('2026-11-01T10:00',
      before.map((phase) => ({ ...phase, nextDayDate: '' })));
    expect(legacy.warnings).toEqual([]);
    expect(legacy.estimatedEnd).toBe('2026-11-02T09:00');
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
    expect(suggestion[1]).toMatchObject({ durationMinutes: 30, durationApproximate: false });
    expect(formatPlannedBreakDuration(suggestion[1])).toBe('30 Min.');
    expect(suggestion[3]).toMatchObject({ durationMinutes: 195, durationApproximate: true });
    expect(formatPlannedBreakDuration(suggestion[3])).toBe('ca. 3 Std. 15 Min.');
    const edited = suggestion.map((row) => row.title === 'Finale' ? { ...row, at: '2026-10-31T16:00' } : row);
    expect(edited[4].at).toBe('2026-10-31T16:00');
    expect(suggestion[4].at).toBe('2026-10-31T15:30');
  });

  it('setzt nach Spieltagsende den nächsten Tag, warnt aber vor unplausiblen Pause-bis-Uhrzeiten', () => {
    const dates = suggestPlannedSchedule('2026-10-31T17:00', [
      { label: 'Phase', type: 'ROUND_ROBIN', estimatedMinutes: 60 },
      { label: 'Nacht', type: 'BREAK', estimatedMinutes: 0, breakKind: 'overnight', nextDayStart: '09:00' },
      { label: 'Phase 2', type: 'GROUPS', estimatedMinutes: 70 },
      { label: 'Pause bis', type: 'BREAK', estimatedMinutes: 0, breakKind: 'until', breakUntil: '08:00' },
      { label: 'Finale', type: 'KNOCKOUT', estimatedMinutes: 30 },
    ]);
    expect(dates.map((item) => item.at)).toEqual([
      '2026-10-31T17:00', '2026-10-31T18:00', '2026-11-01T09:00', '2026-11-01T10:10', '2026-11-01T10:10',
    ]);
    expect(dates[1]).toMatchObject({ durationMinutes: 900, durationApproximate: true });
    expect(formatPlannedBreakDuration(dates[1])).toBe('ca. 15 Std.');
    expect(formatPlannedBreakDuration(dates[3])).toBe('Dauer noch offen');
  });

  it('bildet den konkreten Turnierplan automatisch ab und erkennt Pause bis vor dem theoretischen Ende', () => {
    const phases = [
      { label: 'Schweizer System', type: 'SWISS', estimatedMinutes: 150 },
      { label: 'Pause', type: 'BREAK', estimatedMinutes: 0, breakKind: 'until' as const, breakUntil: '12:00' },
      { label: 'K.-o.-Phase', type: 'KNOCKOUT', estimatedMinutes: 120 },
    ];
    const invalid = buildPlannedTimeline('2026-11-01T10:00', phases);
    expect(invalid.items.map((row) => [row.title, row.at])).toEqual([
      ['Schweizer System', '2026-11-01T10:00'],
      ['Pause', '2026-11-01T12:30'],
      ['K.-o.-Phase', '2026-11-01T12:30'],
    ]);
    expect(invalid.warnings).toHaveLength(1);
    expect(invalid.warnings[0].phaseIndex).toBe(1);
    expect(invalid.warnings[0].message).toContain('12:00 Uhr liegt vor dem voraussichtlichen Pausenbeginn um 12:30 Uhr');

    const corrected = buildPlannedTimeline('2026-11-01T10:00', [
      phases[0], { ...phases[1], breakUntil: '13:30' }, phases[2],
    ]);
    expect(corrected.warnings).toEqual([]);
    expect(corrected.items[1]).toMatchObject({ durationMinutes: 60, durationApproximate: true });
    expect(formatPlannedBreakDuration(corrected.items[1])).toBe('ca. 1 Std.');
    expect(corrected.items.map((row) => [row.title, row.at])).toEqual([
      ['Schweizer System', '2026-11-01T10:00'],
      ['Pause', '2026-11-01T12:30'],
      ['K.-o.-Phase', '2026-11-01T13:30'],
    ]);
    expect(corrected.estimatedEnd).toBe('2026-11-01T15:30');
    // The sidebar duration must match the entire time span, not only the
    // match workload (this includes the one-hour Pause-bis window).
    expect(plannedTimelineDurationMinutes('2026-11-01T10:00', corrected.estimatedEnd)).toBe(330);
    const withAwards = [...corrected.items, { id: 'award-ceremony', at: corrected.estimatedEnd, title: 'Siegerehrung', type: 'other' as const }];
    expect(withAwards.at(-1)).toMatchObject({ title: 'Siegerehrung', at: '2026-11-01T15:30' });
    expect(validatePlannedSchedule(withAwards)).toEqual([]);
  });

  it('beschriftet Phasen korrekt und bietet eine Siegerehrung am berechneten Ende an', () => {
    const timeline = buildPlannedTimeline('2026-11-01T10:00', [
      { label: 'Schweizer System', type: 'SWISS', estimatedMinutes: 150 },
      { label: 'Pause', type: 'BREAK', estimatedMinutes: 0, breakKind: 'until', breakUntil: '13:30' },
      { label: 'K.-o.-Phase', type: 'KNOCKOUT', estimatedMinutes: 120 },
    ]);
    const ui = renderToStaticMarkup(createElement(PlannedScheduleEditor, {
      scheduledStart: '2026-11-01T10:00', timeline,
      awardsEnabled: false, awardsAt: timeline.estimatedEnd,
      onToggleAwards: () => {}, onAwardsAtChange: () => {},
    }));
    expect(ui).toContain('Turnierbeginn');
    expect(ui).toContain('Schweizer System');
    expect(ui).toContain('K.-o.-Phase');
    expect(ui).toContain('Voraussichtliches Turnierende');
    expect(ui).toContain('Siegerehrung');
    expect(ui).toContain('+ Hinzufügen');
    expect(ui).toContain('class="planned-schedule-ceremony-toggle"');
    expect(ui).not.toContain('id="planned-ceremony-settings"');
    expect(ui).toContain('ca. 1 Std.');
    expect(ui).toContain('Pause · geschätzte Dauer');
    expect(ui).toContain('class="planned-schedule-duration"');
    expect(ui).not.toContain('Geplanter Pausenbeginn');
    expect(ui).not.toContain('Programmpunkt');
    const withAwards = renderToStaticMarkup(createElement(PlannedScheduleEditor, {
      scheduledStart: '2026-11-01T10:00', timeline,
      awardsEnabled: true, awardsAt: timeline.estimatedEnd,
      onToggleAwards: () => {}, onAwardsAtChange: () => {},
    }));
    expect(withAwards).toContain('01.11.2026');
    expect(withAwards).toContain('id="awards-ceremony-date"');
    expect(withAwards).toContain('id="awards-ceremony-time"');
    expect(withAwards).toContain('15:30');
    expect(withAwards).toContain('aria-haspopup="dialog"');
    expect(withAwards).toContain('Siegerehrung entfernen');
    expect(withAwards).toContain('class="planned-schedule-phase-row is-ceremony"');
    expect(withAwards).toContain('Siegerehrung <span');
    expect(withAwards).toContain('id="planned-ceremony-settings"');
    const list = withAwards.indexOf('class="planned-schedule-phase-row is-ceremony"');
    expect(list).toBeGreaterThan(withAwards.indexOf('Voraussichtliches Turnierende'));
    expect(list).toBeLessThan(withAwards.indexOf('class="planned-schedule-ceremony-details"'));
  });

  it('zeigt im Ablauf die Phasenstruktur rechts neben dem Phasennamen, auch über Pausen hinweg', () => {
    const timeline = buildPlannedTimeline('2026-11-01T10:00', [
      { type: 'GROUPS', label: 'Gruppenphase', estimatedMinutes: 30 },
      { type: 'BREAK', label: 'Pause', estimatedMinutes: 20, breakKind: 'minutes', breakMinutes: 20 },
      { type: 'SWISS', label: 'Schweizer System', estimatedMinutes: 50 },
      { type: 'KNOCKOUT', label: 'K.-o.-Phase', estimatedMinutes: 60 },
    ]);
    const markup = renderToStaticMarkup(createElement(PlannedScheduleEditor, {
      scheduledStart: '2026-11-01T10:00', timeline,
      phaseSummaries: ['3 Gruppen · 9 Qualifikationsplätze', '', '9 Spieler · 4 Runden · 4 Qualifikationsplätze', '4 Spieler · 2 Runden'],
      awardsEnabled: false, awardsAt: timeline.estimatedEnd,
      onToggleAwards: () => {}, onAwardsAtChange: () => {},
    }));
    expect(markup).toContain('3 Gruppen · 9 Qualifikationsplätze');
    expect(markup).toContain('9 Spieler · 4 Runden · 4 Qualifikationsplätze');
    expect(markup).toContain('4 Spieler · 2 Runden');
    expect((markup.match(/class="planned-schedule-phase-summary"/g) ?? [])).toHaveLength(3);
    expect(markup).toContain('Siegerehrung');
    expect(markup).toContain('aria-expanded="false"');
  });

  it('vereint Phasenplan und Zeitplan mit Live-, Abgeschlossen- und Ausstehend-Status', () => {
    const start = '2026-11-01T10:00';
    const items: PlannedScheduleItem[] = [
      { id: 'phase-1', at: start, title: 'Alte Gruppenphase', type: 'competition' },
      { id: 'phase-2', at: '2026-11-01T11:30', title: 'Mittagspause', type: 'break', breakKind: 'minutes', durationMinutes: 20 },
      { id: 'phase-3', at: '2026-11-01T11:50', title: 'Schweizer System', type: 'competition' },
      { id: 'awards-ceremony', at: '2026-11-01T15:00', title: 'Siegerehrung', type: 'other' },
    ];
    const stages = [
      { id: 'group-id', name: 'Gruppenphase', type: 'GROUPS', status: 'completed' as const, details: '3 Gruppen', advancement: '9 qualifizieren sich' },
      { id: 'break-id', name: 'Mittagspause', type: 'BREAK', status: 'live' as const, details: '20 Minuten Pause' },
      { id: 'swiss-id', name: 'Schweizer System', type: 'SWISS', status: 'pending' as const, details: '4 Runden' },
    ];
    const html = renderToStaticMarkup(createElement(TournamentPlannedSchedule, {
      scheduledStart: start, items, stages, onStage: () => {},
    }));
    expect((html.match(/class="planned-schedule-stage-button"/g) ?? [])).toHaveLength(3);
    expect(html).toContain('class="planned-schedule-live-dot"');
    expect(html).toContain('status-completed');
    expect(html).toContain('status-live');
    expect(html).toContain('status-pending');
    expect(html).toContain('Läuft gerade');
    expect(html).toContain('Abgeschlossen');
    expect(html).toContain('Ausstehend');
    expect(html).toContain('Gruppenphase, Abgeschlossen. Im Turnierverlauf öffnen');
    expect(html).toContain('3 Gruppen');
    expect(html).toContain('9 qualifizieren sich');
    expect(html).toContain('Siegerehrung');
    expect(html).not.toContain('Alte Gruppenphase');
  });

  it('zeigt und verlinkt sämtliche Phasen auch ohne veröffentlichten Zeitplan', () => {
    const html = renderToStaticMarkup(createElement(TournamentPlannedSchedule, {
      stages: [
        { id: 'phase-a', name: 'Vorrunde', type: 'GROUPS', status: 'pending' },
        { id: 'phase-b', name: 'Finale', type: 'KNOCKOUT', status: 'pending' },
      ], onStage: () => {},
    }));
    expect(html).toContain('Vorrunde');
    expect(html).toContain('Finale');
    expect(html).toContain('Zeit noch offen');
    expect((html.match(/class="planned-schedule-stage-button"/g) ?? [])).toHaveLength(2);
    expect(html).not.toContain('Für dieses Turnier wurde kein detaillierter Ablauf veröffentlicht.');
  });

  it('zeigt auch öffentlich das Spieltagsende statt einer 40-Stunden-Pause und übernimmt Hinweise', () => {
    const start = '2026-11-01T10:00';
    const timeline = buildPlannedTimeline(start, [
      { label: 'Vorrunde', type: 'GROUPS', estimatedMinutes: 120 },
      { label: 'Spieltagswechsel', type: 'BREAK', estimatedMinutes: 0,
        breakKind: 'overnight', nextDayDate: '2026-11-03', nextDayStart: '09:00',
        note: 'Treffpunkt am Haupteingang' },
      { label: 'Finalrunde', type: 'KNOCKOUT', estimatedMinutes: 60 },
    ]);
    const publicHtml = renderToStaticMarkup(createElement(TournamentPlannedSchedule, {
      scheduledStart: start, items: timeline.items,
    }));
    expect(publicHtml).toContain('Ende ca. 12:00 Uhr');
    expect(publicHtml).toContain('Treffpunkt am Haupteingang');
    expect(publicHtml).not.toContain('45 Std.');
  });

  it('zeigt beim Spieltagswechsel statt der mehrtägigen Pausendauer das Tagesende', () => {
    const start = '2026-11-01T10:00';
    const timeline = buildPlannedTimeline(start, [
      { label: 'Gruppenphase', type: 'GROUPS', estimatedMinutes: 35 },
      { label: 'Spieltagswechsel', type: 'BREAK', estimatedMinutes: 0,
        breakKind: 'overnight', nextDayDate: '2026-11-03', nextDayStart: '09:00' },
      { label: 'Finale', type: 'KNOCKOUT', estimatedMinutes: 60 },
    ]);
    expect(timeline.items[1].breakKind).toBe('overnight');
    expect(timeline.items[1].durationMinutes).toBeGreaterThan(24 * 60);
    const editor = renderToStaticMarkup(createElement(PlannedScheduleEditor, {
      scheduledStart: start, timeline, awardsEnabled: false, awardsAt: timeline.estimatedEnd,
      onToggleAwards: () => {}, onAwardsAtChange: () => {},
    }));
    expect(editor).toContain('Ende ca. 10:35 Uhr');
    expect(editor).toContain('Spieltagsende · Fortsetzung am geplanten Datum');
    expect(editor).not.toContain('ca. 46 Std.');
    expect(editor).toContain('Dienstag, 3. November 2026');
    expect(editor).toContain('class="planned-schedule-phase-row is-ceremony"');
    expect(editor).not.toContain('planned-schedule-ceremony-details');
  });

  it('zeigt in der Seitenkarte dieselbe Gesamtdauer wie im Zeitplan, inklusive Pause bis', () => {
    const swiss = estimatePhaseMetrics({ type: 'SWISS', entrantCount: 8, bestOf: 3, swissRounds: 4 }, 9, { minutesPerSet: 5 });
    const groups = estimatePhaseMetrics({ type: 'GROUPS', entrantCount: 8, groupCount: 2, bestOf: 1 }, 9, { minutesPerSet: 5 });
    expect(swiss.estimatedDurationMinutes).toBe(50);
    expect(groups.estimatedDurationMinutes).toBe(10);
    const time = buildPlannedTimeline('2026-11-01T10:00', [
      { label: 'Schweizer System', type: 'SWISS', estimatedMinutes: swiss.estimatedDurationMinutes },
      { label: 'Pause', type: 'BREAK', estimatedMinutes: 0, breakKind: 'until', breakUntil: '14:00' },
      { label: 'Gruppenphase', type: 'GROUPS', estimatedMinutes: groups.estimatedDurationMinutes },
    ]);
    expect(time.items[1].at).toBe('2026-11-01T10:50');
    expect(time.items[2].at).toBe('2026-11-01T14:00');
    expect(time.estimatedEnd).toBe('2026-11-01T14:10');
    expect(plannedTimelineDurationMinutes('2026-11-01T10:00', time.estimatedEnd)).toBe(250);
    expect(time.warnings).toEqual([]);
  });

  it('zeigt in der öffentlichen Vorschau bei Pausen Dauer statt Pausenstart-Uhrzeit', () => {
    const timeline = buildPlannedTimeline('2026-11-01T10:00', [
      { label: 'Vorrunde', type: 'SWISS', estimatedMinutes: 60 },
      { label: 'Mittagspause', type: 'BREAK', estimatedMinutes: 30, breakKind: 'minutes', breakMinutes: 30 },
      { label: 'Hauptrunde', type: 'KNOCKOUT', estimatedMinutes: 50 },
      { label: 'Pause bis', type: 'BREAK', estimatedMinutes: 0, breakKind: 'until', breakUntil: '13:30' },
      { label: 'Finale', type: 'KNOCKOUT', estimatedMinutes: 20 },
    ]);
    const html = renderToStaticMarkup(createElement(TournamentPlannedSchedule, {
      scheduledStart: '2026-11-01T10:00', items: timeline.items,
    }));
    expect(html).toContain('<span class="planned-schedule-duration">30 Min.</span>');
    expect(html).toContain('<span class="planned-schedule-duration">ca. 1 Std. 10 Min.</span>');
    expect(html).not.toContain('<time dateTime="2026-11-01T11:00"');
    expect(html).not.toContain('<time dateTime="2026-11-01T12:20"');
    expect(html).toContain('13:30 Uhr');
    expect(html).toContain('Geplanter Turnierbeginn');
    expect(html.indexOf('Mittagspause')).toBeLessThan(html.indexOf('Hauptrunde'));
  });


  it('zeigt an einem Turniertag in beiden Zeitplänen ausschließlich Uhrzeiten', () => {
    const start = '2026-11-01T10:00';
    const timeline = buildPlannedTimeline(start, [
      { label: 'Vorrunde', type: 'SWISS', estimatedMinutes: 60 },
      { label: 'Mittagspause', type: 'BREAK', estimatedMinutes: 15, breakKind: 'minutes', breakMinutes: 15 },
      { label: 'Finale', type: 'KNOCKOUT', estimatedMinutes: 45 },
    ]);
    expect(groupPlannedScheduleDays(timeline.items, start)).toMatchObject({ multipleDays: false });
    const editor = renderToStaticMarkup(createElement(PlannedScheduleEditor, {
      scheduledStart: start, timeline, awardsEnabled: true, awardsAt: timeline.estimatedEnd,
      onToggleAwards: () => {}, onAwardsAtChange: () => {},
    }));
    const publicView = renderToStaticMarkup(createElement(TournamentPlannedSchedule, {
      scheduledStart: start, items: timeline.items,
    }));
    expect(editor).toContain('10:00 Uhr');
    expect(editor).toContain('Pause · geplante Dauer');
    expect(editor).not.toContain('planned-schedule-day-heading');
    expect(editor).not.toContain('01.11.2026,');
    expect(publicView).not.toContain('planned-schedule-day-heading');
    expect(publicView).toContain('<time dateTime="2026-11-01T10:00">10:00 Uhr</time>');
    expect(publicView).not.toContain('01.11.2026,');
  });

  it('gruppiert mehrtägige Abläufe je Datum und zeigt innerhalb nur Uhrzeiten', () => {
    const start = '2026-10-31T17:00';
    const timeline = buildPlannedTimeline(start, [
      { label: 'Gruppenphase', type: 'GROUPS', estimatedMinutes: 60 },
      { label: 'Spieltagsende', type: 'BREAK', estimatedMinutes: 0, breakKind: 'overnight', nextDayStart: '09:00' },
      { label: 'Finalrunde', type: 'KNOCKOUT', estimatedMinutes: 45 },
    ]);
    const awards = '2026-11-02T10:00';
    const items: PlannedScheduleItem[] = [
      ...timeline.items, { id: 'awards-ceremony', at: awards, title: 'Siegerehrung', type: 'other' },
    ];
    const groups = groupPlannedScheduleDays(items, start);
    expect(groups.multipleDays).toBe(true);
    expect(groups.days.map((day) => day.date)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    const editor = renderToStaticMarkup(createElement(PlannedScheduleEditor, {
      scheduledStart: start, timeline, awardsEnabled: true, awardsAt: awards,
      onToggleAwards: () => {}, onAwardsAtChange: () => {},
    }));
    const publicView = renderToStaticMarkup(createElement(TournamentPlannedSchedule, { scheduledStart: start, items }));
    for (const html of [editor, publicView]) {
      expect((html.match(/planned-schedule-day-heading/g) ?? []).length).toBe(3);
      expect(html).toContain('Samstag');
      expect(html).toContain('Sonntag');
      expect(html).toContain('Montag');
      expect(html).toContain('17:00 Uhr');
      expect(html).toContain('09:00 Uhr');
      expect(html).toContain('Siegerehrung');
      expect(html).not.toContain('31.10.2026, 17:00');
      expect(html).not.toContain('01.11.2026, 09:00');
    }
  });

  it('gruppiert über Mitternacht korrekt, auch bei einer Zwischenpause', () => {
    const start = '2026-11-01T23:10';
    const timeline = buildPlannedTimeline(start, [{
      label: 'Schweizer System', type: 'SWISS', estimatedMinutes: 120, roundCount: 4,
      inlineBreakAfterRound: 2, inlineBreakKind: 'minutes', inlineBreakMinutes: 15,
    }]);
    const groups = groupPlannedScheduleDays(timeline.items, start);
    expect(groups.multipleDays).toBe(true);
    expect(groups.days.map((day) => day.date)).toEqual(['2026-11-01', '2026-11-02']);
    expect(groups.days[1].items.map((item) => item.title)).toContain('Pause nach Runde 2 · Schweizer System');
    expect(groups.days[1].items.map((item) => item.title)).toContain('Fortsetzung Runde 3 · Schweizer System');
  });

  it('lässt leere Pläne zu, prüft aber unvollständige Einträge und Duplikate', () => {
    expect(validatePlannedSchedule([])).toEqual([]);
    expect(validatePlannedSchedule([{ ...example[0], at: '2026-10-99T09:00' }])).toContain('Zeitplan-Eintrag 1: Gültiges Datum und Uhrzeit erforderlich.');
    expect(validatePlannedSchedule([{ ...example[0], title: '  ' }]).some((msg) => msg.includes('Bezeichnung'))).toBe(true);
    expect(validatePlannedSchedule([example[0], { ...example[1], id: example[0].id }]).some((msg) => msg.includes('doppelt'))).toBe(true);
  });

  it('speichert Turnierbeginn und unverbindlichen Ablauf dauerhaft, ohne Live-Phasen zu verändern', () => {
    const sent = example.map((entry) => ({ ...entry }));
    const input = { name: 'Zeitplan-Cup', sport: 'table_tennis', discipline: 'SINGLES' as const, tables: 2,
      minimumMatches: 1, participantNames: ['Anna', 'Bernd'],
      phases: [{ type: 'ROUND_ROBIN' as const, label: 'Jeder gegen Jeden', entrantCount: 2, groupCount: 1,
        swissRounds: 1, bestOf: 1, knockoutBestOf: [] }], estimatedDurationMinutes: 45,
      scheduledStart: start, plannedSchedule: sent };
    const tournament = createMockTournament(input);
    expect(tournament.scheduledStart).toBe(start);
    expect(tournament.plannedSchedule).toEqual(example);
    sent[0].title = 'Später geändert';
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
    expect(markup).toContain('Gruppenphase');
    expect(markup).toContain('Mittagspause');
    expect(markup).toContain('Siegerehrung');
    expect(markup.indexOf('Gruppenphase')).toBeLessThan(markup.indexOf('Mittagspause'));
    expect(markup.indexOf('Mittagspause')).toBeLessThan(markup.indexOf('Siegerehrung'));
    expect(markup).toContain('Verpflegung im Foyer');
    expect(markup).not.toContain('planned-schedule-kind');
    expect(markup).not.toContain('>Wettkampf</span>');
    expect(markup).not.toContain('>Info</span>');
    expect(renderToStaticMarkup(createElement(TournamentPlannedSchedule, {}))).toBe('');
  });
});
