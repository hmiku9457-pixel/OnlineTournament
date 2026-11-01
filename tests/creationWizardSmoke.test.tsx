import { describe, expect, it, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { CreateTournamentPage } from '@/pages/CreateTournamentPage';
import { CREATION_DRAFT_KEY, type CreationDraft } from '@/domain/creationDraft';
import { createVenueLayout } from '@/domain/venueLayout';

afterEach(() => vi.unstubAllGlobals());

function renderWizard(): string {
  return renderToStaticMarkup(createElement(MemoryRouter, {},
    createElement(CreateTournamentPage)));
}

describe('five-step tournament creation smoke test', () => {
  it('renders the first step and safeguards against losing a draft', () => {
    const html = renderWizard();
    expect(html).toContain('Grunddaten');
    expect(html).toContain('Turniername eingeben');
    expect(html).toContain('Turnierdatum auswählen');
    expect(html).toContain('Entwurf verwerfen');
    expect(html).toContain('class="btn danger creation-discard-button"');
    expect(html).toContain('class="page-head creation-page-head"');
    expect(html).not.toContain('Entwurf wird in diesem Browser automatisch gespeichert.');
  });

  it('restores a complete five-step configuration into the final review', () => {
    const draft: CreationDraft = {
      step: 5, maxReachedStep: 5, hasVisitedPhaseStep: true,
      name: 'Vereinsmeisterschaft 2026', scheduledDate: '2026-11-01', scheduledTime: '10:00',
      sport: 'table_tennis', discipline: 'SINGLES',
      timedMatchMinutes: '', venueTurnoverMinutes: '', tables: 3,
      customTables: false, venueLayoutEnabled: false, venueLayout: createVenueLayout(3),
      participants: [
        { id: 'participant-1', firstName: 'Ada', lastName: 'Lovelace', partnerFirstName: '', partnerLastName: '' },
        { id: 'participant-2', firstName: 'Grace', lastName: 'Hopper', partnerFirstName: '', partnerLastName: '' },
      ],
      participantForm: { firstName: '', lastName: '', partnerFirstName: '', partnerLastName: '' },
      editingParticipantId: null, minimumMatches: 1, customMinimumMatches: false,
      phaseDrafts: [{
        id: 'phase-1', type: 'ROUND_ROBIN', label: 'Jeder gegen jeden',
        entrantCount: 2, groupCount: 2, swissRounds: 1,
        bestOf: 1, knockoutBestOf: [], customEntrants: false,
        breakKind: 'minutes', breakMinutes: 15, nextDayStart: '09:00',
        nextDayDate: '', breakUntil: '12:00', note: '', inlineBreakAfterRound: 0,
        inlineBreakKind: 'minutes', inlineBreakMinutes: 15, inlineBreakUntil: '13:00',
      }],
      selectedRecommendationId: null,
      enabledSystems: { 'round-robin': true, groups: true, swiss: true, knockout: true },
      maxGroups: null, maxSwissRounds: null, knockoutQualifierCount: null,
      awardsEnabled: false, awardsAtOverride: null,
    };
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => key === CREATION_DRAFT_KEY ? JSON.stringify({ version: 1, draft }) : null,
    } });
    const html = renderWizard();
    expect(html).toContain('Vereinsmeisterschaft 2026');
    expect(html).toContain('Zusammenfassung');
    expect(html).toContain('Jeder gegen jeden');
    expect(html).toContain('Turnier erstellen');
    expect(html).not.toContain('Während der Erstellung');
  });
});
