import { describe, expect, it } from 'vitest';
import { participantNameKey, validParticipantRoster } from '@/domain/participantNames';
import { createVenueLayout, resizeVenueLayout, resizeVenueLayoutForTableCount, validateVenueLayout, layoutTableNumbers } from '@/domain/venueLayout';
import { validateTournamentCreation, type CreationValidationInput } from '@/domain/validateTournamentCreation';
import { changedPhaseEntrantIds } from '@/domain/phaseReview';
import { buildPlannedTimeline, validatePlannedSchedule } from '@/domain/tournamentSchedule';

const names = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Linus Torvalds'];
function creation(): CreationValidationInput {
  return {
    name: 'Vereinsturnier', sport: 'table_tennis', discipline: 'SINGLES',
    tables: 2, minimumMatches: 3, participantNames: names,
    venueLayout: createVenueLayout(2),
    scheduledStart: '2030-11-01T10:00',
    plannedSchedule: buildPlannedTimeline('2030-11-01T10:00', [
      { type: 'SWISS', label: 'Schweizer', estimatedMinutes: 45, roundCount: 3 },
    ]).items,
    phases: [{
      type: 'SWISS', label: 'Schweizer', entrantCount: 4, groupCount: 2,
      swissRounds: 3, bestOf: 3, knockoutBestOf: [],
    }],
  };
}

describe('critical creation review – participant and team identities', () => {
  it('normalizes duplicate team names and preserves non-ASCII identifiers', () => {
    expect(participantNameKey('  TTF  Laudenbach ')).toBe(participantNameKey('ttf laudenbach'));
    expect(participantNameKey('MÜLLER')).toBe(participantNameKey('Müller'));
    const team = (teamName: string) => ({
      firstName: '', lastName: '', partnerFirstName: '', partnerLastName: '', teamName,
    });
    expect(validParticipantRoster([team('TTF Laudenbach'), team('TTF  Laudenbach')], 'TEAMS')).toBe(false);
    expect(validParticipantRoster([team('TTF Laudenbach'), team('TSV Laudenbach')], 'TEAMS')).toBe(true);
  });

  it('validates ten thousand participants without a quadratic pairwise scan', () => {
    const entries = Array.from({ length: 10000 }, (_, index) => ({
      firstName: 'Test', lastName: `Spieler ${index + 1}`, partnerFirstName: '', partnerLastName: '',
    }));
    expect(validParticipantRoster(entries, 'SINGLES')).toBe(true);
    entries[9999] = { ...entries[9999], lastName: 'Spieler 1' };
    expect(validParticipantRoster(entries, 'SINGLES')).toBe(false);
  });

  it('rejects doubles where a player appears as someone else’s partner', () => {
    const first = { firstName: 'Ada', lastName: 'Lovelace', partnerFirstName: 'Grace', partnerLastName: 'Hopper' };
    const second = { firstName: 'Alan', lastName: 'Turing', partnerFirstName: 'Ada', partnerLastName: 'Lovelace' };
    expect(validParticipantRoster([first, second], 'DOUBLES')).toBe(false);
  });
});

describe('critical creation review – venue consistency', () => {
  it('expands a customized hall at the 200-row limit and retains every surface', () => {
    const tall = resizeVenueLayout(createVenueLayout(200), 1, 200, 200);
    expect(validateVenueLayout(tall, 200)).toEqual([]);
    const grown = resizeVenueLayoutForTableCount(tall, 201);
    expect(grown).not.toBe(tall);
    expect(grown.columns).toBeGreaterThanOrEqual(2);
    expect(grown.rows).toBeLessThanOrEqual(200);
    expect(layoutTableNumbers(grown)).toHaveLength(201);
    expect(validateVenueLayout(grown, 201)).toEqual([]);
  });

  it('rejects missing, duplicate and out-of-range surfaces independently of the UI', () => {
    const source = createVenueLayout(4);
    expect(validateVenueLayout({ ...source, cells: ['', ...source.cells.slice(1)] }, 4)).toContain('Im Hallenplan fehlen Spielflächen.');
    expect(validateVenueLayout({ ...source, cells: ['table:2', ...source.cells.slice(1)] }, 4).join(' ')).toMatch(/doppelte/);
    expect(validateVenueLayout({ ...source, columns: 201 }, 4).join(' ')).toMatch(/Rastergrenzen/);
  });
});

describe('critical creation review – final save, phases and time', () => {
  it('applies the same minimum rules to the wizard and final storage', () => {
    const valid = creation();
    expect(validateTournamentCreation(valid)).toEqual([]);
    expect(validateTournamentCreation({ ...valid, phases: [{ ...valid.phases[0], swissRounds: 4 }] }).join(' ')).toMatch(/Schweizer/);
    expect(validateTournamentCreation({ ...valid, phases: [{ ...valid.phases[0], entrantCount: 3 }] }).join(' ')).toMatch(/Teilnehmerzahl/);
    expect(validateTournamentCreation({ ...valid, participantNames: [...names.slice(0, 3), 'ada  lovelace'] }).join(' ')).toMatch(/doppelt/);
    expect(validateTournamentCreation({ ...valid, venueLayout: { ...valid.venueLayout!, cells: ['table:1', '', '', ''] } }).join(' ')).toMatch(/fehlen/);
  });

  it('requires review for automatically changed entrants after phase reordering', () => {
    const previous = [{ id: 'groups', entrantCount: 16 }, { id: 'swiss', entrantCount: 8 }, { id: 'rr', entrantCount: 4 }];
    const normalized = [{ id: 'groups', entrantCount: 16 }, { id: 'rr', entrantCount: 4 }, { id: 'swiss', entrantCount: 4 }];
    expect(changedPhaseEntrantIds(previous, normalized)).toEqual(['swiss']);
    expect(changedPhaseEntrantIds(previous, normalized, 'swiss')).toEqual([]);
  });

  it('rejects oversized plans consistently in creation and before-start editing', () => {
    const large = Array.from({ length: 81 }, (_, index) => ({
      id: `phase-${index + 1}`, at: '2030-11-01T12:00', title: `Abschnitt ${index + 1}`,
      type: 'competition' as const,
    }));
    expect(validatePlannedSchedule(large)).toContain('Der Zeitplan darf höchstens 80 Einträge enthalten.');
    expect(validateTournamentCreation({ ...creation(), plannedSchedule: large }).join(' ')).toMatch(/80 Einträge/);
  });

  it('rebases the full timeline when “Jetzt” rolls over a minute', () => {
    const proposal = [{ type: 'SWISS', label: 'Schweizer', estimatedMinutes: 45 }];
    const oldTimeline = buildPlannedTimeline('2030-11-01T10:00', proposal);
    const persisted = buildPlannedTimeline('2030-11-01T10:01', proposal);
    expect(oldTimeline.items[0].at).toBe('2030-11-01T10:00');
    expect(persisted.items[0].at).toBe('2030-11-01T10:01');
    expect(validateTournamentCreation({ ...creation(), scheduledStart: '2030-11-01T10:01',
      plannedSchedule: oldTimeline.items }).join(' ')).toMatch(/stimmt nicht/);
  });
});
