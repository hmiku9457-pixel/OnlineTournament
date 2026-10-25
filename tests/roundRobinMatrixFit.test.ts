import { describe, expect, it } from 'vitest';
import { MATRIX_AUTOFIT_MAX_PLAYERS, roundRobinMatrixFit } from '@/domain/roundRobinMatrixFit';

describe('Autoskalierung der vergrößerten Kreuztabelle', () => {
  it('skaliert von 2 bis einschließlich 32 Spielern in die vorhandene Breite und Höhe', () => {
    for (const count of [2, 4, 8, 16, 24, 31, 32]) {
      for (const [width, height] of [[1420, 790], [900, 540], [360, 490]]) {
        const fit = roundRobinMatrixFit(count, width, height);
        expect(fit.nameWidth + fit.cellWidth * count).toBeLessThanOrEqual(width);
        expect(fit.rowHeight * (count + 1)).toBeLessThanOrEqual(height);
        expect(fit.cellFont).toBeGreaterThan(0);
        expect(fit.nameFont).toBeGreaterThan(0);
        expect(fit.cellFont).toBeLessThanOrEqual(fit.cellWidth / 3.4 + 0.01);
        expect(fit.cellFont).toBeLessThanOrEqual(fit.rowHeight * 0.56 + 0.01);
      }
    }
  });

  it('verkleinert eine 32-Spieler-Matrix auf schmaleren Bildschirmen automatisch', () => {
    const desktop = roundRobinMatrixFit(32, 1300, 800);
    const tablet = roundRobinMatrixFit(32, 700, 550);
    const mobile = roundRobinMatrixFit(32, 350, 480);
    expect(desktop.cellFont).toBeGreaterThan(tablet.cellFont);
    expect(tablet.cellFont).toBeGreaterThan(mobile.cellFont);
  });

  it('behält bei kleinen Feldern gut lesbare Schrift und begrenzt die Automatik auf 32', () => {
    expect(MATRIX_AUTOFIT_MAX_PLAYERS).toBe(32);
    expect(roundRobinMatrixFit(4, 1100, 740).cellFont).toBe(14);
    expect(roundRobinMatrixFit(32, 1200, 800)).toEqual(roundRobinMatrixFit(33, 1200, 800));
  });
});
