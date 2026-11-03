import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const base = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';

async function next(page) {
  await page.locator('.wizard-continue-button').click();
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base + '/#/tournaments/new');
  await page.locator('.creation-page-container').waitFor();
  // Check the creation wizard is centered within the content area at
  // ultra-wide widths, while the main navigation stays at the far left.
  await page.setViewportSize({ width: 2560, height: 960 });
  const geometry = await page.evaluate(() => {
    const main = document.querySelector('.main')?.getBoundingClientRect();
    const container = document.querySelector('.creation-page-container')?.getBoundingClientRect();
    const sidebar = document.querySelector('.sidebar')?.getBoundingClientRect();
    if (!main || !container || !sidebar) return null;
    return { leftGap: container.left - main.left, rightGap: main.right - container.right,
      sidebarLeft: sidebar.left, sidebarRight: sidebar.right, maxWidth: container.width };
  });
  assert.ok(geometry, 'creation shell and sidebar must exist');
  assert.ok(Math.abs(geometry.leftGap - geometry.rightGap) <= 1,
    'wizard should have equal horizontal margins in the content area');
  assert.ok(geometry.maxWidth <= 1550, 'wizard must not exceed its readable maximum width');
  assert.equal(geometry.sidebarLeft, 0, 'navigation stays anchored to the left side');
  await page.setViewportSize({ width: 1440, height: 960 });
  // The original full description and its adjacent date hint reserve equal
  // vertical space, matching the alignment already used for sport/discipline.
  const alignedHints = await page.evaluate(() => {
    const date = document.querySelector('.wizard-date-hint');
    const time = document.querySelector('.wizard-start-hint');
    if (!date || !time) return null;
    return {
      dateMinHeight: getComputedStyle(date).minHeight,
      timeMinHeight: getComputedStyle(time).minHeight,
      dateHeight: date.getBoundingClientRect().height,
      timeHeight: time.getBoundingClientRect().height,
    };
  });
  assert.ok(alignedHints);
  assert.equal(alignedHints.dateMinHeight, alignedHints.timeMinHeight);
  assert.ok(alignedHints.dateHeight >= 3 * 12, 'date hint should reserve space for longer explanation');
  assert.ok(alignedHints.timeHeight >= 3 * 12, 'start hint should retain its original readable font size');
  await page.locator('#name').fill('Browser-Smoke-Turnier');
  await page.locator('#tournament-date').click();
  await page.locator('.calendar-picker-dialog input[aria-label="Jahr"]').fill('2030');
  await page.locator('.calendar-picker-dialog select[aria-label="Monat"]').selectOption('10');
  await page.locator('.calendar-picker-day').filter({ hasText: /^21$/ }).click();
  await page.locator('#sport').selectOption('table_tennis');
  assert.equal(await page.locator('#discipline').inputValue(), 'SINGLES');
  await page.getByRole('group', { name: 'Gewünschte Mindestspiele pro Teilnehmer (Pflichtfeld)' })
    .getByRole('button', { name: '4', exact: true }).click();
  await next(page);
  await page.waitForSelector('.participant-step');

  for (const [first, last] of [['Ada', 'Lovelace'], ['Grace', 'Hopper'], ['Alan', 'Turing'], ['Linus', 'Torvalds']]) {
    await page.locator('#participant-first').fill(first);
    await page.locator('#participant-last').fill(last);
    await page.getByRole('button', { name: 'Spieler hinzufügen' }).click();
  }
  assert.equal(await page.locator('.participant-roster-row').count(), 4);
  // Switching between saved participants must not silently discard edits.
  await page.getByRole('button', { name: 'Ada Lovelace bearbeiten' }).click();
  await page.locator('#participant-first').fill('Verändert');
  await page.getByRole('button', { name: 'Grace Hopper bearbeiten' }).click();
  const switchDialog = page.getByRole('dialog', { name: 'Ungespeicherte Teilnehmerdaten' });
  await switchDialog.waitFor();
  await switchDialog.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  assert.equal(await page.locator('#participant-first').inputValue(), 'Verändert');
  await page.getByRole('button', { name: 'Grace Hopper bearbeiten' }).click();
  await page.getByRole('dialog', { name: 'Ungespeicherte Teilnehmerdaten' })
    .getByRole('button', { name: 'Eingaben verwerfen' }).click();
  assert.equal(await page.locator('#participant-first').inputValue(), 'Grace');
  await page.locator('.participant-editor-head-actions').getByRole('button', { name: 'Abbrechen' }).click();
  // Switching wizard steps with an uncommitted participant opens our styled
  // confirmation, without silently discarding the entry.
  await page.locator('#participant-first').fill('Unfertig');
  await page.locator('.wizard-step').first().click();
  const leaveDialog = page.getByRole('dialog', { name: 'Ungespeicherte Teilnehmerdaten' });
  await leaveDialog.waitFor();
  await leaveDialog.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  assert.equal(await page.locator('#participant-first').inputValue(), 'Unfertig');
  await page.locator('.wizard-step').first().click();
  await page.getByRole('dialog', { name: 'Ungespeicherte Teilnehmerdaten' })
    .getByRole('button', { name: 'Eingaben verwerfen' }).click();
  await page.locator('.wizard-step').nth(1).click();
  assert.equal(await page.locator('#participant-first').inputValue(), '');
  await page.reload();
  await page.locator('.participant-roster-row').first().waitFor();
  assert.equal(await page.locator('.participant-roster-row').count(), 4, 'draft survives browser reload');
  await next(page);
  await page.waitForSelector('.format-step');
  const step3Layout = await page.evaluate(() => {
    const settings = document.querySelector('.format-settings-panel')?.getBoundingClientRect();
    const recommendations = document.querySelector('.recommendation-list')?.getBoundingClientRect();
    return settings && recommendations ? { settingsTop: settings.top, settingsBottom: settings.bottom,
      recommendationsTop: recommendations.top, settingsWidth: settings.width,
      recommendationsWidth: recommendations.width } : null;
  });
  assert.ok(step3Layout, 'settings and recommendations must both be rendered');
  const getTimeFieldPositions = () => page.evaluate(() => {
    const duration = document.querySelector('.tournament-mode-setting .recommendation-duration-field')?.getBoundingClientRect();
    const end = document.querySelector('.tournament-mode-setting .recommendation-end-time-field')?.getBoundingClientRect();
    return duration && end ? { durationX: duration.x, endX: end.x,
      durationY: duration.y, endY: end.y, durationWidth: duration.width,
      endWidth: end.width } : null;
  });
  const planningControls = await page.evaluate(() => {
    const root = document.querySelector('.tournament-mode-setting');
    const day = root?.querySelector('.recommendation-period-column');
    const stepper = day?.querySelector('.recommendation-number-stepper');
    const target = root?.querySelector('.recommendation-target-options');
    const duration = root?.querySelector('.recommendation-duration-field .recommendation-duration-stepper');
    const end = root?.querySelector('.recommendation-end-time-field .recommendation-derived-value');
    const mode = root?.querySelector('.recommendation-target-choice');
    if (!day || !stepper || !target || !duration || !end || !mode) return null;
    const d = day.getBoundingClientRect();
    const fields = [stepper, target, duration, end].map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    return { availableWidth: d.width, dayStepperWidth: fields[0].w,
      modeWidth: mode.getBoundingClientRect().width, fields };
  });
  assert.ok(planningControls, 'the four planning controls must be present');
  assert.ok(planningControls.dayStepperWidth >= planningControls.availableWidth - 2,
    'the playing-day stepper fills its column instead of sitting in a narrow leftover strip');
  assert.ok(planningControls.fields.every(({h}) => Math.abs(h - 40) <= 2),
    'the day selector, time priority, duration and end time all have equal input heights');
  const planningRows = planningControls.fields;
  const singleRow = Math.abs(planningRows[3].y - planningRows[0].y) <= 2;
  if (singleRow) {
    assert.ok(planningRows.every((field, index) => index === 0
      || field.x > planningRows[index - 1].x),
    'at wide widths the planning controls remain in day, target, duration, end-time order');
  } else {
    assert.ok(Math.abs(planningRows[0].y - planningRows[1].y) <= 2
      && Math.abs(planningRows[2].y - planningRows[3].y) <= 2
      && planningRows[2].y > planningRows[0].y,
    `the responsive two-column layout must create two evenly aligned rows: ${JSON.stringify(planningRows)}`);
    assert.ok(planningRows[0].x < planningRows[1].x && planningRows[2].x < planningRows[3].x,
      'the two rows keep the intended control order without swapping inputs');
  }
  // The larger content area should produce the intended four-column layout.
  await page.setViewportSize({ width: 1700, height: 960 });
  const widePlanning = await page.evaluate(() =>
    [...document.querySelectorAll('.tournament-mode-setting > *')]
      .filter(element => !element.classList.contains('recommendation-linked-explanation'))
      .slice(0, 4)
      .map(element => {
        const r = element.getBoundingClientRect();
        return {x: r.x, y: r.y, width: r.width};
      }));
  assert.equal(widePlanning.length, 4);
  assert.ok(widePlanning.every((item, index) => index === 0
    || (Math.abs(item.y - widePlanning[0].y) <= 2 && item.x > widePlanning[index - 1].x)),
    `wide layout must show four stable columns: ${JSON.stringify(widePlanning)}`);
  await page.setViewportSize({ width: 1440, height: 960 });
  const initialPositions = await getTimeFieldPositions();
  assert.ok(initialPositions);
  assert.ok(initialPositions.durationX < initialPositions.endX,
    'the duration is always positioned left of the end time');
  assert.ok(Math.abs(initialPositions.durationY - initialPositions.endY) <= 2,
    'duration and end-time controls share one aligned settings row');
  assert.ok(step3Layout.settingsBottom <= step3Layout.recommendationsTop,
    'settings sit above, rather than to the right of, recommendations');
  assert.ok(Math.abs(step3Layout.settingsWidth - step3Layout.recommendationsWidth) <= 2,
    'proposals use the same full available width as the settings');
  // The quick-settings controls must be compact and readable, with a small
  // chip-style selection row rather than large native checkboxes.
  const quickSettings = await page.evaluate(() => {
    const panel = document.querySelector('.format-settings-panel');
    const primary = panel?.querySelector('.tournament-mode-setting');
    const numberFields = panel?.querySelector('.format-setting-fields');
    const systems = panel?.querySelector('.format-toggle-group');
    const rows = [primary, numberFields, systems].map((element) => element?.getBoundingClientRect());
    const chips = [...(panel?.querySelectorAll('.format-toggle') ?? [])];
    return {
      height: panel?.getBoundingClientRect().height ?? 0,
      rows: rows.map((r) => r ? { top:r.top, bottom:r.bottom } : null),
      systems: chips.length,
      allActive: chips.every((x) => x.querySelector('input')?.checked),
      chipHeight: chips[0]?.getBoundingClientRect().height ?? 0,
      chipBackground: chips[0] ? getComputedStyle(chips[0]).backgroundColor : '',
    };
  });
  assert.equal(quickSettings.systems, 4);
  assert.ok(quickSettings.height < 470, `quick settings should remain readable with both time-preference options: ${quickSettings.height}px`);
  assert.equal(quickSettings.allActive, true);
  assert.ok(quickSettings.chipHeight < 46);
  assert.notEqual(quickSettings.chipBackground, 'rgb(255, 255, 255)', 'active systems are highlighted chips');
  const systemsControl = page.locator('.format-toggle-group');
  await systemsControl.getByLabel('Schweizer System').uncheck();
  assert.equal(await systemsControl.getByLabel('Schweizer System').isChecked(), false);
  await systemsControl.getByLabel('Schweizer System').check();
  await page.locator('.format-help-details summary').click();
  assert.equal(await page.locator('.format-help-details').getAttribute('open'), '');
  await page.locator('.format-help-details summary').click();
  // Recommendation settings are directly editable and expose bounded
  // + / - actions. The duration is a soft preference, not a hard filter.
  assert.equal(await page.locator('#preferred-duration strong').innerText(), '3 Std. 30 Min.');
  await page.getByRole('button', { name: 'Geplante Turnierdauer um 15 Minuten erhöhen' }).click();
  assert.equal(await page.locator('#preferred-duration strong').innerText(), '3 Std. 45 Min.');
  await page.getByRole('button', { name: 'Geplante Turnierdauer um 15 Minuten verringern' }).click();
  assert.equal(await page.locator('#preferred-duration strong').innerText(), '3 Std. 30 Min.');
  await page.locator('#preferred-duration').click();
  const durationDialog = page.getByRole('dialog', { name: 'Geplante Turnierdauer' });
  await durationDialog.waitFor();
  await durationDialog.getByLabel(/^Stunden \(0–\d+\)$/).fill('2');
  await durationDialog.getByLabel('Minuten (0–59)').fill('10');
  await durationDialog.getByRole('button', { name: '+1 Min.' }).click();
  assert.equal(await durationDialog.getByLabel('Minuten (0–59)').inputValue(), '11');
  await durationDialog.getByRole('button', { name: '+5 Min.' }).click();
  assert.equal(await durationDialog.getByLabel('Minuten (0–59)').inputValue(), '16');
  await durationDialog.getByRole('button', { name: '+15 Min.' }).click();
  assert.equal(await durationDialog.getByLabel('Minuten (0–59)').inputValue(), '31');
  await durationDialog.getByRole('button', { name: '+1 Std.' }).click();
  assert.equal(await durationDialog.getByLabel(/^Stunden \(0–\d+\)$/).inputValue(), '03');
  assert.equal(await durationDialog.getByRole('group', { name: 'Turnierdauer verkürzen' }).getByRole('button').count(), 4);
  assert.equal(await durationDialog.getByRole('group', { name: 'Turnierdauer verlängern' }).getByRole('button').count(), 4);
  await durationDialog.getByRole('button', { name: '−1 Min.' }).click();
  assert.equal(await durationDialog.getByLabel('Minuten (0–59)').inputValue(), '30');
  await durationDialog.getByRole('button', { name: '−5 Min.' }).click();
  assert.equal(await durationDialog.getByLabel('Minuten (0–59)').inputValue(), '25');
  await durationDialog.getByRole('button', { name: '−15 Min.' }).click();
  assert.equal(await durationDialog.getByLabel('Minuten (0–59)').inputValue(), '10');
  await durationDialog.getByRole('button', { name: '−1 Std.' }).click();
  assert.equal(await durationDialog.getByLabel(/^Stunden \(0–\d+\)$/).inputValue(), '02');
  assert.equal(await durationDialog.getByLabel('Minuten (0–59)').inputValue(), '10');
  assert.match(await durationDialog.locator('.recommendation-duration-preview').innerText(),
    /2 Std\. 10 Min\./, 'the preview follows both positive and negative corrections');
  await durationDialog.getByLabel(/^Stunden \(0–\d+\)$/).fill('0');
  await durationDialog.getByLabel('Minuten (0–59)').fill('15');
  assert.equal(await durationDialog.getByRole('button', { name: '−1 Min.' }).isDisabled(), true,
    'the 15-minute minimum disables subtraction');
  assert.equal(await durationDialog.getByRole('button', { name: '−1 Std.' }).isDisabled(), true);
  await durationDialog.getByRole('button', { name: '+1 Min.' }).click();
  assert.equal(await durationDialog.getByLabel('Minuten (0–59)').inputValue(), '16');
  await durationDialog.getByRole('button', { name: '−1 Min.' }).click();
  assert.equal(await durationDialog.getByLabel('Minuten (0–59)').inputValue(), '15');
  await durationDialog.getByLabel('Minuten (0–59)').fill('0');
  assert.equal(await durationDialog.getByRole('button', { name: 'Dauer übernehmen' }).isDisabled(), true,
    'an invalid manual entry must not be accepted');
  await durationDialog.getByRole('button', { name: '+1 Min.' }).click();
  assert.equal(await durationDialog.getByLabel('Minuten (0–59)').inputValue(), '15',
    'quick adjustments clamp back to the valid minimum');
  await durationDialog.getByLabel(/^Stunden \(0–\d+\)$/).fill('24');
  await durationDialog.getByLabel('Minuten (0–59)').fill('0');
  assert.equal(await durationDialog.getByRole('button', { name: '+1 Min.' }).isDisabled(), true,
    'the 24-hour maximum disables additions');
  await durationDialog.getByRole('button', { name: '−1 Min.' }).click();
  assert.equal(await durationDialog.getByLabel(/^Stunden \(0–\d+\)$/).inputValue(), '23');
  assert.equal(await durationDialog.getByLabel('Minuten (0–59)').inputValue(), '59');
  await durationDialog.getByLabel(/^Stunden \(0–\d+\)$/).fill('2');
  await durationDialog.getByLabel('Minuten (0–59)').fill('10');
  await durationDialog.getByRole('button', { name: 'Dauer übernehmen' }).click();
  assert.equal(await page.locator('#preferred-duration strong').innerText(), '2 Std. 10 Min.');
  assert.equal(await page.locator('#preferred-derived-end').innerText(),
    '11:10 Uhr', 'changing duration immediately updates the calculated end clock');
  assert.equal(await page.locator('#preferred-end-time').count(), 0,
    'the derived end must not offer a competing editable clock picker');
  await page.getByRole('button', { name: 'Geplante Turnierdauer um 15 Minuten erhöhen' }).click();
  assert.equal(await page.locator('#preferred-derived-end').innerText(), '11:25 Uhr');
  const lowerSettingsBeforeToggle = await page.locator('.format-setting-fields')
    .evaluate(node => node.getBoundingClientRect().top);
  await page.getByRole('radio', { name: 'Endzeit', exact: true }).check();
  const lowerSettingsAfterToggle = await page.locator('.format-setting-fields')
    .evaluate(node => node.getBoundingClientRect().top);
  assert.ok(Math.abs(lowerSettingsAfterToggle - lowerSettingsBeforeToggle) <= 2,
    'the end-day dropdown must not push the lower settings down when switching targets');
  const endModePositions = await getTimeFieldPositions();
  assert.ok(endModePositions);
  assert.ok(Math.abs(endModePositions.durationX - initialPositions.durationX) <= 1
    && Math.abs(endModePositions.endX - initialPositions.endX) <= 1
    && Math.abs(endModePositions.durationY - initialPositions.durationY) <= 2,
  'switching between time targets must not swap or move either field');
  assert.equal(await page.locator('#preferred-duration').count(), 0,
    'selecting an end time hides the editable duration control');
  assert.equal(await page.locator('#preferred-derived-duration').innerText(), '2 Std. 25 Min.',
    'switching modes preserves the current calculated preference');
  await page.locator('#preferred-end-time').click();
  const endTimeDialog = page.getByRole('dialog', { name: 'Gewünschte Endzeit einstellen' });
  await endTimeDialog.waitFor();
  await endTimeDialog.getByLabel('Stunde (0–23)').fill('14');
  await endTimeDialog.getByLabel('Minute (0–59)').fill('30');
  await endTimeDialog.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  assert.equal(await page.locator('#preferred-end-time .clock-picker-trigger-value').innerText(), '14:30');
  assert.equal(await page.locator('#preferred-derived-duration').innerText(), '5 Std. 30 Min.',
    'editing the end time immediately updates the calculated duration');
  assert.match(await page.locator('.recommendation-list .recommendation').first().innerText(),
    /Ende ca\./i);
  await page.reload();
  await page.waitForSelector('.format-step');
  assert.equal(await page.getByRole('radio', { name: 'Endzeit', exact: true }).isChecked(), true,
    'the selected editable time target survives draft recovery');
  assert.equal(await page.locator('#preferred-end-time .clock-picker-trigger-value').innerText(), '14:30');
  assert.equal(await page.locator('#preferred-derived-duration').innerText(), '5 Std. 30 Min.',
    'the non-editable duration remains derived after draft recovery');
  await page.getByRole('radio', { name: 'Turnierdauer', exact: true }).check();
  const durationModePositions = await getTimeFieldPositions();
  assert.ok(durationModePositions);
  assert.ok(Math.abs(durationModePositions.durationX - initialPositions.durationX) <= 1
    && Math.abs(durationModePositions.endX - initialPositions.endX) <= 1,
    'returning to duration mode keeps both fields at their original positions');
  assert.equal(await page.locator('#preferred-duration strong').innerText(), '5 Std. 30 Min.');
  assert.equal(await page.locator('#preferred-derived-end').innerText(), '14:30 Uhr',
    'switching back to duration retains the same derived end');
  const swissBefore = Number(await page.locator('#max-swiss-rounds').inputValue());
  const swissLimit = Number(await page.locator('#max-swiss-rounds').getAttribute('max'));
  if (swissBefore < swissLimit) {
    await page.getByRole('button', { name: 'Maximale Schweizer Runden erhöhen' }).click();
    assert.equal(Number(await page.locator('#max-swiss-rounds').inputValue()), swissBefore + 1);
    await page.getByRole('button', { name: 'Maximale Schweizer Runden verringern' }).click();
  } else {
    await page.getByRole('button', { name: 'Maximale Schweizer Runden verringern' }).click();
    assert.equal(Number(await page.locator('#max-swiss-rounds').inputValue()), swissBefore - 1);
    await page.getByRole('button', { name: 'Maximale Schweizer Runden erhöhen' }).click();
  }
  assert.equal(Number(await page.locator('#max-swiss-rounds').inputValue()), swissBefore);
  assert.equal(swissLimit, 3, 'four participants allow at most three distinct Swiss opponents');
  await page.reload();
  await page.waitForSelector('.format-step');
  assert.equal(await page.locator('#preferred-duration strong').innerText(), '5 Std. 30 Min.',
    'the coupled duration must persist in the saved creation draft');
  assert.match(await page.locator('.format-settings-head').innerText(),
    /Diese Einstellungen steuern nur die Empfehlungen/,
    'the general recommendation policy belongs in the settings panel');
  const firstSuggestion = page.locator('.recommendation-list .recommendation').first();
  assert.doesNotMatch(await firstSuggestion.innerText(),
    /Bis 3,5 Stunden bevorzugt; bei Bedarf/,
    'the first recommendation must not contain a generic list-selection policy');
  if (await firstSuggestion.locator('.recommendation-reason').count()) {
    assert.match(await firstSuggestion.locator('.recommendation-reason').innerText(),
      /Warum empfohlen: Erfüllt dein Mindestspielziel/,
      'an individual recommendation has a factual reason based on its metrics');
  }
  // Hiding a system from recommendations must not remove it from the editor.
  await page.locator('.format-toggle-group input').nth(2).uncheck();
  await next(page);
  await page.waitForSelector('.phase-wizard-step');
  assert.match(await page.locator('.phase-wizard-step .callout').first().innerText(),
    /Du stellst dein Turnier jetzt selbst zusammen/,
    'without a recommendation the wizard explains the manual workflow');
  assert.equal(await page.getByRole('button', { name: '+ Schweizer System' }).count(), 1,
    'disabled recommendation system is still available for manual phases');
  await page.getByRole('button', { name: '+ Jeder gegen jeden' }).click();
  await page.locator('.wizard-side-minimum-warning').waitFor();
  assert.match(await page.locator('.wizard-side-minimum-warning').innerText(), /Mindestspielzahl nicht erreicht/);
  assert.match(await page.locator('.wizard-side-minimum-warning').innerText(), /Garantiert 3 von gewünschten 4/);
  await page.locator('.wizard-continue-button').click();
  await page.waitForSelector('.schedule-wizard-step');
  assert.match(await page.locator('.wizard-review-check').innerText(), /Die erste Phase garantiert nur 3/);
  assert.equal(await page.locator('.wizard-create-button').isEnabled(), true);

  // Creating from a named draft whose revision was advanced in another tab
  // must still create the tournament, while retaining the newer draft and
  // explaining the retained record instead of silently deleting it.
  await page.getByRole('button', { name: 'Entwurf speichern' }).click();
  await page.waitForURL(/draft=/);
  await page.locator('.wizard-create-button').waitFor();
  const changedDraftTab = await context.newPage();
  await changedDraftTab.goto(page.url());
  await changedDraftTab.locator('.wizard-step').first().click();
  await changedDraftTab.locator('#name').fill('Browser-Smoke-Turnier – geänderter Entwurf');
  await changedDraftTab.getByRole('button', { name: 'Entwurf speichern' }).click();
  await changedDraftTab.getByText('Entwurf gespeichert.', { exact: true }).waitFor();
  await changedDraftTab.close();
  await page.locator('.wizard-create-button').click();
  await page.getByRole('alertdialog', { name: 'Turnier erstellt – Entwurf bleibt erhalten' }).waitFor();
  assert.equal(await page.locator('.sidebar-draft-item').count(), 1);
  await page.getByRole('button', { name: 'Zur Turnierleitung' }).click();
  await page.waitForURL(/\/tournaments\/[^/]+\/control/, { timeout: 20000 });
  await page.locator('.control-hero-bar h1').waitFor({ state: 'visible', timeout: 20000 });
  assert.equal((await page.locator('.control-hero-bar h1').textContent())?.trim(), 'Browser-Smoke-Turnier');
  const localTournamentCopies = await page.evaluate(() => Array.from({ length: localStorage.length },
    (_, index) => localStorage.key(index)).filter((key) =>
    key?.startsWith('online-tournament:local-prototype-tournaments:v1')));
  assert.equal(localTournamentCopies.length, 0,
    'runtime must keep tournament records exclusively in IndexedDB, not in a localStorage mirror');


  // The director uses the SAME phase card as the wizard. Switching to the
  // participant tab must not discard the still-unsaved prestart edits.
  await page.getByRole('button', { name: 'Phasen vor Start bearbeiten' }).click();
  await page.locator('.is-prestart-phase-editor .phase-config').first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Keine Änderungen vorhanden' }).isDisabled(), true,
    'Opening and saving an unchanged phase plan must never destroy existing draws');
  assert.equal(await page.locator('.is-prestart-phase-editor .wizard-side-summary').count(), 0);
  await page.locator('.is-prestart-phase-editor .phase-config').first().click();
  const prestartBestOf = page.locator('.is-prestart-phase-editor .phase-bestof select').first();
  await prestartBestOf.selectOption('3');
  await page.locator('.control-tabs').getByRole('button', { name: 'Teilnehmer' }).click();
  await page.locator('.control-tabs').getByRole('button', { name: 'Phasen bearbeiten' }).click();
  assert.equal(await prestartBestOf.inputValue(), '3', 'prestart phase edits must survive director tab switches');
  // The sidebar is also protected; rejecting navigation must retain all edits.
  await page.locator('.sidebar-navigation').getByRole('link', { name: 'Alle Turniere anzeigen' }).click();
  const navigationDialog = page.getByRole('alertdialog', { name: 'Ungespeicherte Phasenänderungen' });
  await navigationDialog.waitFor();
  await navigationDialog.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  assert.equal(await prestartBestOf.inputValue(), '3');
  // Reload must reconstruct the UNSAVED phase plan from its versioned
  // session snapshot. Accept the native unload confirmation for this test.
  page.on('dialog', async (dialog) => { if (dialog.type() === 'beforeunload') await dialog.accept(); });
  await page.waitForFunction(() => Object.keys(sessionStorage).some((key) =>
    key.startsWith('online-tournament:prestart-recovery:') && sessionStorage.getItem(key)?.includes('"version":1')));
  await page.reload();
  await page.getByRole('button', { name: 'Phasen vor Start bearbeiten' }).click();
  await page.getByText('Deine zuvor ungespeicherte Phasenplanung wurde aus dieser Browsersitzung wiederhergestellt.', { exact: false }).waitFor();
  await page.locator('.is-prestart-phase-editor .phase-config').first().click();
  assert.equal(await page.locator('.is-prestart-phase-editor .phase-bestof select').first().inputValue(), '3');
  await page.getByRole('button', { name: 'Änderungen prüfen und speichern' }).click();
  await page.getByRole('alertdialog', { name: 'Vorstart-Planung wirklich übernehmen?' }).waitFor();
  await page.getByRole('button', { name: 'Ja, Phasen und Auslosung aktualisieren' }).click();
  await page.locator('.control-tabs').getByRole('button', { name: 'Übersicht' }).waitFor();

  // Recovery must not silently treat another tab's newer plan as its own
  // opening version: old unsaved edits remain visible but cannot be committed.
  await page.getByRole('button', { name: 'Phasen vor Start bearbeiten' }).click();
  await page.locator('.is-prestart-phase-editor .phase-config').first().click();
  await page.locator('.is-prestart-phase-editor .phase-bestof select').first().selectOption('7');
  await page.waitForFunction(() => Object.keys(sessionStorage).some((key) =>
    key.endsWith(':fingerprint') && key.includes('prestart-recovery')));
  const otherDirectorTab = await context.newPage();
  await otherDirectorTab.goto(page.url());
  await otherDirectorTab.getByRole('button', { name: 'Phasen vor Start bearbeiten' }).click();
  await otherDirectorTab.locator('.is-prestart-phase-editor .phase-config').first().click();
  await otherDirectorTab.locator('.is-prestart-phase-editor .phase-bestof select').first().selectOption('5');
  await otherDirectorTab.getByRole('button', { name: 'Änderungen prüfen und speichern' }).click();
  await otherDirectorTab.getByRole('button', { name: 'Ja, Phasen und Auslosung aktualisieren' }).click();
  await otherDirectorTab.locator('.control-tabs').getByRole('button', { name: 'Übersicht' }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Phasen vor Start bearbeiten' }).click();
  await page.getByText('Konflikt beim Wiederherstellen:', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Änderungen prüfen und speichern' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Arbeitsfassung verwerfen und aktuelle Planung öffnen' }).click();
  await page.getByRole('button', { name: 'Phasen vor Start bearbeiten' }).click();
  await page.locator('.is-prestart-phase-editor .phase-config').first().click();
  assert.equal(await page.locator('.is-prestart-phase-editor .phase-bestof select').first().inputValue(), '5');
  await otherDirectorTab.close();
  assert.deepEqual(errors, [], 'no browser runtime errors');
  await context.close();

  // Returning to Step 1 after creating a fresh draft must keep the confirmed
  // competition change explicit and preserve the participant list on cancel.
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  await page2.goto(base + '/#/tournaments/new');
  await page2.locator('#name').fill('Wechsel-Test');
  await page2.locator('#tournament-date').click();
  await page2.locator('.calendar-picker-dialog input[aria-label="Jahr"]').fill('2030');
  await page2.locator('.calendar-picker-dialog select[aria-label="Monat"]').selectOption('10');
  await page2.locator('.calendar-picker-day').filter({ hasText: /^22$/ }).click();
  await page2.locator('#sport').selectOption('table_tennis');
  // Custom numeric values are editable character by character, not clamped
  // to 13 the moment an input is temporarily blank.
  await page2.locator('.number-choice').first().getByRole('button', { name: 'Eigene' }).click();
  const customTables = page2.locator('.number-choice').first().locator('.custom-number-input');
  await customTables.fill('');
  assert.equal(await customTables.inputValue(), '');
  await customTables.pressSequentially('100');
  assert.equal(await customTables.inputValue(), '100');
  await customTables.blur();
  assert.equal(await customTables.inputValue(), '100');
  await next(page2);
  await page2.locator('#participant-first').fill('Ada');
  await page2.locator('#participant-last').fill('Lovelace');
  await page2.getByRole('button', { name: 'Spieler hinzufügen' }).click();
  await page2.locator('.wizard-step').first().click();
  await page2.locator('#discipline').selectOption('DOUBLES');
  await page2.getByRole('dialog', { name: 'Wettbewerbsart wechseln?' }).waitFor();
  assert.equal(await page2.locator('#discipline').inputValue(), 'SINGLES');
  await page2.getByRole('dialog', { name: 'Wettbewerbsart wechseln?' })
    .getByRole('button', { name: 'Abbrechen' }).click();
  assert.equal(await page2.locator('#discipline').inputValue(), 'SINGLES');
  await page2.locator('.wizard-step').nth(1).click();
  assert.equal(await page2.locator('.participant-roster-row').count(), 1);
  await page2.getByRole('button', { name: '19 Testspieler erzeugen' }).click();
  const testDialog = page2.getByRole('dialog', { name: '19 Testspieler erzeugen?' });
  await testDialog.waitFor();
  assert.match(await testDialog.innerText(), /Werden ergänzt:\s*18/);
  await testDialog.getByRole('button', { name: 'Abbrechen' }).click();
  assert.equal(await page2.locator('.participant-roster-row').count(), 1, 'cancel leaves roster unchanged');
  await page2.getByRole('button', { name: '19 Testspieler erzeugen' }).click();
  await page2.getByRole('dialog', { name: '19 Testspieler erzeugen?' })
    .getByRole('button', { name: '18 Testspieler hinzufügen' }).click();
  assert.equal((await page2.locator('.participant-roster-head .badge').innerText()).trim(), '19',
    'confirmation adds exactly the missing test players');
  assert.equal(await page2.locator('.participant-roster-row').count() <= 19, true,
    'a long participant list is paginated instead of expanding the document');
  await page2.getByRole('navigation', { name: 'Teilnehmerseiten' }).waitFor();
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    await page2.setViewportSize({ width, height });
    await page2.waitForTimeout(80);
    const layout = await page2.evaluate(() => {
      const list = document.querySelector('.participant-roster-multi');
      const roster = document.querySelector('.participant-roster-grid-card');
      const controls = document.querySelector('.creation-roster-pagination');
      if (!list || !roster) return null;
      const box = list.getBoundingClientRect();
      const tracks = getComputedStyle(list).gridTemplateColumns.split(/\s+/)
        .filter((track) => parseFloat(track) > 0).length;
      const cards = [...list.querySelectorAll('.participant-roster-row')];
      return {
        tracks, count: cards.length, width: box.width,
        documentOverflow: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
        rightmost: Math.max(0, ...cards.map((card) => card.getBoundingClientRect().right - box.left)),
        innerScroll: getComputedStyle(list).overflowY === 'auto' || getComputedStyle(list).overflowY === 'scroll',
        controlsReachable: Boolean(controls && controls.getBoundingClientRect().width > 0),
      };
    });
    assert.ok(layout, 'participant grid and pagination remain visible');
    assert.ok(layout.tracks >= 1 && layout.count >= 1, `measured grid tracks and cards at ${width}x${height}`);
    assert.ok(layout.rightmost <= layout.width + 2, `cards do not overflow grid at ${width}x${height}`);
    assert.equal(layout.innerScroll, false, `no nested participant scrolling at ${width}x${height}`);
    assert.ok(layout.controlsReachable || layout.count === 19,
      'pagination is accessible unless the entire roster fits on one page');
    if (layout.controlsReachable) await page2.getByRole('navigation', { name: 'Teilnehmerseiten' }).scrollIntoViewIfNeeded();
    if (height >= 1080) assert.ok(layout.documentOverflow <= 2,
      `full-height desktop roster should not cause a document scrollbar at ${width}x${height}: ${layout.documentOverflow}px`);
  }

  // Long names scroll inside fixed-height cards. Pagination must remain stable
  // and navigate backwards to precisely the previous page start.
  await page2.setViewportSize({ width: 1280, height: 600 });
  await page2.locator('#participant-first').fill('Alexander'.repeat(18));
  await page2.locator('#participant-last').fill('Lang');
  await page2.getByRole('button', { name: 'Spieler hinzufügen' }).click();
  await page2.waitForFunction(() => document.querySelector('.participant-roster-head .badge')?.textContent?.trim() === '20');
  const heights = await page2.locator('.participant-roster-row').evaluateAll((rows) =>
    rows.map((row) => row.getBoundingClientRect().height));
  assert.equal(new Set(heights.map(Math.round)).size, 1, 'every visible roster card has the same height');
  const nextRoster = page2.getByRole('navigation', { name:'Teilnehmerseiten' }).getByRole('button', { name:'Weiter' });
  const backRoster = page2.getByRole('navigation', { name:'Teilnehmerseiten' }).getByRole('button', { name:'Zurück' });
  const originalFirst = await page2.locator('.participant-list-number').first().innerText();
  const originalLast = Number(await page2.locator('.participant-list-number').last().innerText());
  if (await nextRoster.isEnabled()) {
    await nextRoster.click();
    assert.equal(Number(await page2.locator('.participant-list-number').first().innerText()), originalLast + 1);
    await backRoster.click();
    assert.equal(await page2.locator('.participant-list-number').first().innerText(), originalFirst,
      'back navigation returns to the actual previous first item');
  }
  while (await nextRoster.isEnabled()) await nextRoster.click();
  await page2.locator('.participant-name-marquee.is-running').first().waitFor();
  const longCard = page2.locator('.participant-roster-row').filter({ hasText: 'AlexanderAlexander' }).first();
  assert.equal(await longCard.evaluate((card) => getComputedStyle(card).height), '38px',
    'single-player and team cards are half the height of doubles cards');
  assert.equal(await longCard.locator('.participant-name-marquee strong').first().evaluate((el) =>
    getComputedStyle(el).whiteSpace), 'nowrap');
  await backRoster.click();
  // A sport change that reinterprets players as teams requires roster review.
  await page2.locator('.wizard-step').first().click();
  await page2.locator('#sport').selectOption('football');
  await page2.getByRole('dialog', { name: 'Sportart wechseln?' })
    .getByRole('button', { name: 'Sportart wechseln' }).click();
  await page2.locator('.wizard-step').nth(1).click();
  assert.equal(await page2.locator('.wizard-continue-button').isDisabled(), true);
  const reviewColors = await page2.locator('.participant-review-warning').evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    border: getComputedStyle(el).borderLeftColor,
    beforeRoster: el.getBoundingClientRect().bottom < document.querySelector('.participant-roster-grid-card').getBoundingClientRect().top,
  }));
  assert.equal(reviewColors.beforeRoster, true);
  assert.notEqual(reviewColors.background, 'rgb(249, 250, 251)', 'roster review has a highlighted warning background');
  await page2.getByRole('button', { name: 'Teilnehmerliste geprüft' }).click();
  assert.equal(await page2.locator('.wizard-continue-button').isDisabled(), false);
  await context2.close();

  // Date/time restrictions and live "Jetzt" mode with a deterministic
  // browser clock in Europe/Berlin, including a minute rollover and reload.
  const context3 = await browser.newContext({ timezoneId: 'Europe/Berlin' });
  const page3 = await context3.newPage();
  await page3.clock.install({ time: new Date('2030-11-21T12:34:20+01:00') });
  await page3.goto(base + '/#/tournaments/new');
  await page3.locator('#name').fill('Zeitgrenzen-Test');
  await page3.locator('#sport').selectOption('table_tennis');
  await page3.locator('#tournament-date').click();
  assert.equal(await page3.getByRole('button', { name: 'Vorheriger Monat' }).isDisabled(), true);
  assert.equal(await page3.locator('.calendar-picker-day').filter({ hasText: /^20$/ }).isDisabled(), true);
  await page3.getByRole('button', { name: 'Heute', exact: true }).click();
  assert.match(await page3.locator('.clock-picker-trigger-value').innerText(), /Jetzt · 12:34/,
    'choosing Heute automatically enables live current time');
  // Selecting a future date switches back to a fixed clock; selecting the
  // actual current calendar day must reactivate live mode.
  await page3.locator('#tournament-date').click();
  await page3.locator('.calendar-picker-day').filter({ hasText: /^22$/ }).click();
  assert.equal(await page3.locator('.clock-picker-trigger-value').innerText(), '12:34',
    'future dates do not remain linked to the live clock');
  await page3.locator('#tournament-date').click();
  await page3.locator('.calendar-picker-day').filter({ hasText: /^21$/ }).click();
  assert.match(await page3.locator('.clock-picker-trigger-value').innerText(), /Jetzt · 12:34/,
    'choosing the current date directly in the calendar enables live mode');

  await page3.locator('#tournament-start-time').click();
  const timeDialog = page3.locator('.clock-picker-dialog');
  assert.equal(await timeDialog.getByRole('button', { name: '11 Uhr', exact: true }).isDisabled(), true);
  assert.equal(await timeDialog.getByRole('button', { name: '12 Uhr', exact: true }).isDisabled(), false);
  await timeDialog.getByRole('button', { name: '12 Uhr', exact: true }).click();
  assert.equal(await timeDialog.getByRole('button', { name: '30 Minuten' }).isDisabled(), true);
  await timeDialog.getByRole('button', { name: '35 Minuten' }).isDisabled().then((value) => assert.equal(value, false));
  await timeDialog.locator('input').first().fill('11');
  assert.equal(await timeDialog.getByRole('button', { name: 'Übernehmen' }).isDisabled(), true,
    'manual entry cannot bypass the disabled past hours');
  await timeDialog.getByRole('button', { name: /^Jetzt/ }).click();
  assert.match(await page3.locator('.clock-picker-trigger-value').innerText(), /Jetzt · 12:34/);
  await page3.clock.fastForward(65000);
  await page3.waitForFunction(() => document.querySelector('.clock-picker-trigger-value')?.textContent?.includes('12:35'));
  await page3.reload();
  assert.match(await page3.locator('.clock-picker-trigger-value').innerText(), /Jetzt · 12:35/,
    'current-time mode survives saving and reloading the draft');

  await page3.locator('#tournament-start-time').click();
  await page3.locator('.clock-picker-manual input').first().fill('12');
  await page3.locator('.clock-picker-manual input').nth(1).fill('35');
  await page3.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  assert.equal(await page3.locator('.clock-picker-trigger-value').innerText(), '12:35');
  await next(page3);
  await page3.waitForSelector('.participant-step');
  await page3.clock.fastForward(65000);
  await page3.locator('.wizard-start-past-banner').waitFor({ state: 'visible' });
  assert.match(await page3.locator('.wizard-start-past-banner').innerText(),
    /Der geplante Turnierstart liegt in der Vergangenheit/);
  assert.equal(await page3.locator('.wizard-continue-button').isDisabled(), true,
    'a fixed start becomes invalid when the current time advances past it');
  await page3.reload();
  await page3.locator('.wizard-start-past-banner').waitFor({ state: 'visible' });
  assert.equal(await page3.locator('.wizard-continue-button').isDisabled(), true,
    'reloading a stale draft cannot bypass the expired-start warning');
  const warningBanner = page3.locator('.wizard-start-past-banner');
  const currentTimeButton = warningBanner.getByRole('button', {
    name: 'Stattdessen das aktuelle Datum und Uhrzeit verwenden', exact: true,
  });
  const settingsButton = warningBanner.getByRole('button', {
    name: 'Zur Datums und Uhrzeiteinstellung', exact: true,
  });
  assert.equal(await currentTimeButton.count(), 1);
  assert.equal(await settingsButton.count(), 1);
  await settingsButton.click();
  await page3.locator('#tournament-date').waitFor({ state: 'visible' });
  assert.equal(await page3.locator('.wizard-step.active .wizard-step-content strong').innerText(),
    'Grunddaten', 'settings button navigates back to the first creation step');
  assert.equal(await page3.evaluate(() => document.activeElement?.id), 'tournament-date',
    'settings button focuses the date picker after step navigation');
  assert.equal(await page3.locator('.clock-picker-trigger-value').innerText(), '12:35',
    'navigation does not silently alter the selected fixed time');
  await currentTimeButton.click();
  await page3.locator('.wizard-start-past-banner').waitFor({ state: 'detached' });
  assert.match(await page3.locator('.clock-picker-trigger-value').innerText(), /Jetzt · 12:36/,
    'banner action re-enables live current time and resolves the issue');
  await context3.close();

  // Selecting a visible recommendation applies it on navigation without any
  // confirmation. Removed/infeasible suggestions are automatically deselected.
  const recContext = await browser.newContext();
  const recPage = await recContext.newPage();
  await recPage.goto(base + '/#/tournaments/new');
  await recPage.locator('#name').fill('Empfehlungswechsel');
  await recPage.locator('#tournament-date').click();
  await recPage.locator('.calendar-picker-dialog input[aria-label="Jahr"]').fill('2030');
  await recPage.locator('.calendar-picker-dialog select[aria-label="Monat"]').selectOption('10');
  await recPage.locator('.calendar-picker-day').filter({ hasText: /^24$/ }).click();
  await recPage.locator('#sport').selectOption('table_tennis');
  await next(recPage);
  for (const [first, last] of [['Ada', 'Lovelace'], ['Grace', 'Hopper'], ['Alan', 'Turing'], ['Linus', 'Torvalds']]) {
    await recPage.locator('#participant-first').fill(first);
    await recPage.locator('#participant-last').fill(last);
    await recPage.getByRole('button', { name: 'Spieler hinzufügen' }).click();
  }
  await next(recPage);
  const options = recPage.locator('.recommendation-list .recommendation');
  assert.ok(await options.count() >= 2);
  const titles = await options.locator('.recommendation-phase-heading').allInnerTexts();
  assert.ok(titles.some((title) => title.includes('K.-o.-Phase')),
    'knockout remains available as a possible finish');
  assert.ok(titles.some((title) => !title.includes('K.-o.-Phase')),
    'the wizard also offers formats without a knockout finish');
  await options.first().click();
  assert.equal(await options.first().getAttribute('aria-pressed'), 'true');
  await options.nth(1).click();
  assert.equal(await options.first().getAttribute('aria-pressed'), 'false');
  assert.equal(await options.nth(1).getAttribute('aria-pressed'), 'true');
  assert.equal(await recPage.getByRole('alertdialog', { name: 'Übernahme der Empfehlung bestätigen?' }).count(), 0,
    'browsing recommendations never opens a confirmation');
  await options.nth(1).click();
  assert.equal(await options.nth(1).getAttribute('aria-pressed'), 'false',
    'clicking a selected recommendation deselects it');
  await options.first().click();
  await next(recPage);
  await recPage.locator('.phase-wizard-step').waitFor();
  assert.equal(await recPage.getByRole('alertdialog', { name: 'Übernahme der Empfehlung bestätigen?' }).count(), 0,
    'the first transfer to Step 4 needs no recommendation confirmation');
  const originalPhaseLabels = await recPage.locator('.phase-config').allInnerTexts();
  assert.ok(originalPhaseLabels.length >= 1);
  await recPage.locator('.wizard-step').nth(2).click();
  const alternatives = recPage.locator('.recommendation-list .recommendation');
  await alternatives.nth(1).click();
  assert.equal(await alternatives.nth(1).getAttribute('aria-pressed'), 'true');
  await next(recPage);
  await recPage.locator('.phase-wizard-step').waitFor();
  assert.equal(await recPage.getByRole('alertdialog', { name: 'Übernahme der Empfehlung bestätigen?' }).count(), 0,
    'choosing another offered recommendation also replaces the plan without a modal');
  assert.ok(await recPage.locator('.phase-config').count() >= 1);

  // A setting can remove a selected suggestion, including when a proposal
  // becomes infeasible rather than disappearing from the generator entirely.
  await recPage.locator('.wizard-step').nth(2).click();
  await recPage.locator('.recommendation-list .recommendation').filter({ hasText: 'K.-o.-Phase' }).first().click();
  assert.equal(await recPage.locator('.recommendation-list .recommendation[aria-pressed="true"]').count(), 1);
  await recPage.locator('.format-toggle-group').getByLabel('K.-o.-Phase').uncheck();
  assert.equal(await recPage.locator('.recommendation-list .recommendation[aria-pressed="true"]').count(), 0,
    'removing the selected format deselects its card');
  const beforeManualContinuation = await recPage.locator('.wizard-side-summary').innerText();
  await next(recPage);
  await recPage.locator('.phase-wizard-step').waitFor();
  assert.equal(await recPage.getByRole('alertdialog', { name: 'Übernahme der Empfehlung bestätigen?' }).count(), 0);
  assert.ok(await recPage.locator('.phase-config').count() >= 1,
    'proceeding without a selection retains the existing manual phase plan');
  assert.ok(beforeManualContinuation.length > 0);
  await recPage.locator('.wizard-step').nth(2).click();
  await recPage.locator('.format-toggle-group').getByLabel('K.-o.-Phase').check();
  // Make a chosen suggestion infeasible by requesting more days than it has
  // rounds. Its previously saved ID must not silently survive.
  await recPage.locator('.recommendation-list .recommendation:not(:disabled)').first().click();
  assert.equal(await recPage.locator('.recommendation-list .recommendation[aria-pressed="true"]').count(), 1);
  await recPage.locator('#planned-playing-days').fill('14');
  await recPage.locator('#planned-playing-days').blur();
  assert.equal(await recPage.locator('#planned-playing-days').inputValue(), '14');
  assert.equal(await recPage.locator('.recommendation-list .recommendation[aria-pressed="true"]').count(), 0,
    'an infeasible or no longer visible suggestion is automatically deselected');
  await recPage.locator('#planned-playing-days').fill('1');
  await recPage.locator('#planned-playing-days').blur();
  assert.equal(await recPage.locator('.recommendation-list .recommendation[aria-pressed="true"]').count(), 0,
    'the stale selection is not restored when the old settings return');
  await recContext.close();

  // A non-existent clock hour during the DST jump must explain the failure.
  const dstContext = await browser.newContext({ timezoneId: 'Europe/Berlin' });
  const dstPage = await dstContext.newPage();
  await dstPage.clock.install({ time: new Date('2026-11-02T14:00:00+01:00') });
  await dstPage.goto(base + '/#/tournaments/new');
  await dstPage.locator('#name').fill('Zeitumstellung');
  await dstPage.locator('#sport').selectOption('table_tennis');
  await dstPage.locator('#tournament-date').click();
  await dstPage.locator('.calendar-picker-dialog input[aria-label="Jahr"]').fill('2027');
  await dstPage.locator('.calendar-picker-dialog select[aria-label="Monat"]').selectOption('2');
  await dstPage.locator('.calendar-picker-day').filter({ hasText: /^28$/ }).click();
  await dstPage.locator('#tournament-start-time').click();
  await dstPage.locator('.clock-picker-manual input').first().fill('02');
  await dstPage.locator('.clock-picker-manual input').nth(1).fill('30');
  await dstPage.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  await dstPage.getByRole('alert', { name: '' }).filter({ hasText: /Zeitumstellung/ }).waitFor();
  assert.equal(await dstPage.locator('.wizard-continue-button').isDisabled(), true);
  await dstContext.close();

  // Discard confirmation must never erase the draft on cancel, backdrop or
  // Escape. Only the destructive modal button clears it and resets the wizard.
  const context4 = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page4 = await context4.newPage();
  await page4.goto(base + '/#/tournaments/new');
  await page4.locator('#name').fill('Diesen Entwurf nicht verlieren');
  await page4.waitForFunction(() =>
    sessionStorage.getItem('online-tournament:creation-draft:v1:new')?.includes('Diesen Entwurf nicht verlieren'));
  await page4.getByRole('button', { name: 'Entwurf verwerfen', exact: true }).click();
  const discardDialog = page4.getByRole('dialog', { name: 'Entwurf verwerfen?' });
  await discardDialog.waitFor();
  assert.match(await discardDialog.innerText(), /Teilnehmer und Phasen gehen verloren/);
  await discardDialog.getByRole('button', { name: 'Abbrechen' }).click();
  assert.equal(await page4.locator('#name').inputValue(), 'Diesen Entwurf nicht verlieren');
  await page4.reload();
  assert.equal(await page4.locator('#name').inputValue(), 'Diesen Entwurf nicht verlieren',
    'cancelling discard must preserve the saved draft after reload');
  await page4.getByRole('button', { name: 'Entwurf verwerfen', exact: true }).click();
  await page4.keyboard.press('Escape');
  assert.equal(await page4.getByRole('dialog', { name: 'Entwurf verwerfen?' }).count(), 0);
  await page4.getByRole('button', { name: 'Entwurf verwerfen', exact: true }).click();
  await page4.getByRole('dialog', { name: 'Entwurf verwerfen?' })
    .getByRole('button', { name: 'Entwurf endgültig verwerfen' }).click();
  await page4.waitForFunction(() => document.querySelector('#name')?.value === '');
  assert.equal(await page4.locator('#name').inputValue(), '',
    'confirming discard resets the creation wizard');
  assert.equal(await page4.locator('.wizard-step.active').count(), 1);
  await context4.close();

  // Editing a displayed team label must not destroy the originally saved
  // person's first and last names when switching back to a singles sport.
  const context5 = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page5 = await context5.newPage();
  await page5.goto(base + '/#/tournaments/new');
  await page5.locator('#name').fill('Sportarten Namenstest');
  await page5.locator('#tournament-date').click();
  await page5.locator('.calendar-picker-dialog input[aria-label="Jahr"]').fill('2030');
  await page5.locator('.calendar-picker-dialog select[aria-label="Monat"]').selectOption('10');
  await page5.locator('.calendar-picker-day').filter({ hasText: /^21$/ }).click();
  await page5.locator('#sport').selectOption('table_tennis');
  await next(page5);
  await page5.locator('#participant-first').fill('Anna');
  await page5.locator('#participant-last').fill('Müller');
  await page5.getByRole('button', { name: 'Spieler hinzufügen' }).click();
  await page5.locator('.wizard-step').first().click();
  await page5.locator('#sport').selectOption('football');
  await page5.getByRole('dialog', { name: 'Sportart wechseln?' })
    .getByRole('button', { name: 'Sportart wechseln' }).click();
  await page5.locator('.wizard-step').nth(1).click();
  await page5.getByRole('button', { name: 'Anna Müller bearbeiten' }).click();
  assert.equal(await page5.locator('#participant-first').inputValue(), 'Anna Müller');
  await page5.locator('#participant-first').fill('FC Nord');
  await page5.getByRole('button', { name: 'Änderungen speichern' }).click();
  await page5.locator('.wizard-step').first().click();
  await page5.locator('#sport').selectOption('table_tennis');
  await page5.getByRole('dialog', { name: 'Sportart wechseln?' })
    .getByRole('button', { name: 'Sportart wechseln' }).click();
  await page5.locator('.wizard-step').nth(1).click();
  await page5.getByRole('button', { name: 'Anna Müller bearbeiten' }).click();
  assert.equal(await page5.locator('#participant-first').inputValue(), 'Anna');
  assert.equal(await page5.locator('#participant-last').inputValue(), 'Müller');
  await context5.close();

  const draftsContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const draftPage = await draftsContext.newPage();
  await draftPage.goto(base + '/#/tournaments/new');
  await draftPage.locator('#name').fill('Entwurf A');
  await draftPage.getByRole('button', { name: 'Entwurf speichern' }).click();
  await draftPage.locator('.sidebar-draft-item').first().waitFor();
  assert.equal(await draftPage.locator('.sidebar-draft-item').count(), 1);
  await draftPage.reload();
  assert.equal(await draftPage.locator('#name').inputValue(), 'Entwurf A');
  // Saving an already saved draft adds a status line, but must not move
  // any of the three header buttons horizontally.
  const headerButtons = draftPage.locator('.creation-draft-buttons button');
  assert.equal(await headerButtons.count(), 3);
  const beforeSave = await Promise.all([0, 1, 2].map((index) => headerButtons.nth(index).boundingBox()));
  await draftPage.getByRole('button', { name: 'Entwurf speichern' }).click();
  await draftPage.getByText('Entwurf gespeichert.', { exact: true }).waitFor();
  const afterSave = await Promise.all([0, 1, 2].map((index) => headerButtons.nth(index).boundingBox()));
  for (let index = 0; index < 3; index++) {
    assert.ok(beforeSave[index] && afterSave[index]);
    assert.ok(Math.abs(beforeSave[index].x - afterSave[index].x) < 1,
      `Draft button ${index} shifted after saving an existing draft`);
  }
  await draftPage.locator('#name').fill('Ungespeicherte Fassung');
  await draftPage.waitForFunction(() => sessionStorage.getItem('online-tournament:creation-draft:v1:' +
    new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('draft'))?.includes('Ungespeicherte Fassung'));
  await draftPage.reload();
  await draftPage.getByRole('alertdialog', { name: 'Ungespeicherte Änderungen gefunden' }).waitFor();
  await draftPage.getByRole('button', { name: 'Gespeicherten Stand laden' }).click();
  await draftPage.waitForFunction(() => document.querySelector('#name')?.value === 'Entwurf A');
  await draftPage.getByRole('button', { name: 'Entwurf kopieren' }).click();
  await draftPage.waitForFunction(() => document.querySelectorAll('.sidebar-draft-item').length === 2);
  // Draft-list notification can arrive before the route has finished loading
  // the newly saved copy from IndexedDB.
  await draftPage.waitForFunction(() => document.querySelector('#name')?.value?.includes('(Kopie)'));
  assert.match(await draftPage.locator('#name').inputValue(), /Kopie/);

  // A second tab saving the same named draft must not silently replace the
  // first tab's edits. The stale tab gets a conflict modal and can copy it.
  const secondTab = await draftsContext.newPage();
  await secondTab.goto(draftPage.url());
  await secondTab.locator('#name').fill('Anderer Tab');
  await secondTab.getByRole('button', { name: 'Entwurf speichern' }).click();
  await secondTab.getByText('Entwurf gespeichert.', { exact: true }).waitFor();
  await draftPage.locator('#name').fill('Meine nicht gespeicherte Fassung');
  await draftPage.waitForFunction(() => Object.keys(sessionStorage).some((key) =>
    key.includes('online-tournament:creation-draft:v1:') && sessionStorage.getItem(key)?.includes('Meine nicht gespeicherte Fassung')));
  await draftPage.reload();
  await draftPage.getByRole('alertdialog', { name: 'Ungespeicherte Änderungen gefunden' })
    .getByRole('button', { name: 'Ungespeicherte Änderungen wiederherstellen' }).click();
  await draftPage.getByRole('button', { name: 'Entwurf speichern' }).click();
  await draftPage.getByRole('alertdialog', { name: 'Dieser Entwurf wurde zwischenzeitlich geändert' }).waitFor();
  await draftPage.getByRole('button', { name: 'Meine Fassung als Kopie speichern' }).click();
  await draftPage.waitForFunction(() => document.querySelectorAll('.sidebar-draft-item').length === 3);
  // Two genuinely concurrent writes must serialize in one IDB transaction.
  // Exactly one tab may update the shared revision; the other must conflict.
  const racingTab = await draftsContext.newPage();
  await racingTab.goto(draftPage.url());
  await draftPage.locator('#name').fill('Gleichzeitig A');
  await racingTab.locator('#name').fill('Gleichzeitig B');
  await Promise.all([
    draftPage.getByRole('button', { name: 'Entwurf speichern' }).click(),
    racingTab.getByRole('button', { name: 'Entwurf speichern' }).click(),
  ]);
  await Promise.all([draftPage, racingTab].map((tab) => tab.waitForFunction(() =>
    Boolean(document.querySelector('[aria-labelledby="draft-conflict-title"]'))
    || [...document.querySelectorAll('[role="status"]')].some((element) => element.textContent?.includes('Entwurf gespeichert.')))));
  const simultaneousConflicts = await draftPage.getByRole('alertdialog', { name: 'Dieser Entwurf wurde zwischenzeitlich geändert' }).count()
    + await racingTab.getByRole('alertdialog', { name: 'Dieser Entwurf wurde zwischenzeitlich geändert' }).count();
  assert.equal(simultaneousConflicts, 1, 'transactional competing saves must not both succeed');
  await racingTab.close();

  await secondTab.close();
  await draftsContext.close();

  // Old localStorage drafts are intentionally NOT imported by the current
  // IndexedDB-only development schema. Fresh drafts still persist normally.
  const freshContext = await browser.newContext();
  await freshContext.addInitScript(() => {
    localStorage.setItem('online-tournament:saved-creation-drafts:v1', JSON.stringify([
      { id: 'obsolete-draft', savedAt: new Date().toISOString(), draft: {} },
    ]));
  });
  const freshPage = await freshContext.newPage();
  await freshPage.goto(base + '/#/tournaments/new');
  await freshPage.waitForFunction(() => document.querySelector('.sidebar-drafts-section') === null);
  assert.equal(await freshPage.locator('.sidebar-draft-item').count(), 0);
  await freshPage.locator('#name').fill('Neuer Entwurf');
  await freshPage.getByRole('button', { name: 'Entwurf speichern' }).click();
  await freshPage.locator('.sidebar-draft-item').first().waitFor();
  await freshPage.reload();
  await freshPage.locator('.sidebar-draft-item').first().waitFor();
  assert.equal(await freshPage.locator('.sidebar-draft-item').count(), 1);

  // Current-format drafts are validated on read; one corrupted record must
  // not hide a separately saved valid draft or block its editor.
  await freshPage.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('online-tournament:named-creation-drafts:v2', 2);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put({ id: 'corrupt-current-draft', revision: 1,
        savedAt: new Date().toISOString(), draft: { step: 5 } });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await freshPage.reload();
  await freshPage.locator('.sidebar-draft-item').first().waitFor();
  assert.equal(await freshPage.locator('.sidebar-draft-item').count(), 1,
    'an invalid current draft must not hide a valid draft');
  await freshPage.getByRole('button', { name: 'Entwurf zurücksetzen' }).waitFor();
  freshPage.once('dialog', (dialog) => dialog.accept());
  await freshPage.getByRole('button', { name: 'Entwurf zurücksetzen' }).click();
  await freshPage.getByRole('button', { name: 'Entwurf zurücksetzen' }).waitFor({ state: 'hidden' });
  assert.equal(await freshPage.locator('.sidebar-draft-item').count(), 1);
  await freshContext.close();

  // Blocked IndexedDB must visibly warn even when there are no old cached
  // drafts; it must not fake an editable list from previous storage formats.
  const blockedContext = await browser.newContext();
  await blockedContext.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
  });
  const blockedPage = await blockedContext.newPage();
  await blockedPage.goto(base + '/#/tournaments/new');
  await blockedPage.locator('.sidebar-storage-warning').waitFor();
  assert.equal(await blockedPage.locator('.sidebar-draft-item').count(), 0);
  await blockedPage.locator('#name').fill('Temporär');
  await blockedPage.getByRole('button', { name: 'Entwurf speichern' }).click();
  await blockedPage.getByText('IndexedDB ist in diesem Browser nicht verfügbar.', { exact: false }).waitFor();
  await blockedContext.close();

  // A damaged current-format tournament must be quarantined, not crash the
  // entire catalog. The original bytes stay in IndexedDB until confirmation.
  const damagedContext = await browser.newContext();
  const damagedPage = await damagedContext.newPage();
  await damagedPage.goto(base + '/#/tournaments/new');
  await damagedPage.locator('.creation-page-container').waitFor();
  await damagedPage.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('online-tournament:local-state:v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('values', 'readwrite');
      const values = tx.objectStore('values');
      values.put({ key: 'online-tournament:local-prototype-tournaments:v1:index:v3',
        value: JSON.stringify(['damaged-tournament']) });
      values.put({ key: 'online-tournament:local-prototype-tournaments:v1:record:damaged-tournament',
        value: '{not valid json' });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await damagedPage.reload();
  await damagedPage.getByRole('heading', { name: 'Turnierspeicher überprüfen' }).waitFor();
  assert.equal(await damagedPage.getByRole('button', { name: 'Datensatz zurücksetzen' }).count(), 1);
  damagedPage.once('dialog', (dialog) => dialog.accept());
  await damagedPage.getByRole('button', { name: 'Datensatz zurücksetzen' }).click();
  await damagedPage.getByRole('heading', { name: 'Turnierspeicher überprüfen' }).waitFor({ state: 'hidden' });
  await damagedPage.reload();
  await damagedPage.locator('.creation-page-container').waitFor();
  assert.equal(await damagedPage.getByRole('heading', { name: 'Turnierspeicher überprüfen' }).count(), 0);
  await damagedContext.close();

  // Explicit multi-day creation: a round-compatible recommendation must
  // persist its mode, day count and scheduled day transitions through reload.
  const multiContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const multiPage = await multiContext.newPage();
  await multiPage.goto(base + '/#/tournaments/new');
  await multiPage.locator('#name').fill('Mehrtägige Vereinsrunde');
  await multiPage.locator('#tournament-date').click();
  await multiPage.locator('.calendar-picker-dialog input[aria-label="Jahr"]').fill('2030');
  await multiPage.locator('.calendar-picker-dialog select[aria-label="Monat"]').selectOption('10');
  await multiPage.locator('.calendar-picker-day').filter({ hasText: /^24$/ }).click();
  await multiPage.locator('#sport').selectOption('table_tennis');
  await next(multiPage);
  for (let index = 1; index <= 8; index++) {
    await multiPage.locator('#participant-first').fill('Spieler');
    await multiPage.locator('#participant-last').fill(String(index));
    await multiPage.getByRole('button', { name: 'Spieler hinzufügen' }).click();
  }
  await next(multiPage);
  assert.equal(await multiPage.locator('#planned-playing-days').inputValue(), '1');
  const lowerFilterTop = async () => multiPage.locator('.format-setting-fields')
    .evaluate(element => element.getBoundingClientRect().top);
  const initialFilterTop = await lowerFilterTop();
  assert.equal(await multiPage.locator('.recommendation-day-info').count(), 1,
    'forecast details are available in a compact info tooltip beside the day label');
  assert.match(await multiPage.locator('.recommendation-day-info').getAttribute('title') ?? '',
    /24 Stunden/);
  assert.equal(await multiPage.locator('.recommendation-linked-explanation').count(), 0,
    'the day forecast must not add a separate content row underneath the planning fields');
  await multiPage.getByRole('button', { name: 'Geplante Anzahl an Spieltagen erhöhen' }).click();
  assert.equal(await multiPage.locator('#planned-playing-days').inputValue(), '2');
  assert.match(await multiPage.locator('.recommendation-day-info').getAttribute('title') ?? '',
    /letzte Spieltag beginnt rechnerisch um 09:00 Uhr/);
  assert.equal(await multiPage.locator('.recommendation-linked-explanation').count(), 0,
    'a multi-day forecast belongs to the info tooltip rather than an extra layout row');
  assert.ok(Math.abs((await lowerFilterTop()) - initialFilterTop) <= 2,
    'changing from one to two days must not move the recommendation filters');
  await multiPage.getByRole('radio', { name: 'Endzeit', exact: true }).check();
  assert.ok(Math.abs((await lowerFilterTop()) - initialFilterTop) <= 2,
    'changing the time target must not move the recommendation filters');
  await multiPage.getByRole('radio', { name: 'Turnierdauer', exact: true }).check();
  assert.ok(Math.abs((await lowerFilterTop()) - initialFilterTop) <= 2);
  await multiPage.getByRole('button', { name: 'Geplante Anzahl an Spieltagen verringern' }).click();
  assert.equal(await multiPage.getByRole('alertdialog', { name: 'Turniermodus wechseln?' }).count(), 0,
    'reducing to a single day before phase configuration never shows a confirmation dialog');
  assert.equal(await multiPage.locator('#planned-playing-days').inputValue(), '1');
  assert.ok(Math.abs((await lowerFilterTop()) - initialFilterTop) <= 2,
    'changing back to one day must not move the recommendation filters');
  await multiPage.getByRole('button', { name: 'Geplante Anzahl an Spieltagen erhöhen' }).click();
  assert.equal(await multiPage.locator('#planned-playing-days').inputValue(), '2');
  // Four-day regression: changing the last-day clock must actually persist,
  // rather than closing the modal and silently retaining the old value.
  await multiPage.locator('#planned-playing-days').fill('4');
  await multiPage.locator('#planned-playing-days').blur();
  assert.equal(await multiPage.locator('#planned-playing-days').inputValue(), '4');
  await multiPage.getByRole('radio', { name: 'Endzeit', exact: true }).check();
  const beforeFourDayEnd = await multiPage.locator('#preferred-end-time .clock-picker-trigger-value').innerText();
  await multiPage.locator('#preferred-end-time').click();
  const fourDayDialog = multiPage.getByRole('dialog', { name: 'Gewünschte Endzeit einstellen' });
  await fourDayDialog.getByLabel('Stunde (0–23)').fill('18');
  await fourDayDialog.getByLabel('Minute (0–59)').fill('20');
  await fourDayDialog.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  assert.notEqual(beforeFourDayEnd, '18:20');
  assert.equal(await multiPage.locator('#preferred-end-time .clock-picker-trigger-value').innerText(), '18:20',
    'selecting 18:20 on the fourth day must update the clock');
  assert.equal(await multiPage.locator('.recommendation-end-time-field [role="alert"]').count(), 0);
  await multiPage.reload();
  await multiPage.locator('#preferred-end-time').waitFor();
  assert.equal(await multiPage.locator('#planned-playing-days').inputValue(), '4');
  assert.equal(await multiPage.locator('#preferred-end-time .clock-picker-trigger-value').innerText(), '18:20',
    'the four-day end time survives draft recovery');
  await multiPage.getByRole('radio', { name: 'Turnierdauer', exact: true }).check();
  await multiPage.locator('#preferred-duration').click();
  const resetDurationDialog = multiPage.getByRole('dialog', { name: 'Geplante Turnierdauer' });
  await resetDurationDialog.getByLabel(/^Stunden /).fill('3');
  await resetDurationDialog.getByLabel('Minuten (0–59)').fill('30');
  await resetDurationDialog.getByRole('button', { name: 'Dauer übernehmen' }).click();
  await multiPage.locator('#planned-playing-days').fill('2');
  await multiPage.locator('#planned-playing-days').blur();
  assert.equal(await multiPage.locator('#planned-playing-days').inputValue(), '2');
  assert.match(await multiPage.locator('.recommendation-derived-field .field-hint').innerText(),
    /Letzter Spieltag/, 'a multi-day calculated end applies to the last playing day');
  await multiPage.getByRole('radio', { name: 'Endzeit', exact: true }).check();
  await multiPage.locator('#preferred-end-time').click();
  const multiEndDialog = multiPage.getByRole('dialog', { name: 'Gewünschte Endzeit einstellen' });
  await multiEndDialog.getByLabel('Stunde (0–23)').fill('16');
  await multiEndDialog.getByLabel('Minute (0–59)').fill('30');
  await multiEndDialog.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  assert.match(await multiPage.locator('.recommendation-list .recommendation').first().innerText(),
    /Ende ca\./, 'multi-day recommendations show actual projected finishing dates');
  assert.equal(await multiPage.locator('#preferred-derived-duration').innerText(), '9 Std. 15 Min.',
    'editing the last playing-day clock updates the calculated active time');
  await multiPage.getByRole('radio', { name: 'Turnierdauer', exact: true }).check();
  await multiPage.getByRole('button', { name: 'Geplante Turnierdauer um 15 Minuten erhöhen' }).click();
  assert.equal(await multiPage.locator('#preferred-derived-end').innerText(), '16:45 Uhr',
    'extra active time is assigned to the final playing day');
  const dayControlGeometry = await multiPage.evaluate(() => {
    const days = document.querySelector('.tournament-day-count .recommendation-number-stepper');
    const parent = document.querySelector('.recommendation-period-column');
    const groups = document.querySelector('.format-setting-fields .recommendation-number-stepper');
    if (!days || !parent || !groups) return null;
    const d = days.getBoundingClientRect(), p = parent.getBoundingClientRect();
    const dayButtons = [...days.querySelectorAll('button')].map(button => button.getBoundingClientRect());
    const groupButtons = [...groups.querySelectorAll('button')].map(button => button.getBoundingClientRect());
    return { dayWidth: d.width, parentWidth: p.width,
      buttonWidths: dayButtons.map((r) => r.width),
      referenceWidths: groupButtons.map((r) => r.width) };
  });
  assert.ok(dayControlGeometry, 'days and groups steppers must both exist');
  assert.ok(Math.abs(dayControlGeometry.dayWidth - dayControlGeometry.parentWidth) <= 2,
    'the playing-day counter must fill the same column as other planning inputs');
  assert.ok(dayControlGeometry.dayWidth >= 150,
    'playing-day control must no longer be a tiny isolated 120px stepper');
  assert.ok(dayControlGeometry.buttonWidths.every((width) => Math.abs(width - 38) <= 1),
    'the day selector uses full-size, balanced +/- buttons');
  assert.ok(dayControlGeometry.referenceWidths.every((width) => Math.abs(width - 29) <= 1),
    'compact recommendation filter steppers remain unchanged');
  assert.equal(await multiPage.locator('#preferred-duration strong').innerText(), '9 Std. 30 Min.',
    'multi-day changes retain the linked active-time preference');
  await multiPage.locator('.recommendation-list .recommendation').first().click();
  await next(multiPage);
  await multiPage.locator('.phase-wizard-step').waitFor();
  assert.equal(await multiPage.getByRole('alertdialog', { name: 'Übernahme der Empfehlung bestätigen?' }).count(), 0);
  const daysInPlan = await multiPage.evaluate(() => [...document.querySelectorAll('.phase-config')].length);
  assert.ok(daysInPlan >= 1, 'multi-day recommendation produces editable phases');
  await multiPage.reload();
  await multiPage.locator('.phase-wizard-step').waitFor();
  await multiPage.locator('.wizard-step').nth(2).click();
  await multiPage.locator('.recommendation-list .recommendation').nth(1).click();
  assert.equal(await multiPage.getByRole('alertdialog', { name: 'Übernahme der Empfehlung bestätigen?' }).count(), 0);
  await next(multiPage);
  await multiPage.locator('.phase-wizard-step').waitFor();
  assert.equal(await multiPage.getByRole('alertdialog', { name: 'Übernahme der Empfehlung bestätigen?' }).count(), 0,
    'replacing a multi-day recommendation does not require a separate confirmation');
  await multiPage.locator('.wizard-step').nth(2).click();
  assert.equal(await multiPage.locator('#planned-playing-days').inputValue(), '2');
  const phasePlanBefore = await multiPage.evaluate(() =>
    JSON.parse(sessionStorage.getItem('online-tournament:creation-draft:v1:new')).draft.phaseDrafts
      .filter(phase => phase.type !== 'BREAK')
      .map(({ id, type, entrantCount, bestOf, swissRounds, groupCount, knockoutBestOf }) =>
        ({ id, type, entrantCount, bestOf, swissRounds, groupCount, knockoutBestOf })));
  await multiPage.getByRole('button', { name: 'Geplante Anzahl an Spieltagen verringern' }).click();
  assert.equal(await multiPage.getByRole('alertdialog', { name: 'Turniermodus wechseln?' }).count(), 0,
    'reducing the day count after Step 4 applies immediately without a confirmation modal');
  assert.equal(await multiPage.locator('#planned-playing-days').inputValue(), '1');
  const phasePlanAfter = await multiPage.evaluate(() =>
    JSON.parse(sessionStorage.getItem('online-tournament:creation-draft:v1:new')).draft.phaseDrafts
      .filter(phase => phase.type !== 'BREAK')
      .map(({ id, type, entrantCount, bestOf, swissRounds, groupCount, knockoutBestOf }) =>
        ({ id, type, entrantCount, bestOf, swissRounds, groupCount, knockoutBestOf })));
  assert.deepEqual(phasePlanAfter, phasePlanBefore,
    'automatic single-day conversion preserves configured competition and best-of settings');
  await multiPage.waitForFunction(() => {
    const raw = sessionStorage.getItem('online-tournament:creation-draft:v1:new');
    if (!raw) return false;
    const draft = JSON.parse(raw).draft;
    return draft?.tournamentMode === 'single' && draft.phaseDrafts.every((phase) =>
      !phase.dayBreaks?.length && !(phase.type === 'BREAK' && phase.breakKind === 'overnight'));
  });
  // Re-enter multi-day mode and distribute the already configured manual plan
  // rather than replacing participant counts, round counts or Best-of values.
  await multiPage.getByRole('button', { name: 'Geplante Anzahl an Spieltagen erhöhen' }).click();
  await multiPage.locator('.wizard-step').nth(3).click();
  const manualDayPlan = multiPage.locator('.phase-auto-day-plan');
  await manualDayPlan.waitFor();
  assert.match(await manualDayPlan.innerText(), /Spieltage verteilen/);
  const manualPhasesBefore = await multiPage.evaluate(() =>
    JSON.parse(sessionStorage.getItem('online-tournament:creation-draft:v1:new')).draft.phaseDrafts
      .filter((phase) => phase.type !== 'BREAK')
      .map(({ id, type, entrantCount, bestOf, swissRounds, groupCount, knockoutBestOf }) =>
        ({ id, type, entrantCount, bestOf, swissRounds, groupCount, knockoutBestOf })));
  await manualDayPlan.getByRole('button', { name: 'Spieltage automatisch verteilen' }).click();
  const distributeDialog = multiPage.getByRole('alertdialog', { name: 'Spieltage automatisch verteilen?' });
  await distributeDialog.waitFor();
  await distributeDialog.getByRole('button', { name: 'Neue Spieltage übernehmen' }).click();
  await multiPage.waitForFunction(() => {
    const draft = JSON.parse(sessionStorage.getItem('online-tournament:creation-draft:v1:new')).draft;
    return draft.tournamentMode === 'multi' && draft.phaseDrafts.some((phase) =>
      phase.dayBreaks?.length || (phase.type === 'BREAK' && phase.breakKind === 'overnight'));
  });
  const manualPhasesAfter = await multiPage.evaluate(() =>
    JSON.parse(sessionStorage.getItem('online-tournament:creation-draft:v1:new')).draft.phaseDrafts
      .filter((phase) => phase.type !== 'BREAK')
      .map(({ id, type, entrantCount, bestOf, swissRounds, groupCount, knockoutBestOf }) =>
        ({ id, type, entrantCount, bestOf, swissRounds, groupCount, knockoutBestOf })));
  assert.deepEqual(manualPhasesAfter, manualPhasesBefore,
    'automatic day distribution preserves configured competition fields and phase identities');

  // Reproduce a roster shrink that leaves a KO pause without a usable round.
  // The "keep for manual correction" path must still expose a removal control.
  await multiPage.evaluate(() => {
    const key = 'online-tournament:creation-draft:v1:new';
    const payload = JSON.parse(sessionStorage.getItem(key));
    const base = payload.draft.phaseDrafts.find((phase) => phase.type !== 'BREAK');
    payload.draft.phaseDrafts = [
      { ...base, id: 'phase-7001', label: 'Vorrunde', type: 'SWISS',
        entrantCount: 8, swissRounds: 3, inlineBreakAfterRound: 0,
        knockoutBestOf: [], dayBreaks: [], groupCount: 2 },
      { ...base, id: 'phase-7002', label: 'Finale', type: 'KNOCKOUT',
        entrantCount: 4, knockoutBestOf: [3, 3], inlineBreakAfterRound: 1,
        inlineBreakKind: 'minutes', dayBreaks: [], customEntrants: true },
    ];
    payload.draft.tournamentMode = 'single';
    payload.draft.step = 4;
    sessionStorage.setItem(key, JSON.stringify(payload));
  });
  await multiPage.reload();
  await multiPage.locator('.phase-wizard-step').waitFor();
  // Inline breaks in Step 4 use the same +/- minute control as standalone pauses.
  const inlineFinal = multiPage.locator('.phase-config').filter({ hasText: 'Finale' }).last();
  await inlineFinal.locator('.phase-config-head').click();
  await inlineFinal.locator('.phase-inline-break-card .phase-inline-break-header').click();
  const inlineMinutes = inlineFinal.getByRole('spinbutton', { name: 'Zwischenpausendauer in Minuten' });
  assert.equal(await inlineMinutes.inputValue(), '15');
  await inlineFinal.getByRole('button', { name: 'Zwischenpausendauer in Minuten erhöhen' }).click();
  assert.equal(await inlineMinutes.inputValue(), '16');
  await inlineFinal.getByRole('button', { name: 'Zwischenpausendauer in Minuten verringern' }).click();
  assert.equal(await inlineMinutes.inputValue(), '15');
  await inlineMinutes.fill('1');
  assert.equal(await inlineFinal.getByRole('button', { name: 'Zwischenpausendauer in Minuten verringern' }).isDisabled(), true);
  await inlineMinutes.fill('1440');
  assert.equal(await inlineFinal.getByRole('button', { name: 'Zwischenpausendauer in Minuten erhöhen' }).isDisabled(), true);
  await inlineMinutes.fill('15');
  await inlineMinutes.blur();
  await multiPage.waitForFunction(() => {
    const draft = JSON.parse(sessionStorage.getItem('online-tournament:creation-draft:v1:new')).draft;
    return draft.phaseDrafts.find(p => p.id === 'phase-7002')?.inlineBreakMinutes === 15;
  });
  await multiPage.locator('.wizard-step').nth(1).click();
  for (let index = 1; index <= 6; index++) {
    // Removing from the beginning keeps every next target on the visible page,
    // regardless of the real card-height-based pagination capacity.
    await multiPage.getByRole('button', { name: `Spieler ${index} entfernen` }).click();
  }
  const orphanDialog = multiPage.getByRole('alertdialog', { name: 'Abhängige Phasenänderungen bestätigen?' });
  await orphanDialog.waitFor();
  await multiPage.keyboard.press('Escape');
  assert.equal(await orphanDialog.isVisible(), true,
    'Escape cannot strand an already edited roster with unnormalized phases');
  await multiPage.mouse.click(2, 2);
  assert.equal(await orphanDialog.isVisible(), true,
    'backdrop dismiss cannot strand dependent phase changes');
  assert.match(await orphanDialog.innerText(), /K.-o.-Runden entfallen/);
  await multiPage.waitForFunction(() => {
    const saved = JSON.parse(sessionStorage.getItem('online-tournament:creation-draft:v1:new')).draft;
    return saved.pendingDependentChange?.source === 'roster'
      && saved.pendingDependentChange.previousRoster?.length === 3;
  });
  await multiPage.reload();
  await orphanDialog.waitFor();
  assert.match(await orphanDialog.innerText(), /K.-o.-Runden entfallen/,
    'pending roster adjustment is retained when a draft is reopened');
  await orphanDialog.getByRole('button', { name: 'Teilnehmeränderung zurücknehmen' }).click();
  assert.equal(await multiPage.locator('.participant-roster-row').count(), 3,
    'rollback restores the last roster entry and the associated phase configuration');
  await multiPage.getByRole('button', { name: 'Spieler 6 entfernen' }).click();
  await orphanDialog.waitFor();
  await orphanDialog.getByRole('button', { name: 'Pausen beibehalten und manuell korrigieren' }).click();
  await multiPage.locator('.wizard-step').nth(3).click();
  const orphanFinal = multiPage.locator('.phase-config').filter({ hasText: 'Finale' }).last();
  await orphanFinal.locator('.phase-config-head').click();
  await orphanFinal.getByRole('button', { name: 'Ungültige Zwischenpause entfernen' }).click();
  assert.equal(await orphanFinal.getByRole('button', { name: 'Ungültige Zwischenpause entfernen' }).count(), 0,
    'previously orphaned break can be explicitly removed after roster changes');
  await multiPage.locator('.wizard-step').nth(1).click();
  await multiPage.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  const undoConflict = multiPage.getByRole('alertdialog', { name: 'Geänderte Turnierplanung zurücksetzen?' });
  await undoConflict.waitFor();
  await undoConflict.getByRole('button', { name: 'Teilnehmer und Phasen wiederherstellen' }).click();
  await multiPage.waitForFunction(() => {
    const draft = JSON.parse(sessionStorage.getItem('online-tournament:creation-draft:v1:new')).draft;
    return draft.participants.length === 3 && draft.phaseDrafts.find((phase) => phase.id === 'phase-7002')?.inlineBreakAfterRound === 1;
  });
  // Removing a competition flanked by pauses must require a choice:
  // preserve the remaining named pause rather than silently dropping either.
  await multiPage.evaluate(() => {
    const key = 'online-tournament:creation-draft:v1:new';
    const payload = JSON.parse(sessionStorage.getItem(key));
    const basePhase = payload.draft.phaseDrafts[0];
    payload.draft.phaseDrafts = [
      { ...basePhase, id: 'phase-9101', label: 'Auftakt', type: 'ROUND_ROBIN',
        entrantCount: 3, inlineBreakAfterRound: 0, dayBreaks: [], knockoutBestOf: [] },
      { ...basePhase, id: 'phase-9102', label: 'Mittagspause', type: 'BREAK',
        entrantCount: 3, note: 'Verpflegung', breakKind: 'minutes', breakMinutes: 30,
        dayBreaks: [], inlineBreakAfterRound: 0, knockoutBestOf: [] },
      { ...basePhase, id: 'phase-9103', label: 'Zwischenrunde', type: 'SWISS',
        entrantCount: 3, swissRounds: 2, inlineBreakAfterRound: 0,
        dayBreaks: [], knockoutBestOf: [] },
      { ...basePhase, id: 'phase-9104', label: 'Kaffeepause', type: 'BREAK',
        entrantCount: 3, note: 'Treffen im Foyer', breakKind: 'minutes',
        breakMinutes: 20, dayBreaks: [], inlineBreakAfterRound: 0, knockoutBestOf: [] },
      { ...basePhase, id: 'phase-9105', label: 'Finale', type: 'KNOCKOUT',
        entrantCount: 2, knockoutBestOf: [3], inlineBreakAfterRound: 0, dayBreaks: [] },
    ];
    payload.draft.step = 4;
    payload.draft.hasVisitedPhaseStep = true;
    payload.draft.reviewRequiredPhaseIds = [];
    payload.draft.pendingDependentChange = null;
    sessionStorage.setItem(key, JSON.stringify(payload));
  });
  await multiPage.reload();
  await multiPage.locator('.phase-wizard-step').waitFor();
  const pauseCard = multiPage.locator('.phase-config').filter({ hasText: 'Mittagspause' });
  await pauseCard.locator('.phase-config-head').click();
  const pauseMinutes = pauseCard.getByRole('spinbutton', { name: 'Pausendauer in Minuten' });
  assert.equal(await pauseMinutes.inputValue(), '30');
  await pauseCard.getByRole('button', { name: 'Pausendauer in Minuten erhöhen' }).click();
  assert.equal(await pauseMinutes.inputValue(), '31',
    'standalone pause increases immediately by one minute');
  await pauseCard.getByRole('button', { name: 'Pausendauer in Minuten verringern' }).click();
  assert.equal(await pauseMinutes.inputValue(), '30',
    'standalone pause decreases immediately by one minute');
  await pauseMinutes.fill('1');
  assert.equal(await pauseCard.getByRole('button', { name: 'Pausendauer in Minuten verringern' }).isDisabled(), true);
  await pauseMinutes.fill('1440');
  assert.equal(await pauseCard.getByRole('button', { name: 'Pausendauer in Minuten erhöhen' }).isDisabled(), true);
  await pauseMinutes.fill('30');
  await pauseMinutes.blur();
  await multiPage.waitForFunction(() => {
    const draft = JSON.parse(sessionStorage.getItem('online-tournament:creation-draft:v1:new')).draft;
    return draft.phaseDrafts.find(p => p.id === 'phase-9102')?.breakMinutes === 30;
  });
  const middlePhase = multiPage.locator('.phase-config').filter({ hasText: 'Zwischenrunde' });
  await middlePhase.getByRole('button', { name: 'Entfernen', exact: true }).click();
  const firstConfirm = multiPage.getByRole('alertdialog', { name: 'Phase entfernen bestätigen' });
  await firstConfirm.waitFor();
  assert.match(await firstConfirm.innerText(), /Zwischenrunde/);
  await firstConfirm.getByRole('button', { name: 'Phase endgültig entfernen' }).click();
  const phaseDeletionChoice = multiPage.getByRole('alertdialog',
    { name: 'Benachbarte Pause beim Entfernen berücksichtigen?' });
  await phaseDeletionChoice.waitFor();
  assert.match(await phaseDeletionChoice.innerText(), /Mittagspause/);
  assert.match(await phaseDeletionChoice.innerText(), /Kaffeepause/);
  await phaseDeletionChoice.getByRole('button', { name: /Mittagspause.*zusätzlich entfernen/ }).click();
  assert.equal(await multiPage.locator('.phase-config').count(), 3);
  const coffee = multiPage.locator('.phase-config').filter({ hasText: 'Kaffeepause' });
  await coffee.getByRole('button', { name: 'Typ ändern' }).click();
  await coffee.locator('.phase-type-options').getByRole('button', { name: /Schweizer/ }).click();
  const conversion = multiPage.getByRole('alertdialog',
    { name: 'Pauseneinstellungen beim Phasentypwechsel verlieren?' });
  await conversion.waitFor();
  assert.match(await conversion.innerText(), /Treffen im Foyer/);
  await conversion.getByRole('button', { name: 'Pause beibehalten' }).click();
  assert.equal(await multiPage.locator('.phase-config').filter({ hasText: 'Kaffeepause' }).count(), 1);
  await coffee.locator('.phase-type-options').getByRole('button', { name: /Schweizer/ }).click();
  await conversion.getByRole('button', { name: 'Pauseneinstellungen verwerfen und Typ ändern' }).click();
  await multiPage.waitForFunction(() => {
    const draft = JSON.parse(sessionStorage.getItem('online-tournament:creation-draft:v1:new')).draft;
    const converted = draft.phaseDrafts.find((phase) => phase.id === 'phase-9104');
    return converted?.type === 'SWISS' && converted.note === '';
  });
  await multiContext.close();

  // A hidden time-only setting must not block a later set-based sport.
  const validityContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const validityPage = await validityContext.newPage();
  await validityPage.goto(base + '/#/tournaments/new');
  await validityPage.locator('#name').fill('Sportwechsel ohne versteckte Sperren');
  await validityPage.locator('#tournament-date').click();
  await validityPage.locator('.calendar-picker-dialog input[aria-label="Jahr"]').fill('2030');
  await validityPage.locator('.calendar-picker-dialog select[aria-label="Monat"]').selectOption('10');
  await validityPage.locator('.calendar-picker-day').filter({ hasText: /^24$/ }).click();
  await validityPage.locator('#sport').selectOption('football');
  await validityPage.locator('#match-duration').fill('45');
  await validityPage.locator('#venue-turnover').fill('300');
  assert.equal(await validityPage.locator('.wizard-continue-button').isEnabled(), false);
  await validityPage.locator('#venue-turnover').fill('5');
  await validityPage.locator('#sport').selectOption('basketball');
  assert.equal(await validityPage.locator('.wizard-continue-button').isEnabled(), false,
    'switching between timed sports requires reviewing the inherited match duration');
  await validityPage.getByRole('button', { name: 'Spieldauer und Wechselpuffer geprüft' }).click();
  assert.equal(await validityPage.locator('.wizard-continue-button').isEnabled(), true);
  await validityPage.locator('#sport').selectOption('table_tennis');
  assert.equal(await validityPage.locator('#venue-turnover').count(), 0);
  assert.equal(await validityPage.locator('.wizard-continue-button').isEnabled(), true,
    'hidden invalid turnover must not block set-based sports');
  await next(validityPage);
  for (const [first, last] of [['Ada', 'Lovelace'], ['Grace', 'Hopper']]) {
    await validityPage.locator('#participant-first').fill(first);
    await validityPage.locator('#participant-last').fill(last);
    await validityPage.getByRole('button', { name: 'Spieler hinzufügen' }).click();
  }
  await validityPage.evaluate(() => {
    const key = 'online-tournament:creation-draft:v1:new';
    const payload = JSON.parse(sessionStorage.getItem(key));
    const first = payload.draft.participants[0];
    payload.draft.participants.push({ ...first, id: 'participant-1000' });
    sessionStorage.setItem(key, JSON.stringify(payload));
  });
  await validityPage.reload();
  await validityPage.locator('.participant-roster-row').first().waitFor();
  assert.equal(await validityPage.locator('.participant-roster-row').count(), 3);
  // Exact undo restores even an originally duplicate roster entry.
  await validityPage.getByRole('button', { name: 'Ada Lovelace entfernen' }).nth(1).click();
  assert.equal(await validityPage.locator('.participant-roster-row').count(), 2);
  await validityPage.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  assert.equal(await validityPage.locator('.participant-roster-row').count(), 3);
  // More than one individual deletion remains undoable in last-in-first-out order.
  await validityPage.getByRole('button', { name: 'Grace Hopper entfernen' }).click();
  await validityPage.getByRole('button', { name: 'Ada Lovelace entfernen' }).first().click();
  assert.equal(await validityPage.locator('.participant-roster-row').count(), 1);
  await validityPage.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  assert.equal(await validityPage.locator('.participant-roster-row').count(), 2);
  await validityPage.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  assert.equal(await validityPage.locator('.participant-roster-row').count(), 3);
  // A pending, uncommitted edit is protected during bulk cleanup.
  await validityPage.getByRole('button', { name: 'Ada Lovelace bearbeiten' }).first().click();
  await validityPage.locator('#participant-first').fill('Augusta');
  await validityPage.getByRole('button', { name: 'Ada Lovelace entfernen' }).first().click();
  const singleDeleteDialog = validityPage.getByRole('alertdialog',
    { name: 'Ungespeicherte Teilnehmeränderungen verwerfen?' });
  await singleDeleteDialog.waitFor();
  await singleDeleteDialog.getByRole('button', { name: 'Bearbeitung fortsetzen' }).click();
  assert.equal(await validityPage.locator('#participant-first').inputValue(), 'Augusta');
  await validityPage.getByRole('button', { name: 'Alle fehlerhaften Einträge entfernen' }).click();
  const bulkDialog = validityPage.getByRole('alertdialog', { name: 'Fehlerhafte Teilnehmer entfernen?' });
  await bulkDialog.waitFor();
  assert.match(await bulkDialog.innerText(), /Ada Lovelace/);
  assert.match(await bulkDialog.innerText(), /ungespeicherten Änderungen/);
  await bulkDialog.getByRole('button', { name: 'Abbrechen' }).click();
  assert.equal(await validityPage.locator('#participant-first').inputValue(), 'Augusta',
    'canceling bulk cleanup preserves unfinished participant editing');
  await validityPage.getByRole('button', { name: 'Alle fehlerhaften Einträge entfernen' }).click();
  await bulkDialog.getByRole('button', { name: 'Änderungen verwerfen und Einträge entfernen' }).click();
  assert.equal(await validityPage.locator('.participant-roster-row').count(), 2);
  assert.equal(await validityPage.locator('#participant-first').inputValue(), '',
    'explicit bulk cleanup discards only acknowledged uncommitted changes');
  await validityPage.getByRole('button', { name: 'Gesamte Bereinigung rückgängig' }).click();
  assert.equal(await validityPage.locator('.participant-roster-row').count(), 3);
  await validityContext.close();

  // Doubles keep the original taller card, with one player per line.
  const doublesContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const doublesPage = await doublesContext.newPage();
  await doublesPage.goto(base + '/#/tournaments/new');
  await doublesPage.locator('#name').fill('Zwei Spieler pro Karte');
  await doublesPage.locator('#tournament-date').click();
  await doublesPage.locator('.calendar-picker-dialog input[aria-label="Jahr"]').fill('2030');
  await doublesPage.locator('.calendar-picker-dialog select[aria-label="Monat"]').selectOption('10');
  await doublesPage.locator('.calendar-picker-day').filter({ hasText: /^24$/ }).click();
  await doublesPage.locator('#sport').selectOption('table_tennis');
  await doublesPage.locator('#discipline').selectOption('DOUBLES');
  await next(doublesPage);
  await doublesPage.locator('#participant-first').fill('Erika');
  await doublesPage.locator('#participant-last').fill('Mustermann');
  await doublesPage.locator('#participant-partner-first').fill('Max');
  await doublesPage.locator('#participant-partner-last').fill('Beispiel');
  await doublesPage.getByRole('button', { name: 'Doppel hinzufügen' }).click();
  const doublesCard = doublesPage.locator('.participant-roster-row.is-double').first();
  await doublesCard.waitFor();
  assert.equal(await doublesCard.evaluate((el) => Math.round(el.getBoundingClientRect().height)), 76,
    'doubles cards keep their 76px height');
  assert.deepEqual(await doublesCard.locator('.participant-double-player strong:first-child').allInnerTexts(),
    ['Erika Mustermann', 'Max Beispiel']);
  const topNavigation = doublesPage.getByRole('navigation', { name: 'Teilnehmerseiten' });
  assert.equal(await topNavigation.evaluate((el) => Boolean(el.nextElementSibling?.classList.contains('participant-roster-multi'))), true,
    'pagination now sits between roster header and the first card');
  await doublesContext.close();

  process.stdout.write('Creation wizard browser smoke tests passed.\n');
} finally {
  await browser.close();
}
