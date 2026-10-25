import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BracketSetScores } from '@/components/BracketScoreStages';

const sets = [
  { number: 1, sideAScore: 11, sideBScore: 7 },
  { number: 2, sideAScore: 6, sideBScore: 11 },
  { number: 3, sideAScore: 11, sideBScore: 8 },
];

describe('K.-o.-Brackets: Hervorhebung einzelner Satzgewinner', () => {
  it('betont nur die gewonnenen Sätze der ersten Seite', () => {
    const html = renderToStaticMarkup(createElement(BracketSetScores, { sets, sideIndex: 0 }));
    expect(html).toBe(
      '<span class="bracket-set-score is-set-winner">11</span>' +
      '<span class="bracket-set-score">6</span>' +
      '<span class="bracket-set-score is-set-winner">11</span>',
    );
  });

  it('hebt einen gewonnenen Satz auch beim späteren Matchverlierer hervor', () => {
    const html = renderToStaticMarkup(createElement(BracketSetScores, { sets, sideIndex: 1 }));
    expect(html).toBe(
      '<span class="bracket-set-score">7</span>' +
      '<span class="bracket-set-score is-set-winner">11</span>' +
      '<span class="bracket-set-score">8</span>',
    );
  });

  it('hebt unentschiedene oder noch nicht entschiedene Satzstände nicht hervor', () => {
    const html = renderToStaticMarkup(createElement(BracketSetScores, {
      sets: [{ number: 1, sideAScore: 10, sideBScore: 10 }],
      sideIndex: 0,
    }));
    expect(html).toBe('<span class="bracket-set-score">10</span>');
  });

  it('funktioniert auch für das Spiel um Platz 3 und andere Satzsportarten', () => {
    const html = renderToStaticMarkup(createElement(BracketSetScores, {
      sets: [{ number: 1, sideAScore: 21, sideBScore: 19 }, { number: 2, sideAScore: 18, sideBScore: 21 }],
      sideIndex: 1,
    }));
    expect(html).toContain('<span class="bracket-set-score">19</span>');
    expect(html).toContain('<span class="bracket-set-score is-set-winner">21</span>');
  });
});
