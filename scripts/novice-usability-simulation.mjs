import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const base = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';
const outcomes = [];

async function snapshot(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.creation-page-container');
    const heading = [...document.querySelectorAll('.wizard-card h2')].map(e => e.textContent?.trim()).filter(Boolean);
    const errors = [...document.querySelectorAll('[role="alert"],.field-error,.wizard-side-minimum-warning')]
      .filter(e => e.getBoundingClientRect().height > 0)
      .map(e => e.textContent?.trim()?.replace(/\s+/g, ' ').slice(0, 240)).filter(Boolean);
    const state = (() => {
      try { return JSON.parse(sessionStorage.getItem('online-tournament:creation-draft:v1:new'))?.draft; }
      catch { return null; }
    })();
    return {
      step: document.querySelector('.wizard-step.active strong')?.textContent?.trim(),
      heading,
      buttons: root?.querySelectorAll('button').length ?? 0,
      inputs: root?.querySelectorAll('input,select').length ?? 0,
      alerts: [...new Set(errors)].slice(0, 8),
      scroll: { vertical: document.documentElement.scrollHeight - window.innerHeight,
        horizontal: document.documentElement.scrollWidth - window.innerWidth },
      phaseTypes: state?.phaseDrafts?.map(x => x.type) ?? [],
      phaseCount: state?.phaseDrafts?.length ?? 0,
      savedParticipants: state?.participants?.length ?? 0,
      configuredDays: state?.plannedDays ?? null,
      selectedRecommendation: state?.selectedRecommendationId ?? null,
      createEnabled: (() => { const x=document.querySelector('.wizard-create-button'); return x ? !x.disabled : null; })(),
      nextEnabled: (() => { const x=document.querySelector('.wizard-continue-button'); return x ? !x.disabled : null; })(),
    };
  });
}
function trimmed(text, limit = 180) {
  return text.replace(/\s+/g, ' ').trim().slice(0, limit);
}
async function clickContinue(page) {
  const button = page.locator('.wizard-continue-button');
  if (!(await button.count())) return false;
  if (!(await button.isEnabled())) return false;
  await button.click();
  return true;
}
async function fillDate(page) {
  await page.locator('#tournament-date').click();
  await page.locator('.calendar-picker-dialog input[aria-label="Jahr"]').fill('2030');
  await page.locator('.calendar-picker-dialog select[aria-label="Monat"]').selectOption('10');
  await page.locator('.calendar-picker-day').filter({hasText:/^21$/}).click();
}
async function setNumberChoice(page, selector, number) {
  const group=page.getByRole('group',{name:selector});
  if (!(await group.count())) throw Error('Zahlenauswahl fehlt: '+selector);
  await group.getByRole('button',{name:String(number),exact:true}).click();
}
async function fillEntrants(page, count, kind) {
  for (let i=1; i<=count; i++) {
    if (kind==='DOUBLES') {
      await page.locator('#participant-first').fill('Spieler');
      await page.locator('#participant-last').fill(String(i)+'A');
      await page.locator('#participant-partner-first').fill('Spieler');
      await page.locator('#participant-partner-last').fill(String(i)+'B');
      await page.getByRole('button',{name:'Doppel hinzufügen'}).click();
    } else if (kind==='TEAMS') {
      await page.locator('#participant-first').fill('Mannschaft '+i);
      await page.getByRole('button',{name:'Mannschaft hinzufügen'}).click();
    } else {
      await page.locator('#participant-first').fill('Vorname');
      await page.locator('#participant-last').fill('Teilnehmer '+i);
      await page.getByRole('button',{name:'Spieler hinzufügen'}).click();
    }
  }
}
async function runTournament(config) {
  const result={case:config.name, data:config, observations:{}, pageErrors:[]};
  const context=await browser.newContext({viewport:{width:1366,height:768},timezoneId:'Europe/Berlin',locale:'de-DE'});
  const page=await context.newPage();
  page.setDefaultTimeout(11000);
  page.on('pageerror',e=>result.pageErrors.push(e.message));
  try {
    await page.goto(base+'/#/tournaments/new');
    await page.locator('#name').fill(config.name);
    await fillDate(page);
    await page.locator('#sport').selectOption(config.sport);
    if(config.discipline!=='SINGLES') {
      const discipline=page.locator('#discipline');
      if (await discipline.isEnabled()) await discipline.selectOption(config.discipline);
    }
    if(config.timed) await page.locator('#match-duration').fill(String(config.timed));
    if(config.tables) await setNumberChoice(page,/Anzahl (?:Tische|Plätze).*Pflichtfeld/,config.tables);
    if(config.minimum) await setNumberChoice(page,/Gewünschte Mindestspiele pro Teilnehmer/,config.minimum);
    result.observations.basics=await snapshot(page);
    if (!(await clickContinue(page))) throw Error('Schritt 1 blockiert');
    await page.locator('.participant-step').waitFor();
    if(config.novice) {
      // A new user first tries a half-complete participant entry.
      await page.locator('#participant-first').fill('Anna');
      await page.getByRole('button',{name:'Spieler hinzufügen'}).click();
      result.observations.incompleteAttempt=await snapshot(page);
      await page.locator('#participant-first').fill('');
    }
    await fillEntrants(page,config.count,config.discipline);
    result.observations.participants=await snapshot(page);
    if (!(await clickContinue(page))) throw Error('Schritt 2 blockiert');
    await page.locator('.format-step').waitFor();
    if (config.multiDay) await page.getByRole('radio',{name:'Mehrtägig'}).check();
    const recommendations=page.locator('.recommendation-list .recommendation');
    result.observations.recommendations = {
      ...(await snapshot(page)),
      texts:(await recommendations.allInnerTexts()).slice(0,5).map(t=>trimmed(t,280)),
    };
    let chosen='none';
    if (config.pick!=='none') {
      const texts=await recommendations.allInnerTexts();
      const pattern=config.pick === 'groups-ko' ? /Gruppen.*K.-o./i
        : config.pick === 'swiss' ? /Schweizer System/i
        : config.pick === 'ko' ? /Einfaches K.-o./i
        : config.pick === 'groups' ? /Gruppen/i
        : /./;
      const index=texts.findIndex(t=>pattern.test(trimmed(t,300)));
      if(index>=0) {
        await recommendations.nth(index).click();
        chosen=trimmed(texts[index],100);
      } else chosen='not-present';
    }
    result.observations.chosen=chosen;
    if (!(await clickContinue(page))) throw Error('Schritt 3 blockiert');
    await page.locator('.phase-wizard-step').waitFor();
    result.observations.phases = {
      ...(await snapshot(page)),
      visiblePhases: (await page.locator('.phase-config').allInnerTexts()).map(t=>trimmed(t,180)).slice(0,7),
    };
    if(!(await clickContinue(page))) {
      result.status='PHASES_BLOCKED';
      result.observations.phasesBlocked=await snapshot(page);
    } else {
      await page.locator('.schedule-wizard-step').waitFor();
      result.observations.review = {
        ...(await snapshot(page)),
        overview:trimmed(await page.locator('.creation-review-overview').innerText(),520),
      };
      result.status=await page.locator('.wizard-create-button').isEnabled() ? 'READY_TO_CREATE' : 'REVIEW_BLOCKED';
    }
  } catch(error) {
    result.status='ERROR';
    result.error=String(error).slice(0,600);
    try {result.observations.failure=await snapshot(page);}catch { /* error page */ }
  } finally {
    console.log('USABILITY_SCENARIO '+JSON.stringify(result));
    outcomes.push(result);
    await context.close();
  }
}
async function runNoviceStart() {
  const context=await browser.newContext({viewport:{width:1366,height:768},timezoneId:'Europe/Berlin',locale:'de-DE'});
  const page=await context.newPage();
  const out={case:'Novice starting with empty form',observations:{}};
  page.setDefaultTimeout(8000);
  try{
    await page.goto(base+'/#/tournaments/new');
    await page.locator('#name').waitFor();
    out.observations.empty=await snapshot(page);
    out.observations.fieldTexts=(await page.locator('.wizard-card label,.wizard-card .field-hint').allInnerTexts()).map(t=>trimmed(t,180)).slice(0,28);
    out.status='OBSERVED';
  }catch(error){out.status='ERROR';out.error=String(error).slice(0,400)}
  finally{console.log('USABILITY_SCENARIO '+JSON.stringify(out));outcomes.push(out);await context.close();}
}

try {
  await runNoviceStart();
  await runTournament({name:'Novize acht Tischtennisspieler',sport:'table_tennis',discipline:'SINGLES',count:8,tables:4,minimum:4,pick:'none',novice:true});
  await runTournament({name:'Vereinsmeisterschaft neunzehn',sport:'table_tennis',discipline:'SINGLES',count:19,tables:6,minimum:4,pick:'groups-ko'});
  await runTournament({name:'Schweizer Runde neun Spieler',sport:'table_tennis',discipline:'SINGLES',count:9,tables:4,minimum:3,pick:'swiss'});
  await runTournament({name:'Doppelturnier acht Paare',sport:'table_tennis',discipline:'DOUBLES',count:8,tables:4,minimum:3,pick:'groups-ko'});
  await runTournament({name:'Fussballturnier zwoelf Teams',sport:'football',discipline:'TEAMS',count:12,tables:2,minimum:3,timed:18,pick:'groups-ko'});
  await runTournament({name:'Mehrtaegige Meisterschaft vierundzwanzig',sport:'table_tennis',discipline:'SINGLES',count:24,tables:6,minimum:4,pick:'groups-ko',multiDay:true});
  console.log('USABILITY_SUMMARY '+JSON.stringify(outcomes.map(x=>({case:x.case,status:x.status,phaseCount:x.observations.phases?.phaseCount,create:x.observations.review?.createEnabled,error:x.error,pageErrors:x.pageErrors}))));
}finally{await browser.close()}
