import { describe, expect, it } from 'vitest';
import { getGroupQualificationHints } from '@/domain/groupQualification';

const groups = ['A', 'B', 'C', 'D'].map((label) => ({
  standings: Array.from({ length: 5 }, (_, index) => ({ name: `${label}${index + 1}` })),
}));

describe('Qualifikationsmarkierung in Gruppentabellen', () => {
  it('markiert bei acht Plätzen die ersten beiden jeder Gruppe als vorläufig qualifiziert', () => {
    const result = getGroupQualificationHints(groups, 8);
    expect([...result.projected].sort()).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2']);
    expect(result.possible.size).toBe(0);
  });

  it('unterscheidet sichere Rangstufen von gruppenübergreifend umkämpften Zusatzplätzen', () => {
    const result = getGroupQualificationHints(groups, 6);
    expect([...result.projected].sort()).toEqual(['A1', 'B1', 'C1', 'D1']);
    expect([...result.possible].sort()).toEqual(['A2', 'B2', 'C2', 'D2']);
    expect(result.projected.has('A3')).toBe(false);
  });

  it('beachtet unterschiedliche Gruppengrößen und zurückgezogene Spieler', () => {
    const uneven = [
      { standings: [{ name: 'A1' }, { name: 'A2' }] },
      { standings: [{ name: 'B1' }] },
      { standings: [{ name: 'C1' }, { name: 'C2' }] },
    ];
    const result = getGroupQualificationHints(uneven, 4, new Set(['B1']));
    expect([...result.projected].sort()).toEqual(['A1', 'A2', 'C1', 'C2']);
    expect(result.possible.size).toBe(0);
  });

  it('zeigt bei fehlender Folgephase keine Qualifikationsplätze', () => {
    const result = getGroupQualificationHints(groups, 0);
    expect(result.projected.size).toBe(0);
    expect(result.possible.size).toBe(0);
  });
});
