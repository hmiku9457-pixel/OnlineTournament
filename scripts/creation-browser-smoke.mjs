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
  await page.reload();
  assert.equal(await page.locator('.participant-roster-row').count(), 4, 'draft survives browser reload');
  await next(page);
  await page.waitForSelector('.format-step');
  // Hiding a system from recommendations must not remove it from the editor.
  await page.locator('.format-toggle-group input').nth(2).uncheck();
  await next(page);
  await page.waitForSelector('.phase-wizard-step');
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
  await page.locator('.wizard-create-button').click();
  await page.waitForURL(/\/tournaments\/[^/]+\/control/, { timeout: 20000 });
  await page.locator('.control-hero-bar h1').waitFor({ state: 'visible', timeout: 20000 });
  assert.equal((await page.locator('.control-hero-bar h1').textContent())?.trim(), 'Browser-Smoke-Turnier');
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
  assert.equal(await page2.locator('.participant-roster-row').count(), 19,
    'confirmation adds exactly the missing test players');
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
  await page3.clock.fastForward(65000);
  await page3.waitForFunction(() => document.querySelector('.wizard-review-warning')?.textContent?.includes('Vergangenheit'));
  assert.equal(await page3.locator('.wizard-continue-button').isDisabled(), true,
    'a fixed start becomes invalid when the current time advances past it');
  await context3.close();

  // Discard confirmation must never erase the draft on cancel, backdrop or
  // Escape. Only the destructive modal button clears it and resets the wizard.
  const context4 = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page4 = await context4.newPage();
  await page4.goto(base + '/#/tournaments/new');
  await page4.locator('#name').fill('Diesen Entwurf nicht verlieren');
  await page4.waitForFunction(() =>
    localStorage.getItem('online-tournament:creation-draft:v1')?.includes('Diesen Entwurf nicht verlieren'));
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

  process.stdout.write('Creation wizard browser smoke tests passed.\n');
} finally {
  await browser.close();
}
