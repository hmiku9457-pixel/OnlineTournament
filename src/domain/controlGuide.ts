import type { TournamentStatus } from '@/domain/types';

export type ControlHelpTopic = 'start' | 'tables' | 'queue' | 'results' | 'phases' | 'participants' | 'matches' | 'audit';

export interface ControlGuideState {
  status: TournamentStatus;
  hasStarted: boolean;
  hasActiveStage: boolean;
  hasNextStage: boolean;
  waitingMatches: number;
  freeTables: number;
  activeMatches: number;
}

export function getControlGuide(state: ControlGuideState): { title: string; text: string; topic: ControlHelpTopic } {
  if (state.status === 'FINISHED') return { title: 'Turnier abgeschlossen', text: 'Unter „Endplatzierungen“ steht die Gesamtwertung. Die einzelnen Phasen bleiben im Turnierverlauf einsehbar.', topic: 'phases' };
  if (!state.hasStarted) return { title: 'Vor dem ersten Spiel', text: 'Teilnehmer und Auslosung prüfen, dann oben das Turnier starten.', topic: 'start' };
  if (!state.hasActiveStage && state.hasNextStage) return { title: 'Nächste Phase vorbereiten', text: 'Im Turnierverlauf die neue Auslosung kontrollieren und danach die nächste Phase starten.', topic: 'phases' };
  if (state.status === 'PAUSED') return { title: 'Turnier pausiert', text: 'Laufende Spiele dürfen enden. Neue Tischzuweisungen sind erst nach „Turnier fortsetzen“ möglich.', topic: 'tables' };
  if (state.waitingMatches > 0 && state.freeTables > 0) return { title: 'Wartende Spiele zuweisen', text: 'Eine Partie unter „Nächste Spiele“ auswählen oder freie Tische automatisch belegen.', topic: 'queue' };
  if (state.activeMatches > 0) return { title: 'Laufende Spiele betreuen', text: 'Tisch wählen, Sätze eingeben und Endergebnisse abschließen. Frei gewordene Tische können neu belegt werden.', topic: 'results' };
  return { title: 'Turnier im Blick behalten', text: 'Neue Begegnungen erscheinen unter „Nächste Spiele“, sobald sie bereitstehen.', topic: 'queue' };
}
