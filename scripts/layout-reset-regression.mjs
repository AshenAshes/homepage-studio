import {build} from 'esbuild';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.HOMEPAGE_PLAYWRIGHT_PATH||'playwright');
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
 addToggle(fn){const e=this.controlEl.createEl('input');e.type='checkbox';const c={setValue(v){e.checked=v;return c},setDisabled(v){e.disabled=v;return c},onChange(f){e.onchange=()=>f(e.checked);return c}};fn(c);return this}
 addText(fn){const e=this.controlEl.createEl('input');const c={inputEl:e,setValue(v){e.value=v;return c},setPlaceholder(v){e.placeholder=v;return c},setDisabled(v){e.disabled=v;return c},onChange(f){e.addEventListener('input',()=>f(e.value));return c}};fn(c);return this}
 addDropdown(fn){const e=this.controlEl.createEl('select');const c={selectEl:e,addOption(v,t){e.createEl('option',{value:v,text:t});return c},setValue(v){e.value=v;return c},setDisabled(v){e.disabled=v;return c},onChange(f){e.addEventListener('change',()=>f(e.value));return c}};fn(c);return this}
 addButton(fn){const e=this.controlEl.createEl('button');let disabled=false;const c={buttonEl:e,setButtonText(v){e.textContent=v;return c},setIcon(v){e.textContent=v==='x'?'×':v;e.dataset.icon=v;return c},setTooltip(v){e.title=v;return c},setDisabled(v){disabled=v;e.disabled=v;return c},onClick(f){e.addEventListener('click',()=>{if(!disabled)f()});return c}};fn(c);return this}
}
`;


const js=await build({stdin:{contents:`export {HomepageSettingsTab} from './src/presentation/HomepageSettingsTab';export {Component} from 'obsidian';export {getDefaultLayout} from './src/domain/layout/layout';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',globalName:'Test',write:false,plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'js'}));}}]});
const messages=JSON.parse(await readFile('src/localization/locales/zh-cn.json','utf8'));const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent('<main></main>');
await page.addScriptTag({content:`
HTMLElement.prototype.createEl=function(tag,o={}){const e=document.createElement(tag);if(o.cls)e.className=o.cls;if(o.text)e.textContent=o.text;if(o.value)e.value=o.value;for(const[k,v]of Object.entries(o.attr||{}))e.setAttribute(k,v);this.append(e);return e};HTMLElement.prototype.createDiv=function(o){return this.createEl('div',o)};HTMLElement.prototype.createSpan=function(o){return this.createEl('span',o)};HTMLElement.prototype.addClass=function(...c){this.classList.add(...c)};HTMLElement.prototype.setText=function(s){this.textContent=s};HTMLElement.prototype.empty=function(){this.replaceChildren()};HTMLElement.prototype.setCssProps=function(props){for(const[k,v]of Object.entries(props))this.style.setProperty(k,v)};
${js.outputFiles[0].text}
window.resets=0;window.layout=Test.getDefaultLayout('klein-blue');window.override=false;
window.tab=Object.create(Test.HomepageSettingsTab.prototype);tab.containerEl=document.querySelector('main');tab.app={workspace:{containerEl:document.body}};tab.pendingLayoutControlFocus=null;
tab.application={setLayoutBoard(next){layout=next;override=true;return {type:'applied'}},async resetCurrentThemeLayout(){resets++;override=false;layout=Test.getDefaultLayout('klein-blue');return {type:'applied'}}};
tab.display=()=>{tab.settingsScope?.unload();tab.settingsScope=new Test.Component();tab.settingsScope.load();tab.containerEl.empty();tab.renderLayoutSettings({theme:'klein-blue',appearanceMode:'dark',layout,editable:true,hasOverride:override},${JSON.stringify(messages)})};tab.display();`});
for(let i=1;i<=2;i++){
 await page.locator('[data-board-size="compact"]').click();
 const reset=page.locator('[data-layout-control="reset"] button');assert.equal(await reset.isDisabled(),false);
 await reset.click();await page.waitForFunction(expected=>window.resets===expected,i);assert.equal(await page.evaluate(()=>window.override),false);
}
assert.deepEqual(errors,[]);await browser.close();process.stdout.write('PASS: resize -> reset -> resize -> reset works with component-level disabled state.\n');
