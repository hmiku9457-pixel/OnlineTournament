/** Zusammenfassung der Teilnehmerverwaltung, ohne von UI-Labels abhängig zu sein. */
export type ParticipantProgressStatus = 'Aktiv' | 'Ausgeschieden' | 'Zurückgezogen' | 'Turniersieger' | 'Beendet' | `Nicht für Phase ${string} qualifiziert`;

export interface ParticipantStatistics {
  total: number;
  remaining: number;
  eliminated: number;
  reserves: number;
  withdrawn: number;
}

export function summarizeParticipantStatuses(statuses: readonly ParticipantProgressStatus[]): ParticipantStatistics {
  const withdrawn = statuses.filter((status) => status === 'Zurückgezogen').length;
  const eliminated = statuses.filter((status) => status === 'Ausgeschieden').length;
  const reserves = statuses.filter((status) => status.startsWith('Nicht für Phase ')).length;
  // Reserves are not yet eliminated, but are also not active qualifiers.
  const remaining = statuses.length - eliminated - withdrawn - reserves;
  return { total: statuses.length, remaining, eliminated, reserves, withdrawn };
}
