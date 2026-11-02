import { describe, expect, it } from 'vitest';
import { clearCreationDraft, CREATION_DRAFT_KEY, highestDraftSequence, loadCreationDraft, saveCreationDraft, validDraft, type CreationDraft } from '@/domain/creationDraft';
import { resizeVenueLayout, createVenueLayout } from '@/domain/venueLayout';

function makeDraft(): CreationDraft {
  return {
    step: 4, maxReachedStep: 5, hasVisitedPhaseStep: true,
    name: 'Vereinsmeisterschaft', scheduledDate: '2026-11-01', scheduledTime: '10:00', useCurrentTime: false,
    sport: 'table_tennis', discipline: 'SINGLES',
    timedMatchMinutes: '', venueTurnoverMinutes: '', tables: 9,
    customTables: false, venueLayoutEnabled: true,
    venueLayout: resizeVenueLayout(createVenueLayout(9), 3, 3, 9),
    participants: [
      { id: 'one', firstName: 'Ada', lastName: 'Lovelace', partnerFirstName: '', partnerLastName: '' },
      { id: 'two', firstName: 'Grace', lastName: 'Hopper', partnerFirstName: '', partnerLastName: '' },
    ],
    participantForm: { firstName: '', lastName: '', partnerFirstName: '', partnerLastName: '' },
    editingParticipantId: null,
    minimumMatches: 4, customMinimumMatches: false,
    phaseDrafts: [
      {
        id: 'phase-one', type: 'SWISS', label: 'Schweizer System', bestOf: 5,
        entrantCount: 2, groupCount: 2, swissRounds: 1, knockoutBestOf: [],
        customEntrants: false, breakKind: 'minutes', breakMinutes: 15,
        nextDayStart: '09:00', nextDayDate: '', breakUntil: '12:00', note: '',
        inlineBreakAfterRound: 0, inlineBreakKind: 'minutes', inlineBreakMinutes: 15, inlineBreakUntil: '13:00',
      },
    ],
    selectedRecommendationId: null,
    enabledSystems: { 'round-robin': true, groups: true, swiss: true, knockout: true },
    maxGroups: null, maxSwissRounds: null, knockoutQualifierCount: null,
    preferredDurationMinutes: 255,
    awardsEnabled: true, awardsAtOverride: '2026-11-01T13:30',
  };
}

function fakeStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('tournament creation draft recovery', () => {
  it('saves and fully restores entries, hall plan, phase settings and ceremony', () => {
    const store = fakeStorage();
    const original = makeDraft();
    expect(saveCreationDraft(original, store)).toBe(true);
    const restored = loadCreationDraft(store);
    expect(restored).toEqual(original);
    expect(restored?.participants).toHaveLength(2);
    expect(restored?.phaseDrafts[0].swissRounds).toBe(1);
    expect(restored?.awardsAtOverride).toBe('2026-11-01T13:30');
    expect(restored?.preferredDurationMinutes).toBe(255);
    expect(store.values.has(CREATION_DRAFT_KEY)).toBe(true);
    clearCreationDraft(store);
    expect(loadCreationDraft(store)).toBeNull();
  });

  it('round-trips the prestart recovery key using the same versioned format as the wizard', () => {
    const store = fakeStorage();
    const key = 'online-tournament:prestart-recovery:tournament-1';
    const phaseEditing = { ...makeDraft(), step: 4, phaseDrafts: [
      { ...makeDraft().phaseDrafts[0], swissRounds: 5 },
    ] };
    expect(saveCreationDraft(phaseEditing, store, key)).toBe(true);
    expect(loadCreationDraft(store, key)?.phaseDrafts[0].swissRounds).toBe(5);
    clearCreationDraft(store, key);
    expect(loadCreationDraft(store, key)).toBeNull();
  });

  it('rejects malformed, incompatible or truncated drafts without crashing', () => {
    const store = fakeStorage();
    store.setItem(CREATION_DRAFT_KEY, '{broken');
    expect(loadCreationDraft(store)).toBeNull();
    store.setItem(CREATION_DRAFT_KEY, JSON.stringify({ version: 2, draft: makeDraft() }));
    expect(loadCreationDraft(store)).toBeNull();
    const invalid = makeDraft() as unknown as Record<string, unknown>;
    invalid.participants = [{ id: 'untrusted', firstName: 5 }];
    store.setItem(CREATION_DRAFT_KEY, JSON.stringify({ version: 1, draft: invalid }));
    expect(loadCreationDraft(store)).toBeNull();
    const invalidLayout = makeDraft();
    invalidLayout.venueLayout.cells.length = 2;
    store.setItem(CREATION_DRAFT_KEY, JSON.stringify({ version: 1, draft: invalidLayout }));
    expect(loadCreationDraft(store)).toBeNull();
  });

  it('rejects previous-schema drafts and invalid duration values', () => {
    const store = fakeStorage();
    const incomplete = { ...makeDraft() } as Partial<CreationDraft>;
    delete incomplete.preferredDurationMinutes;
    store.setItem(CREATION_DRAFT_KEY, JSON.stringify({ version: 1, draft: incomplete }));
    expect(loadCreationDraft(store)).toBeNull();
    delete incomplete.useCurrentTime;
    store.setItem(CREATION_DRAFT_KEY, JSON.stringify({ version: 1, draft: incomplete }));
    expect(loadCreationDraft(store)).toBeNull();
    for (const invalid of [-15, 0, 12.5, 1440, 100000]) {
      const corrupted = { ...makeDraft(), preferredDurationMinutes: invalid };
      store.setItem(CREATION_DRAFT_KEY, JSON.stringify({ version: 1, draft: corrupted }));
      expect(loadCreationDraft(store)).toBeNull();
    }
  });

  it('isolates a damaged optional team name instead of letting the editor crash', () => {
    const store = fakeStorage();
    const broken = makeDraft();
    (broken.participants[0] as unknown as Record<string, unknown>).teamName = 123;
    store.setItem(CREATION_DRAFT_KEY, JSON.stringify({ version: 1, draft: broken }));
    expect(loadCreationDraft(store)).toBeNull();
    const brokenForm = makeDraft();
    (brokenForm.participantForm as unknown as Record<string, unknown>).teamName = {};
    store.setItem(CREATION_DRAFT_KEY, JSON.stringify({ version: 1, draft: brokenForm }));
    expect(loadCreationDraft(store)).toBeNull();
  });

  it('rejects type-coerced steps and duplicate participant/phase identities', () => {
    const stringStep = makeDraft();
    (stringStep as unknown as Record<string, unknown>).step = '2';
    expect(validDraft(stringStep)).toBe(false);
    const duplicateParticipant = makeDraft();
    duplicateParticipant.participants[1].id = duplicateParticipant.participants[0].id;
    expect(validDraft(duplicateParticipant)).toBe(false);
    const duplicatePhase = makeDraft();
    duplicatePhase.phaseDrafts.push({ ...duplicatePhase.phaseDrafts[0] });
    expect(validDraft(duplicatePhase)).toBe(false);
    const staleEditor = makeDraft();
    staleEditor.editingParticipantId = 'unknown';
    expect(validDraft(staleEditor)).toBe(false);
  });

  it('persists a required roster review after a change of competition type', () => {
    const store = fakeStorage();
    const draft = { ...makeDraft(), rosterReviewRequired: true };
    expect(saveCreationDraft(draft, store)).toBe(true);
    expect(loadCreationDraft(store)?.rosterReviewRequired).toBe(true);
    expect(validDraft({ ...draft, rosterReviewRequired: 'false' })).toBe(false);
  });

  it('starts new internal identifiers after the highest restored identifier', () => {
    expect(highestDraftSequence([{ id: 'participant-3' }, { id: 'participant-19' }, { id: 'other' }], 'participant')).toBe(19);
    expect(highestDraftSequence([{ id: 'phase-2' }, { id: 'phase-6' }], 'phase')).toBe(6);
    expect(highestDraftSequence([], 'phase')).toBe(0);
  });

  it('retains the hall layout customization flag even while the individual plan is inactive', () => {
    const store = fakeStorage();
    const draft = { ...makeDraft(), venueLayoutCustomized: true, venueLayoutEnabled: false };
    expect(saveCreationDraft(draft, store)).toBe(true);
    expect(loadCreationDraft(store)?.venueLayoutCustomized).toBe(true);
    expect(loadCreationDraft(store)?.venueLayoutEnabled).toBe(false);
  });

  it('allows creation to proceed if the browser refuses a draft write', () => {
    expect(saveCreationDraft(makeDraft(), {
      setItem: () => { throw new Error('Storage quota exceeded'); },
    })).toBe(false);
  });
});
