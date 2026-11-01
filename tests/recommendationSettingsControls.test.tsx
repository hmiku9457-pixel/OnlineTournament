import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecommendationDurationPicker, formatRecommendationDuration, normalizeRecommendationDuration } from '@/components/RecommendationDurationPicker';
import { RecommendationNumberStepper } from '@/components/RecommendationNumberStepper';
import { recommendTournamentFormats } from '@/engine/recommendations';

describe('recommendation settings numeric controls', () => {
  it('renders stepper buttons on both sides of an editable numeric field', () => {
    const html = renderToStaticMarkup(createElement(RecommendationNumberStepper, {
      id: 'max-groups', label: 'Maximale Gruppenanzahl',
      value: 5, min: 2, max: 12, onChange: () => {},
    }));
    expect(html).toContain('Maximale Gruppenanzahl verringern');
    expect(html).toContain('Maximale Gruppenanzahl erhöhen');
    expect(html).toContain('id="max-groups"');
    expect(html).toContain('value="5"');
    const atMin = renderToStaticMarkup(createElement(RecommendationNumberStepper, {
      id: 'max-groups', label: 'Maximale Gruppenanzahl',
      value: 2, min: 2, max: 12, onChange: () => {},
    }));
    expect(atMin).toMatch(/aria-label="Maximale Gruppenanzahl verringern"[^>]*disabled=""/);
  });

  it('formats the selected time as a duration, validates hours/minutes and opens a dialog', () => {
    expect(formatRecommendationDuration(210)).toBe('3 Std. 30 Min.');
    expect(formatRecommendationDuration(120)).toBe('2 Std.');
    expect(formatRecommendationDuration(45)).toBe('45 Min.');
    expect(normalizeRecommendationDuration(3, 30)).toBe(210);
    expect(normalizeRecommendationDuration(0, 15)).toBe(15);
    expect(normalizeRecommendationDuration(0, 0)).toBeNull();
    expect(normalizeRecommendationDuration(24, 0)).toBeNull();
    expect(normalizeRecommendationDuration(2, 60)).toBeNull();
    const html = renderToStaticMarkup(createElement(RecommendationDurationPicker, {
      value: 210, onChange: () => {},
    }));
    expect(html).toContain('03:30');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('Geplante Turnierdauer einstellen');
  });

  it('prefers the configured target and fills with longer proposals up to five', () => {
    const input = { playerCount: 19, tableCount: 4, minimumMatches: 4, sport: 'table_tennis', matchDurationMinutes: 5 };
    const short = recommendTournamentFormats(input, { preferredDurationMinutes: 60 });
    expect(short).toHaveLength(5);
    expect(short.every((item) => item.estimatedDurationMinutes > 60)).toBe(true);
    const long = recommendTournamentFormats(input, { preferredDurationMinutes: 600 });
    expect(long).toHaveLength(5);
    expect(long.every((item) => item.estimatedDurationMinutes <= 600)).toBe(true);
    expect(long[0].estimatedDurationMinutes).toBeGreaterThan(0);
  });
});
