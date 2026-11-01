import { describe, expect, it, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { CreateTournamentPage } from '@/pages/CreateTournamentPage';
import { SportChangeDialog } from '@/components/SportChangeDialog';
import { TestParticipantsDialog } from '@/components/TestParticipantsDialog';
import { DiscardDraftDialog } from '@/components/DiscardDraftDialog';
import { UnsavedParticipantDialog } from '@/components/UnsavedParticipantDialog';
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
    expect(html).toContain('class="creation-page-container"');
    expect(html).toContain('class="field-hint wizard-date-hint"');
    expect(html).toContain('class="field-hint wizard-start-hint"');
    expect(html).toContain('Frühere Uhrzeiten sind am heutigen Tag gesperrt.');
    expect(html).toContain('„Jetzt“ übernimmt die aktuelle Uhrzeit und aktualisiert sie fortlaufend.');
    expect(html).toContain('Den tatsächlichen Spielstart löst später die Turnierleitung aus.');
    expect(html).not.toContain('Entwurf wird in diesem Browser automatisch gespeichert.');
  });

  it('renders a dismissible destructive confirmation before discarding a draft', () => {
    const modal = renderToStaticMarkup(createElement(DiscardDraftDialog, {
      onCancel: () => {}, onConfirm: () => {},
    }));
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('Entwurf verwerfen?');
    expect(modal).toContain('Teilnehmer und Phasen gehen verloren');
    expect(modal).toContain('Aktion kann nicht rückgängig gemacht werden');
    expect(modal).toContain('Bereits erstellte Turniere bleiben davon unberührt');
    expect(modal).toContain('>Abbrechen</button>');
    expect(modal).toContain('class="btn danger"');
    expect(modal).toContain('>Entwurf endgültig verwerfen</button>');
    expect(modal).not.toContain('window.confirm');
  });

  it('provides a consistent modal before losing unsaved participant edits', () => {
    const modal = renderToStaticMarkup(createElement(UnsavedParticipantDialog, {
      onStay: () => {}, onDiscard: () => {},
    }));
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('Ungespeicherte Teilnehmerdaten');
    expect(modal).toContain('Weiter bearbeiten');
    expect(modal).toContain('Eingaben verwerfen');
  });

  it('renders sport-change confirmation as an accessible dialog with explicit choices', () => {
    const modal = renderToStaticMarkup(createElement(SportChangeDialog, {
      previousSport: 'Tischtennis',
      nextSport: 'Fußball',
      hasParticipants: true,
      hasPhases: true,
      onCancel: () => {},
      onConfirm: () => {},
    }));
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('Sportart wechseln?');
    expect(modal).toContain('Tischtennis');
    expect(modal).toContain('Fußball');
    expect(modal).toContain('Bereits erfasste Teilnehmer bleiben erhalten');
    expect(modal).toContain('Best-of-Einstellungen bestehender Phasen');
    expect(modal).toContain('>Abbrechen</button>');
    expect(modal).toContain('class="btn danger"');
    expect(modal).toContain('>Sportart wechseln</button>');
  });

  it('shows an accessible test-player modal with accurate additions and confirm/cancel actions', () => {
    const markup = renderToStaticMarkup(createElement(TestParticipantsDialog, {
      discipline: 'SINGLES', existingCount: 4, onCancel: () => {}, onConfirm: () => {},
    }));
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('19 Testspieler erzeugen?');
    expect(markup).toContain('Werden ergänzt: ');
    expect(markup).toContain('<strong>15</strong>');
    expect(markup).toContain('15 Testspieler hinzufügen');
    expect(markup).toContain('>Abbrechen</button>');
    expect(markup).not.toContain('window.confirm');

    const doubles = renderToStaticMarkup(createElement(TestParticipantsDialog, {
      discipline: 'DOUBLES', existingCount: 0, onCancel: () => {}, onConfirm: () => {},
    }));
    expect(doubles).toContain('19 Testdoppel erzeugen?');
  });

  it('only mentions affected data in the sport-change dialog', () => {
    const modal = renderToStaticMarkup(createElement(SportChangeDialog, {
      previousSport: 'Badminton',
      nextSport: 'Fußball',
      hasParticipants: false,
      hasPhases: true,
      onCancel: () => {},
      onConfirm: () => {},
    }));
    expect(modal).not.toContain('Bereits erfasste Teilnehmer bleiben erhalten');
    expect(modal).toContain('Best-of-Einstellungen bestehender Phasen');
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
    // This warning is displayed as a separate, highlighted card in the
    // persistent summary rather than as a plain note below the duration.
    draft.step = 4;
    draft.minimumMatches = 4;
    const phaseMarkup = renderWizard();
    expect(phaseMarkup).toContain('class="wizard-side-minimum-warning"');
    expect(phaseMarkup).toContain('Mindestspielzahl nicht erreicht');
    expect(phaseMarkup).toContain('Garantiert <b>1</b> von gewünschten <b>4</b>');
    expect(phaseMarkup).toContain('Phasenplanung prüfen');
  });
});
