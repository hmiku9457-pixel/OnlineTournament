import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TournamentPauseBanner } from '@/components/TournamentPauseBanner';

function markup(ready: boolean) {
  return renderToStaticMarkup(createElement(TournamentPauseBanner, {
    stageName: 'Mittagspause', overnight: false,
    note: 'Nach der Pause startet die K.-o.-Phase',
    resumeAt: new Date(2026, 9, 31, 14, 30, 0), now: new Date(2026, 9, 31, 14, 14, 30).getTime(),
    ready,
    onViewDetails: () => {},
    onFinish: () => {},
  }));
}

describe('Sichtbare Pauseninfo für alle Turnierleitungs-Tabs', () => {
  it('shows the remaining time, phase and resumption in a persistent banner', () => {
    const html = markup(false);
    expect(html).toContain('control-pause-alert');
    expect(html).toContain('director-pause-banner');
    expect(html).toContain('TURNIERPAUSE LÄUFT');
    expect(html).toContain('Mittagspause');
    expect(html).toContain('15:30');
    expect(html).not.toContain('⏸');
    expect(html).toContain('14:30');
    expect(html).toContain('Nach der Pause startet die K.-o.-Phase');
    expect(html).toContain('Vorzeitig beenden');
    expect(html).toContain('Pausendetails');
    expect(html).toContain('role="timer"');
    expect(html).toContain('aria-live="off"');
  });
  it('changes to a clearly actionable state when the time has elapsed', () => {
    const html = markup(true);
    expect(html).toContain('is-ready');
    expect(html).toContain('PAUSENZEIT ABGELAUFEN');
    expect(html).toContain('Freigabe möglich');
    expect(html).toContain('Pause beenden');
    expect(html).not.toContain('Vorzeitig beenden');
  });
  it('supports a multi-day interruption', () => {
    const html = renderToStaticMarkup(createElement(TournamentPauseBanner, {
      stageName: 'Übernachtpause', overnight: true,
      resumeAt: new Date(2026, 10, 1, 9, 0, 0),
      now: new Date(2026, 9, 31, 23, 0, 0).getTime(),
      ready: false, onViewDetails: () => {}, onFinish: () => {},
    }));
    expect(html).toContain('SPIELTAGSENDE AKTIV');
    expect(html).toContain('10:00:00');
  });
});
