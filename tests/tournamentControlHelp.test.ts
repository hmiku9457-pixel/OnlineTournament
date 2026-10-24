import { describe, expect, it } from 'vitest';
import { getControlGuide } from '../src/domain/controlGuide';
import type { ControlGuideState } from '../src/domain/controlGuide';

const running: ControlGuideState = {
  status: 'RUNNING',
  hasStarted: true,
  hasActiveStage: true,
  hasNextStage: false,
  waitingMatches: 2,
  freeTables: 1,
  activeMatches: 3,
};

describe('Kontext-Hinweis der Turnierleitung', () => {
  it('führt vor dem Start zur Vorbereitung', () => {
    expect(getControlGuide({ ...running, status: 'READY', hasStarted: false }).topic).toBe('start');
  });

  it('priorisiert einen Phasenwechsel vor laufenden Tischhinweisen', () => {
    expect(getControlGuide({ ...running, hasActiveStage: false, hasNextStage: true }).topic).toBe('phases');
  });

  it('erklärt die Pause, auch wenn noch wartende Spiele existieren', () => {
    expect(getControlGuide({ ...running, status: 'PAUSED' }).title).toBe('Turnier pausiert');
  });

  it('verweist bei freien Tischen zur Zuweisung und sonst zu Ergebnissen', () => {
    expect(getControlGuide(running).topic).toBe('queue');
    expect(getControlGuide({ ...running, freeTables: 0 }).topic).toBe('results');
  });

  it('führt nach Turnierende zu den Platzierungen', () => {
    expect(getControlGuide({ ...running, status: 'FINISHED' }).title).toBe('Turnier abgeschlossen');
  });
});
