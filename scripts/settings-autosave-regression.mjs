import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.HOMEPAGE_PLAYWRIGHT_PATH || 'playwright');
const js=await build({stdin:{contents:`export {attachSettingsAutoSave} from './src/presentation/SettingsAutoSave'; export {validateDailyPlanName,validateDailyPeriods,parsePlanTime} from './src/domain/plans/dailyPlan';`,loader:'ts',resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'Auto',write:false});
const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.setContent('<style>#pane{height:220px;overflow:auto}.spacer{height:400px}</style><div id="pane"><div class="spacer"></div><div id="row"></div><div class="spacer"></div></div><button id="outside">Outside</button>');
await page.addScriptTag({content:`${js.outputFiles[0].text}
window.mount=(period=false)=>{
 if(window.dispose)window.dispose();
 const row=document.querySelector('#row');row.replaceChildren();
 window.source=period?['Work','09:00','10:00']:['Original'];window.writes=0;window.attempts=0;window.error='';
 const inputs=source.map(v=>{const e=document.createElement('input');e.value=v;row.append(e);return e});
 const cleanups=[];const scope={register(f){cleanups.push(f)},registerDomEvent(e,t,f){e.addEventListener(t,f);cleanups.push(()=>e.removeEventListener(t,f))}};
 Auto.attachSettingsAutoSave(inputs,scope,()=>{
  attempts++;const values=inputs.map(e=>e.value);
  let issue;
  if(period){const start=Auto.parsePlanTime(values[1]);const end=Auto.parsePlanTime(values[2]);issue=Auto.validateDailyPeriods([{id:'1',label:values[0],startMinute:start,endMinute:end},{id:'2',label:'Other',startMinute:660,endMinute:720}]);}
  else issue=Auto.validateDailyPlanName(values[0]);
  if(issue){error=issue;return false}source=values;writes++;return true;
 },()=>{error=''});
 window.dispose=()=>{while(cleanups.length)cleanups.pop()()};
};`});
const inputs=page.locator('input');
await page.evaluate(()=>window.mount());await inputs.fill('Rename');await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.writes),0);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.writes),1);assert.equal(await inputs.evaluate(e=>e===document.activeElement),true);
const position=await page.locator('#pane').evaluate(e=>e.scrollTop);await page.click('#outside');assert.equal(await page.locator('#pane').evaluate(e=>e.scrollTop),position);assert.equal(await page.evaluate(()=>window.writes),1);
await inputs.fill('Close value');await page.evaluate(()=>window.dispose());assert.deepEqual(await page.evaluate(()=>window.source),['Close value']);
await page.evaluate(()=>window.mount());await inputs.dispatchEvent('compositionstart');await inputs.fill('pin');await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>window.writes),0);await inputs.fill('拼音');await inputs.dispatchEvent('compositionend');await page.waitForTimeout(600);assert.deepEqual(await page.evaluate(()=>window.source),['拼音']);
await inputs.fill('');await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>window.error),'invalid-name');const attempts=await page.evaluate(()=>window.attempts);await page.click('#outside');await page.evaluate(()=>window.dispose());assert.equal(await page.evaluate(()=>window.attempts),attempts);assert.deepEqual(await page.evaluate(()=>window.source),['拼音']);
await page.evaluate(()=>window.mount(true));await inputs.nth(0).fill('Changed work');await inputs.nth(1).fill('invalid');await page.waitForTimeout(600);const before=await page.evaluate(()=>window.source);assert.equal(before[0],'Changed work');
await inputs.nth(0).fill('Atomic label');await inputs.nth(1).fill('11:15');await inputs.nth(2).fill('11:45');await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>window.error),'overlap');assert.deepEqual(await page.evaluate(()=>window.source),before);
await inputs.nth(1).fill('13:00');await inputs.nth(2).fill('14:00');await page.click('#outside');assert.deepEqual(await page.evaluate(()=>window.source),['Atomic label','13:00','14:00']);
await page.evaluate(()=>window.dispose());assert.deepEqual(errors,[]);await browser.close();process.stdout.write('PASS: debounce, blur/close, IME, invalid drafts, atomic period validation, overlap rejection, correction, focus and scroll preservation.\n');
