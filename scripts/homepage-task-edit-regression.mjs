import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.HOMEPAGE_PLAYWRIGHT_PATH || 'playwright');
const js=await build({entryPoints:['src/presentation/TaskNameEditor.ts'],bundle:true,format:'iife',globalName:'Editor',write:false});
const css=await build({entryPoints:['src/styles/index.css'],bundle:true,write:false});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.setContent('<main class="homepage-studio" data-theme="klein-blue" data-appearance="dark"><div id="body"></div></main><button id="outside">Outside</button>');
await page.addStyleTag({content:':root{--text-error:rgb(220,40,40)}'+css.outputFiles[0].text});
await page.addScriptTag({content:`
HTMLElement.prototype.createDiv=function(o){const el=document.createElement('div');el.className=o.cls;for(const[k,v]of Object.entries(o.attr||{}))el.setAttribute(k,v);this.append(el);return el};
HTMLElement.prototype.setCssProps=function(props){for(const [key,value] of Object.entries(props))this.style.setProperty(key,value)};
HTMLElement.prototype.setText=function(text){this.textContent=text};
${js.outputFiles[0].text}
window.mount=(extra={})=>{
 if(window.cleanup)window.cleanup();
 document.querySelector('#body').replaceChildren();
 const input=document.createElement('textarea');input.rows=1;input.className='homepage-studio-task-edit-input';input.value=extra.invalid?'':'Original';document.querySelector('#body').append(input);
 window.calls={save:0,cancel:0,reject:0,end:0};window.value=input.value;window.outcome=true;
 const cleanups=[];window.cleanup=()=>{while(cleanups.length)cleanups.pop()()};
 const scope={register(fn){cleanups.push(fn)},registerDomEvent(el,type,fn){el.addEventListener(type,fn);cleanups.push(()=>el.removeEventListener(type,fn))}};
 Editor.attachTaskNameEditor(input,scope,{
  original:'Original',autofocus:true,invalid:false,failed:false,invalidReason:null,invalidLabels:{empty:'Name is empty',multiline:'Single line only','reserved-metadata':'Reserved fields'},failureLabel:'Save failed; input retained',
  update(text){window.value=text},reject(){calls.reject++},
  async save(){calls.save++;await new Promise(r=>setTimeout(r,60));return outcome},
  cancel(){calls.cancel++},begin(){},end(){calls.end++},...extra
 });
};`});
const input=page.locator('textarea');
await page.evaluate(()=>window.mount());
assert.deepEqual(await input.evaluate(e=>[e.selectionStart,e.selectionEnd]),[0,8]);
await input.fill('Renamed');await input.press('Enter');await page.click('#outside');await page.waitForTimeout(100);
assert.equal(await page.evaluate(()=>window.calls.save),1);assert.equal(await page.evaluate(()=>window.calls.end),1);
await page.evaluate(()=>window.mount());await input.fill('Blur rename');await page.click('#outside');await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.calls.save),1);
await page.evaluate(()=>window.mount());await input.press('Enter');assert.equal(await page.evaluate(()=>window.calls.cancel),1);assert.equal(await page.evaluate(()=>window.calls.save),0);
await page.evaluate(()=>window.mount());await input.fill('');await input.press('Enter');
assert.equal(await input.getAttribute('placeholder'),'Name is empty');assert.equal(await input.getAttribute('aria-invalid'),'true');assert.equal(await input.evaluate(e=>getComputedStyle(e,'::placeholder').color),'rgb(220, 40, 40)');
await page.click('#outside');await input.focus();await page.click('#outside');assert.equal(await page.evaluate(()=>window.calls.reject),1);assert.equal(await page.evaluate(()=>window.calls.save),0);
await input.fill('Fixed');assert.equal(await input.getAttribute('data-invalid'),null);await input.press('Enter');await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.calls.save),1);
await page.evaluate(()=>window.mount());await input.dispatchEvent('compositionstart');await input.fill('pin');await input.press('Enter');assert.equal(await page.evaluate(()=>window.calls.save),0);
await input.fill('拼音');await input.dispatchEvent('compositionend');await input.press('Enter');await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.calls.save),1);
await page.evaluate(()=>window.mount());await input.fill('Cancelled');await input.press('Escape');await page.click('#outside');assert.equal(await page.evaluate(()=>window.calls.cancel),1);assert.equal(await page.evaluate(()=>window.calls.save),0);
await page.evaluate(()=>{window.mount();window.outcome=false});await input.fill('Retain on failure');await input.press('Enter');await page.waitForTimeout(100);assert.equal(await input.inputValue(),'Retain on failure');assert.equal(await page.locator('[role="alert"]').innerText(),'Save failed; input retained');
await page.click('#outside');await page.waitForTimeout(100);await page.evaluate(()=>window.mount({autofocus:false,invalid:true}));assert.equal(await page.evaluate(()=>document.activeElement.id),'outside');assert.equal(await input.inputValue(),'');
await page.evaluate(()=>window.mount());await input.fill('[homepage-studio-repeat:daily]');await input.press('Enter');assert.equal(await input.getAttribute('placeholder'),'Reserved fields');
await page.evaluate(()=>window.mount({invalid:true,invalidReason:'reserved-metadata',autofocus:false}));assert.equal(await input.getAttribute('placeholder'),'Reserved fields');
await page.evaluate(()=>window.mount({invalid:true,invalidReason:'multiline',autofocus:false}));assert.equal(await input.getAttribute('placeholder'),'Single line only');
await page.addStyleTag({content:'#body{width:220px}'});
for (const inputClass of ['homepage-studio-task-edit-input','homepage-studio-task-add-input']) for (const theme of ['klein-blue','watercolor-journal','celestial-orbit','minimal-paper','archive-observatory','cosmic-cartography']) {
 await page.evaluate(t=>{document.querySelector('main').dataset.theme=t;window.mount();},theme);
 await input.evaluate((e,c)=>{e.className=c;e.dispatchEvent(new Event('input'));},inputClass);
 if(theme==='watercolor-journal') {
  await input.fill('');
  const offset=await input.evaluate(e=>{const s=getComputedStyle(e);return parseFloat(s.borderTopWidth)+parseFloat(s.paddingTop)+parseFloat(s.lineHeight)/2-e.getBoundingClientRect().height/2;});
  assert.ok(Math.abs(offset)<=1,'watercolor placeholder must be vertically centered: '+offset);
  await input.fill('Short');
 }
 const short=await input.evaluate(e=>e.getBoundingClientRect().height);
 await input.fill('Long task content '.repeat(30));
 assert.ok(await input.evaluate(e=>e.getBoundingClientRect().height)>short,theme+' expands');
 assert.ok(await input.evaluate(e=>e.scrollHeight<=e.clientHeight+1),theme+' no clipped text');
 await input.fill('Short');
 assert.equal(await input.evaluate(e=>e.getBoundingClientRect().height),short,theme+' shrinks');
}
assert.deepEqual(errors,[]);await browser.close();process.stdout.write('PASS: Enter/blur, deduplication, unchanged names, red placeholder, correction, IME, Escape, IO failure, and no focus stealing.\n');
