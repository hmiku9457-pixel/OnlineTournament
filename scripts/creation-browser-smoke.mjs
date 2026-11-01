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
  assert.match(await testDialog.innerText(), /Werden ergänzt:\\s*18/);
  await testDialog.getByRole('button', { name: 'Abbrechen' }).click();
  assert.equal(await page2.locator('.participant-roster-row').count(), 1, 'cancel leaves roster unchanged');
  await page2.getByRole('button', { name: '19 Testspieler erzeugen' }).click();
  await page2.getByRole('dialog', { name: '19 Testspieler erzeugen?' })
    .getByRole('button', { name: '18 Testspieler hinzufügen' }).click();
  assert.equal(await page2.locator('.participant-roster-row').count(), 19,
    'confirmation adds exactly the missing test players');
  await context2.close();
  process.stdout.write('Creation wizard browser smoke tests passed.\n');
} finally {
  await browser.close();
}
