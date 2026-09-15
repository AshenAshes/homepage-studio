import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.HOMEPAGE_PLAYWRIGHT_PATH || 'playwright');
const fixture = `
export class Component {
  cleanups = []; loaded = false;
  load() { this.loaded = true; }
  register(fn) { this.cleanups.push(fn); }
  registerDomEvent(el, type, fn, options) { el.addEventListener(type, fn, options); window.listenerCount++; this.register(() => { el.removeEventListener(type, fn, options); window.listenerCount--; }); }
  unload() { if (!this.loaded) return; this.loaded = false; while(this.cleanups.length) this.cleanups.pop()(); }
}
export function setIcon(el, name) { el.textContent = ({'chevron-left':'‹','chevron-right':'›',x:'×'})[name]; }
`;
const js = await build({entryPoints:['src/presentation/JournalCalendar.ts'],bundle:true,format:'iife',globalName:'Calendar',write:false,plugins:[{name:'obsidian-fixture',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'js'}));}}]});
const css = await build({entryPoints:['src/styles/index.css'],bundle:true,write:false});
const labels=JSON.parse(await readFile('src/localization/locales/zh-cn.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1000,height:800}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.setContent(`<style>:root{--size-2-1:2px;--size-4-1:4px;--size-4-2:8px;--size-4-3:12px;--size-4-4:16px;--radius-m:8px;--font-ui-small:13px;--font-semibold:600;--text-on-accent:white;--background-modifier-cover:#0008;--font-interface-theme:Arial;}body{margin:0}button,select,input{font:inherit} ${css.outputFiles[0].text}</style><main class="homepage-studio" data-theme="klein-blue" data-appearance="dark"><button id="open">2026年9月10日</button></main>`);
await page.addScriptTag({content:`
window.listenerCount=0;
HTMLElement.prototype.createEl=function(tag,opts={}){const e=document.createElement(tag);if(opts.cls)e.className=opts.cls;if(opts.text)e.textContent=opts.text;if(opts.value)e.value=opts.value;for(const [k,v] of Object.entries(opts.attr||{}))e.setAttribute(k,v);this.append(e);return e;};
HTMLElement.prototype.createDiv=function(opts){return this.createEl('div',opts)};
HTMLElement.prototype.createSpan=function(opts){return this.createEl('span',opts)};
HTMLElement.prototype.setText=function(s){this.textContent=s};
HTMLElement.prototype.setCssProps=function(props){for(const [key,value] of Object.entries(props))this.style.setProperty(key,value)};
HTMLElement.prototype.empty=function(){this.replaceChildren()};
${js.outputFiles[0].text}
window.selected=[];window.fail=false;window.closed=0;
window.openCalendar=()=>{document.querySelector('#open').focus();window.calendar=new Calendar.JournalCalendar(document.querySelector('main'),{dateKey:'2026-09-10',calendar:{locale:'zh-cn',todayKey:'2026-09-16',entryDates:['2026-09-10','2026-09-12'],labels:${JSON.stringify(labels)}}},async key=>{if(window.fail)return false;window.selected.push(key);return true},(restore)=>{window.closed++;if(restore)document.querySelector('#open').focus()},document.querySelector('#open'))};
document.querySelector('#open').onclick=window.openCalendar;
`});

const renderer = await readFile('src/presentation/HomepageShellRenderer.ts','utf8');
const navigationCode = renderer.slice(renderer.indexOf('    const journal = section.createDiv'),renderer.indexOf('    const modes = toolbar.createDiv',renderer.indexOf('    const journal = section.createDiv')));
await page.addScriptTag({content: `window.renderJournalNavigation=(section,module)=>{
  const attachTooltipAccessibleLabel=()=>{};
  const scope={registerDomEvent(){}};
  const actions={openJournalCalendar(){}};
  const renderIcon=(el)=>el.textContent='‹';
  ${navigationCode}
};`});
await page.addStyleTag({content: '.homepage-studio-calendar-radius-probe { border-radius: var(--homepage-corner); }'});
const failures=[];
for(const appearance of ['light','dark']) for(const width of [1000,360]) for(const theme of ['klein-blue','watercolor-journal','celestial-orbit','minimal-paper','archive-observatory','cosmic-cartography']) {
 await page.setViewportSize({width,height:900});
 await page.evaluate(({theme,appearance,labels})=>{
  const host=document.querySelector('main');host.dataset.theme=theme;host.dataset.appearance=appearance;
  const section=host.createEl("section",{cls:"homepage-studio-module",attr:{"data-module":"journal"}});section.id='actual';
  const module={journal:{dateKey:'2026-09-10',dateLabel:'2026年9月10日',weekdayLabel:'星期四',previousLabel:'前一天',nextLabel:'后一天',canMoveNext:true,calendar:{labels}}};
  window.renderJournalNavigation(section,module);
  const baseline=section.cloneNode(true);baseline.id='baseline';host.append(baseline);
  const trigger=baseline.querySelector('.homepage-studio-journal-date-group');const time=document.createElement('time');time.className=trigger.className;time.append(...Array.from(trigger.childNodes,child=>child.cloneNode(true)));trigger.replaceWith(time);
 },{theme,appearance,labels});
 await page.mouse.move(width-1,899);
 const trigger=page.locator('#actual .homepage-studio-journal-date-group');
 const normalColor=await trigger.locator('span').last().evaluate(el=>getComputedStyle(el).color);
 await trigger.hover();
 const hoverColor=await trigger.locator('span').last().evaluate(el=>getComputedStyle(el).color);
 const triggerStyle=await trigger.evaluate(el=>{const s=getComputedStyle(el);return {radius:s.borderRadius,shadow:s.boxShadow,offset:s.outlineOffset};});
 if(theme==='klein-blue' && (triggerStyle.radius!=='0px' || hoverColor!=='rgb(0, 47, 167)')) failures.push({theme,issue:'Klein hover must be square and Klein blue',triggerStyle,hoverColor});
 if(theme==='cosmic-cartography' && triggerStyle.shadow.includes('inset')) failures.push({theme,issue:'hover frame extends into clipped toolbar'});
 if(normalColor===hoverColor) failures.push({theme,issue:'date entry has no theme-color hover'});
 await page.mouse.move(0,0);
 const metrics=await page.evaluate(()=>{
  const measure=(id)=>{const root=document.querySelector(id);const group=root.querySelector('.homepage-studio-journal-date-group');const arrow=root.querySelector('button');const text=group.querySelector('span');return {height:group.getBoundingClientRect().height,width:group.getBoundingClientRect().width,gap:text.getBoundingClientRect().x-arrow.getBoundingClientRect().right,radius:getComputedStyle(group).borderRadius};};return {actual:measure('#actual'),baseline:measure('#baseline')};
 });
 if(metrics.actual.height<26 || Math.abs(metrics.actual.gap-metrics.baseline.gap)>14)failures.push({theme,issue:'date toolbar geometry changed',metrics});
 await page.evaluate(()=>window.openCalendar());
 const placement=await page.locator('[popover]').evaluate(el=>{const r=el.getBoundingClientRect();const a=document.querySelector('#open').getBoundingClientRect();return {gap:r.top-a.bottom,left:r.left,right:r.right,viewport:document.documentElement.clientWidth};});
 if(Math.abs(placement.gap-8)>1 || placement.left<0 || placement.right>placement.viewport) failures.push({theme,issue:'popover not anchored or outside viewport',placement});
 if(await page.locator('.homepage-studio-journal-calendar').evaluate(el=>el.matches(':modal'))) failures.push({theme,issue:'calendar blocks page with modal'});
 const panelSize=await page.locator('[popover]').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));
 if((panelSize.width<231 || panelSize.width>234) || panelSize.height>300) failures.push({theme,issue:'calendar exceeds compact dimensions',panelSize});
 const currentSelection=await page.locator('[data-date="2026-09-10"]').evaluate(el=>{
  const before={border:getComputedStyle(el).borderWidth,shadow:getComputedStyle(el).boxShadow};
  el.setAttribute('aria-current','date');
  const after={border:getComputedStyle(el).borderWidth,shadow:getComputedStyle(el).boxShadow};
  el.removeAttribute('aria-current');return {before,after};
 });
 if(JSON.stringify(currentSelection.before)!==JSON.stringify(currentSelection.after)) failures.push({theme,issue:'today adds extra selection border',currentSelection});
 const padding=await trigger.evaluate(el=>getComputedStyle(el).paddingInlineStart);
 if(padding!=='12px') failures.push({theme,issue:'trigger padding differs from delete control',padding});
 const previousMonth=page.getByRole('button',{name:'上个月',exact:true});
 const iconSize=await previousMonth.evaluate(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height}));
 if(Math.abs(iconSize.w-iconSize.h)>1 || iconSize.w>24 || iconSize.h>24) failures.push({theme,issue:'icon hover frame is oversized or rectangular',iconSize});
 const normalArrow=await previousMonth.evaluate(el=>getComputedStyle(el).color);
 await previousMonth.hover();
 const hoveredArrow=await previousMonth.evaluate(el=>getComputedStyle(el).color);
 if(theme==='archive-observatory' && normalArrow===hoveredArrow) failures.push({theme,issue:'month arrow has no visible hover'});
 const days=await page.locator('[data-date="2026-09-10"]').evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,radius:getComputedStyle(el).borderRadius,expected:(()=>{const probe=document.createElement('span');probe.className='homepage-studio-calendar-radius-probe';el.append(probe);const radius=getComputedStyle(probe).borderRadius;probe.remove();return radius;})()};});
 if(Math.abs(days.width-days.height)>1)failures.push({theme,issue:'day not square',days});
 if(days.radius!==days.expected)failures.push({theme,issue:'radius differs from original theme button',days});
 await page.keyboard.press('Escape');
 await page.evaluate(()=>{document.querySelector('#actual').remove();document.querySelector('#baseline').remove();});
}
await page.setViewportSize({width:1000,height:900});
await page.addStyleTag({content:'#open { position: fixed; right: 8px; bottom: 20px; }'});
await page.evaluate(()=>window.openCalendar());
const flipped=await page.locator('[popover]').evaluate(el=>{
 const p=el.getBoundingClientRect();const a=document.querySelector('#open').getBoundingClientRect();
 return {gap:a.top-p.bottom,left:p.left,right:p.right,top:p.top};
});
assert.ok(Math.abs(flipped.gap-8)<1 && flipped.left>=0 && flipped.right<=1000 && flipped.top>=0);
await page.setViewportSize({width:400,height:700});
await page.waitForFunction(()=>{const r=document.querySelector('[popover]').getBoundingClientRect();return r.right<=400 && r.left>=0});
await page.keyboard.press('Escape');
assert.equal(await page.evaluate(()=>window.listenerCount),0);
process.stdout.write(JSON.stringify(failures,null,2)+"\n");await browser.close();assert.deepEqual(failures,[]);process.stdout.write('PASS: 24 theme/appearance/width combinations preserve original date layout, theme corners and square cells.\n');
