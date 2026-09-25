import {build} from 'esbuild';import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.HOMEPAGE_PLAYWRIGHT_PATH||'playwright');
const js=await build({...(process.env.HOMEPAGE_TEST_BASELINE?{stdin:{contents:execFileSync('git',['show','HEAD:src/presentation/TaskReorderController.ts'],{encoding:'utf8'}),loader:'ts',resolveDir:process.cwd()}}:{entryPoints:['src/presentation/TaskReorderController.ts']}),bundle:true,format:'iife',globalName:'Reorder',write:false});const css=await build({entryPoints:['src/styles/index.css'],bundle:true,write:false});
const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:900,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.setContent('<main class="homepage-studio" data-theme="klein-blue" style="margin:200px 100px;width:500px"><div id="tasks" class="homepage-studio-tasks"><ul class="homepage-studio-task-reorder-list"></ul></div></main>');await page.addStyleTag({content:css.outputFiles[0].text+'#tasks li{height:45px;list-style:none}#tasks ul{padding:0;margin:0}.homepage-studio-task-reorder-surface{height:40px;width:100%}'});
await page.addScriptTag({content:`HTMLElement.prototype.createDiv=function(o){const e=document.createElement('div');e.className=o.cls;for(const[k,v]of Object.entries(o.attr||{}))e.setAttribute(k,v);this.append(e);return e};HTMLElement.prototype.addClass=function(c){this.classList.add(c)};HTMLElement.prototype.removeClass=function(c){this.classList.remove(c)};
${js.outputFiles[0].text}
window.mount=()=>{window.cleanup?.();const list=document.querySelector('ul');list.replaceChildren();for(const [id,scope]of [['a','active-incomplete'],['b','active-incomplete'],['c','active-incomplete'],['done','active-completed']]){const row=document.createElement('li');row.className='homepage-studio-task homepage-studio-task-reorder-item';row.dataset.id=id;row.dataset.scope=scope;const surface=document.createElement('div');surface.className='homepage-studio-task-reorder-surface';surface.textContent=id;row.append(surface);list.append(row)}window.moves=[];const cleanups=[];window.cleanup=()=>{while(cleanups.length)cleanups.pop()()};Reorder.attachTaskReorderController({container:document.querySelector('#tasks'),scrollContainer:document.querySelector('main'),enabled:true,scope:{register(f){cleanups.push(f)},registerDomEvent(e,t,f,o){e.addEventListener(t,f,o);cleanups.push(()=>e.removeEventListener(t,f,o))}},resolveItem:e=>({target:{section:'active',rawLine:e.dataset.id,previousTaskLine:null,nextTaskLine:null},text:e.dataset.id,scope:e.dataset.scope}),move:async request=>{window.moves.push(request);return {type:'applied'}},onPickup(){},onCommit(){},onFinish(){},formatMovedAnnouncement:()=>'',onApplied(){},onRejected(){}})};`});

await page.evaluate(()=>{
 window.mount();window.cleanup();
 const list=document.querySelector('ul');list.classList.add('homepage-studio-task-archive-list');list.replaceChildren();
 for(let i=0;i<30;i++){const row=document.createElement('li');row.className='homepage-studio-task homepage-studio-task-reorder-item';row.dataset.id='arch-'+i;row.dataset.scope='archive';const surface=document.createElement('div');surface.className='homepage-studio-task-reorder-surface';surface.textContent=row.dataset.id;row.append(surface);list.append(row)}
 const cleanups=[];window.cleanup=()=>{while(cleanups.length)cleanups.pop()()};window.moves=[];
 window.Reorder.attachTaskReorderController({container:document.querySelector('#tasks'),scrollContainer:document.querySelector('main'),enabled:true,scope:{register(f){cleanups.push(f)},registerDomEvent(e,t,f,o){e.addEventListener(t,f,o);cleanups.push(()=>e.removeEventListener(t,f,o))}},resolveItem:e=>({target:{section:'archive',rawLine:e.dataset.id,previousTaskLine:null,nextTaskLine:null},text:e.dataset.id,scope:'archive'}),move:async request=>{window.moves.push(request);return {type:'applied'}},onPickup(){},onCommit(){},onFinish(){},formatMovedAnnouncement:()=>'',onApplied(){},onRejected(){}});
});
await page.addStyleTag({content:'.homepage-studio-task-archive-list{height:180px;max-height:180px;overflow-y:auto}'});
await page.locator('ul').evaluate(e=>e.scrollTop=300);
const visibleId=await page.locator('ul').evaluate(list=>{const bounds=list.getBoundingClientRect();return Array.from(list.children).find(row=>{const r=row.getBoundingClientRect();return r.top>=bounds.top&&r.bottom<=bounds.bottom}).dataset.id});const source=await page.locator('[data-id='+visibleId+'] .homepage-studio-task-reorder-surface').boundingBox();
await page.mouse.move(source.x+50,source.y+10);await page.mouse.down();await page.waitForTimeout(260);assert.equal(await page.locator('#tasks').getAttribute('data-task-reorder-state'),'active');
const bounds=await page.locator('ul').boundingBox();const initial=await page.locator('ul').evaluate(e=>e.scrollTop);const pageScroll=await page.locator('main').evaluate(e=>e.scrollTop);
await page.mouse.move(bounds.x+50,bounds.y+bounds.height/2);await page.waitForTimeout(40);
const wheelStart=await page.locator('ul').evaluate(e=>e.scrollTop);
await page.mouse.wheel(0,140);await page.waitForTimeout(80);const wheelDown=await page.locator('ul').evaluate(e=>e.scrollTop);assert.ok(wheelDown>wheelStart,'wheel down during drag must scroll archive');
await page.mouse.wheel(0,-140);await page.waitForTimeout(80);assert.ok((await page.locator('ul').evaluate(e=>e.scrollTop))<wheelDown,'wheel up during drag must scroll archive');
assert.equal(await page.locator('#tasks .homepage-studio-task-reorder-slot').count(),1,'wheel scrolling retains preview');
await page.mouse.move(bounds.x+50,bounds.y+bounds.height-8);await page.waitForTimeout(240);
const down=await page.locator('ul').evaluate(e=>e.scrollTop);assert.ok(down>initial+70,'dragging near archive bottom should scroll its own list');
await page.mouse.move(bounds.x+50,bounds.y+8);await page.waitForTimeout(240);const up=await page.locator('ul').evaluate(e=>e.scrollTop);assert.ok(up<down-70,'dragging near archive top should scroll upward');
assert.equal(await page.locator('main').evaluate(e=>e.scrollTop),pageScroll,'archive dragging must not scroll homepage instead');
await page.mouse.move(bounds.x+50,bounds.y+bounds.height/2);await page.waitForTimeout(70);const stopped=await page.locator('ul').evaluate(e=>e.scrollTop);await page.waitForTimeout(100);assert.equal(await page.locator('ul').evaluate(e=>e.scrollTop),stopped);
await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await page.evaluate(()=>window.moves.length),0);for(const direction of ['bottom','top']) {
 const id=await page.locator('ul').evaluate(list=>{const b=list.getBoundingClientRect();return Array.from(list.querySelectorAll('.homepage-studio-task-reorder-item')).find(row=>{const r=row.getBoundingClientRect();return r.top>=b.top&&r.bottom<=b.bottom}).dataset.id});
 const start=await page.locator('[data-id='+id+'] .homepage-studio-task-reorder-surface').boundingBox();
 await page.mouse.move(start.x+50,start.y+10);await page.mouse.down();await page.waitForTimeout(260);
 const b=await page.locator('ul').boundingBox();await page.mouse.move(b.x+50,direction==='bottom'?b.y+b.height-4:b.y+4);
 await page.waitForFunction(dir=>{const list=document.querySelector('ul');return dir==='bottom'?list.scrollTop>=list.scrollHeight-list.clientHeight-1:list.scrollTop===0},direction);
 await page.waitForTimeout(40);await page.mouse.up();await page.waitForTimeout(40);
 assert.equal(await page.evaluate(()=>window.moves.at(-1).before?.rawLine??null),direction==='bottom'?null:'arch-0');
}
assert.deepEqual(errors,[]);await browser.close();process.stdout.write('PASS: archive drag scrolls its inner list down/up, stops away from edges, and cancels without moving tasks.\n');
