import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.HOMEPAGE_PLAYWRIGHT_PATH || 'playwright');
const fixture=`
export class Component { callbacks=[]; load(){} register(fn){this.callbacks.push(fn)} registerDomEvent(el,type,fn){el.addEventListener(type,fn);this.callbacks.push(()=>el.removeEventListener(type,fn))} unload(){this.callbacks.forEach(fn=>fn())} }
export class PluginSettingTab { hide(){} }
export class AbstractInputSuggest {}
export class TFile {}
export class Notice {constructor(text){window.notices.push(text)}}
export const setIcon=(el,icon)=>{el.textContent=icon==='grip-vertical'?'⋮⋮':icon};
export const normalizePath=p=>p;
export const setTooltip=(el,label)=>el.title=label;
export class Setting {
 constructor(parent){this.settingEl=parent.createDiv({cls:'setting-item'});this.nameEl=this.settingEl.createDiv({cls:'setting-item-name'});this.controlEl=this.settingEl.createDiv({cls:'setting-item-control'});}
 setName(text){this.nameEl.textContent=text;return this} setDesc(){return this} setHeading(){return this} then(fn){fn(this);return this}
 addText(fn){const e=this.controlEl.createEl('input');const c={inputEl:e,setValue(v){e.value=v;return c},setPlaceholder(v){e.placeholder=v;return c},setDisabled(v){e.disabled=v;return c},onChange(f){e.addEventListener('input',()=>f(e.value));return c}};fn(c);return this}
 addDropdown(fn){const e=this.controlEl.createEl('select');const c={selectEl:e,addOption(v,t){e.createEl('option',{value:v,text:t});return c},setValue(v){e.value=v;return c},setDisabled(v){e.disabled=v;return c},onChange(f){e.addEventListener('change',()=>f(e.value));return c}};fn(c);return this}
 addButton(fn){const e=this.controlEl.createEl('button');const c={buttonEl:e,setButtonText(v){e.textContent=v;return c},setIcon(v){e.textContent=v==='x'?'×':v;e.dataset.icon=v;return c},setTooltip(v){e.title=v;return c},setDisabled(v){e.disabled=v;return c},onClick(f){e.addEventListener('click',f);return c}};fn(c);return this}
}
`;

const js=await build({stdin:{contents:`export {HomepageSettingsTab} from './src/presentation/HomepageSettingsTab';export {Component} from 'obsidian';export {validatePluginData} from './src/domain/data/validation';export {AppStore} from './src/application/AppStore';export {HomepageApplicationFacade} from './src/application/HomepageApplicationFacade';export {LocalizationService} from './src/application/services/LocalizationService';export {createDefaultPluginData} from './src/domain/data/defaults';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',globalName:'Test',write:false,plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'js'}));}}]});
const css=await build({entryPoints:['src/styles/index.css'],bundle:true,write:false});
const labels=JSON.parse(await readFile('src/localization/locales/zh-cn.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:900,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.setContent('<main class="homepage-studio-settings"></main>');
await page.addStyleTag({content:':root{--input-height:30px;--size-4-1:4px;--size-4-2:8px;--size-4-3:12px;--size-4-4:16px;--size-4-5:20px;--border-width:1px}main{width:700px}.setting-item-control{display:flex}.setting-item{padding:8px 0}input{height:30px}button{height:30px}'+css.outputFiles[0].text});
await page.addScriptTag({content:`
HTMLElement.prototype.createEl=function(tag,o={}){const e=document.createElement(tag);if(o.cls)e.className=o.cls;if(o.text)e.textContent=o.text;if(o.value)e.value=o.value;for(const[k,v]of Object.entries(o.attr||{}))e.setAttribute(k,v);this.append(e);return e};
HTMLElement.prototype.createDiv=function(o){return this.createEl('div',o)};HTMLElement.prototype.createSpan=function(o){return this.createEl('span',o)};HTMLElement.prototype.setText=function(s){this.textContent=s};HTMLElement.prototype.addClass=function(...c){this.classList.add(...c)};
${js.outputFiles[0].text}
window.notices=[];window.writes=0;
const data=Test.createDefaultPluginData();
const periods=['A','B','C','D'].map((id,i)=>({id,label:id,startMinute:540+i*60,endMinute:570+i*60}));
data.plans.dailyTemplates=[{id:'daily',name:'Daily',periods}];
data.plans.weeklyTemplates=[{id:'weekly',name:'Weekly',days:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,day==='monday'?periods:day==='tuesday'?periods.map(p=>({...p,id:'tue-'+p.id})):[]]))}];
window.validation=Test.validatePluginData(data);window.store=new Test.AppStore({schedule(){writes++}});store.initializeReady(data,false);
window.app=new Test.HomepageApplicationFacade({},new Test.LocalizationService('zh'),store);
window.tab=Object.create(Test.HomepageSettingsTab.prototype);Object.assign(tab,{containerEl:document.querySelector('main'),settingsScope:new Test.Component(),application:app,pendingPlanTemplateFocusId:null});
const region=document.querySelector('main');const error=region.createEl('p');
tab.renderDailyPlanTemplate(region,data.plans.dailyTemplates[0],{editable:true,selectedTemplateId:'daily',templates:data.plans.dailyTemplates},${JSON.stringify(labels)},error);
tab.renderWeeklyPlanTemplate(region,data.plans.weeklyTemplates[0],{editable:true,selectedWeeklyTemplateId:'weekly'},${JSON.stringify(labels)},error);
window.order=()=>window.app.getPlanSettings().dailyTemplates[0].periods.map(p=>p.id);
`});
assert.equal(await page.evaluate(()=>window.validation.type),'valid');
const daily=page.locator('[data-template-id="daily"]');const rows=daily.locator('.homepage-studio-plan-period-existing');
assert.equal(await daily.getByRole('button',{name:'上移',exact:true}).count(),0);
await rows.nth(0).locator('.homepage-studio-plan-period-drag').dragTo(rows.nth(3),{targetPosition:{x:30,y:35}});
assert.deepEqual(await page.evaluate(()=>window.order()),['B','C','D','A']);
assert.equal(await page.evaluate(()=>window.writes),1);
assert.deepEqual(await rows.locator('input').evaluateAll(es=>es.filter((_,i)=>i%3===0).map(e=>e.value)),['B','C','D','A']);
await rows.nth(3).locator('.homepage-studio-plan-period-drag').focus();await page.keyboard.press('ArrowUp');assert.deepEqual(await page.evaluate(()=>window.order()),['B','C','A','D']);
const before=await page.evaluate(()=>window.order());await rows.nth(0).locator('input').first().fill('');await rows.nth(1).locator('.homepage-studio-plan-period-drag').dragTo(rows.nth(3));assert.deepEqual(await page.evaluate(()=>window.order()),before);
assert.ok((await rows.nth(0).locator('.homepage-studio-plan-period-error').innerText()).length>0);
await rows.nth(0).locator('input').first().fill('B');
const monday=page.locator('[data-template-id="weekly"] [data-weekday="monday"]');const tuesday=page.locator('[data-template-id="weekly"] [data-weekday="tuesday"]');
await monday.locator('.homepage-studio-plan-period-drag').first().dragTo(tuesday.locator('.homepage-studio-plan-period-existing').last());
assert.deepEqual(await page.evaluate(()=>window.app.getPlanSettings().weeklyTemplates[0].days.monday.map(p=>p.id)),['A','B','C','D']);
await monday.locator('.homepage-studio-plan-period-drag').first().dragTo(monday.locator('.homepage-studio-plan-period-existing').last(),{targetPosition:{x:30,y:35}});
assert.deepEqual(await page.evaluate(()=>window.app.getPlanSettings().weeklyTemplates[0].days.monday.map(p=>p.id)),['B','C','D','A']);
await page.addStyleTag({content:'main{width:300px}'});
const aligned=await rows.first().evaluate(row=>{const es=[row.querySelector('.homepage-studio-plan-period-drag'),...row.querySelectorAll('input'),row.querySelector('.homepage-studio-plan-period-actions button')];const centers=es.map(e=>{const r=e.getBoundingClientRect();return r.top+r.height/2});return Math.max(...centers)-Math.min(...centers)<2;});assert.equal(aligned,true);
assert.equal(await daily.locator('.homepage-studio-plan-period-new button').evaluate(e=>getComputedStyle(e).whiteSpace),'nowrap');
assert.deepEqual(errors,[]);await browser.close();process.stdout.write('PASS: actual plan rows support long-distance drag, one save, keyboard movement, invalid-input blocking, weekly-day isolation and single-line narrow layouts.\n');
