/** Zusammenfassung der Teilnehmerverwaltung, ohne von UI-Labels abhängig zu sein. */
export type ParticipantProgressStatus = 'Aktiv' | 'Ausgeschieden' | 'Zurückgezogen' | 'Turniersieger' | 'Beendet' | `Nicht für Phase ${string} qualifiziert`;

export interface ParticipantStatistics {
  total: number;
  remaining: number;
  eliminated: number;
  withdrawn: number;
}

export function summarizeParticipantStatuses(statuses: readonly ParticipantProgressStatus[]): ParticipantStatistics {
  const withdrawn = statuses.filter((status) => status === 'Zurückgezogen').length;
  const eliminated = statuses.filter((status) => status === 'Ausgeschieden' || status.startsWith('Nicht für Phase ')).length;
  // Turniersieger und regulär beendete Teilnehmer zählen nicht als ausgeschieden.
  const remaining = statuses.length - eliminated - withdrawn;
  return { total: statuses.length, remaining, eliminated, withdrawn };
}
