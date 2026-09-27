import assert from 'node:assert/strict';import {build} from 'esbuild';import {createRequire} from 'node:module';import {readFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.env.HOMEPAGE_PLAYWRIGHT_PATH||'playwright');
const js=await build({stdin:{contents:`export {renderLayoutEditor} from './src/presentation/LayoutEditor';export {renderLayoutBoard} from './src/presentation/LayoutBoard';export {getDefaultLayout,placeLayoutModule} from './src/domain/layout/layout';`,loader:'ts',resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'Editor',write:false});const css=await build({entryPoints:['src/styles/index.css'],bundle:true,write:false});const labels=JSON.parse(await readFile('src/localization/locales/zh-cn.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1100,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.setContent('<style>:root{--size-4-1:4px;--size-4-2:8px;--size-4-3:12px;--size-4-4:16px;--size-4-5:20px;--size-4-6:24px;--size-4-8:32px;--radius-m:8px;--font-ui-small:13px;--font-ui-medium:14px;--font-ui-large:16px;--font-interface-theme:Arial;--background-primary:#151719;--background-secondary:#202326;--text-normal:#eee;--text-muted:#aaa;--text-faint:#777;--interactive-accent:#6d8ee0;--background-modifier-border:#444;--font-monospace-theme:monospace}body{margin:0;background:#181a1d;color:#ddd;font-family:Arial}#host{width:900px;padding:20px}button,select{font:inherit}button{cursor:pointer}</style><div id="host" class="settings-content"></div>');await page.addStyleTag({content:css.outputFiles[0].text});await page.addStyleTag({content:'.settings-content h3{color:rgb(236,239,244)}'});
await page.addScriptTag({content:`HTMLElement.prototype.createEl=function(tag,o={}){const e=document.createElement(tag);if(o.cls)e.className=o.cls;if(o.text)e.textContent=o.text;if(o.value)e.value=o.value;for(const[k,v]of Object.entries(o.attr||{}))e.setAttribute(k,v);this.append(e);return e};HTMLElement.prototype.createDiv=function(o){return this.createEl('div',o)};HTMLElement.prototype.createSpan=function(o){return this.createEl('span',o)};HTMLElement.prototype.empty=function(){this.replaceChildren()};HTMLElement.prototype.setText=function(s){this.textContent=s};HTMLElement.prototype.setCssProps=function(props){for(const[k,v]of Object.entries(props))this.style.setProperty(k,v)};
${js.outputFiles[0].text}
window.mount=(theme='klein-blue',appearance='dark')=>{window.cleanup?.();document.querySelector('#host').replaceChildren();window.saved=Editor.getDefaultLayout(theme);window.writes=0;const callbacks=[];window.cleanup=()=>{while(callbacks.length)callbacks.pop()()};const scope={register(f){callbacks.push(f)},registerDomEvent(e,t,f,o){e.addEventListener(t,f,o);callbacks.push(()=>e.removeEventListener(t,f,o))}};Editor.renderLayoutEditor(document.querySelector('#host'),{scope,theme,appearance,layout:saved,editable:true,messages:${JSON.stringify(labels)},width:1400,label:id=>({'heatmap':'热力图','current-plan':'当前计划','journal':'日记','tasks':'任务','file-groups':'文件分组'})[id],save:next=>{saved=next;writes++;return true}});};`});
for(const theme of ['klein-blue','watercolor-journal','celestial-orbit','minimal-paper','archive-observatory','cosmic-cartography']){
 await page.evaluate(theme=>window.mount(theme),theme);await page.waitForTimeout(60);
 assert.equal(await page.locator('[data-layout-module-id]').count(),5);
 if(!['minimal-paper','archive-observatory'].includes(theme)){
  const heights=await page.locator('.homepage-studio-layout-row').nth(1).evaluate(row=>Array.from(row.querySelectorAll('.homepage-studio-module')).map(el=>el.getBoundingClientRect().height));
  if(heights.length===2)assert.ok(Math.abs(heights[0]-heights[1])<1,theme+' paired modules should have equal height');
 }
 const geometry=await page.locator('.homepage-studio-layout-preview').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,height:el.scrollHeight}));
 assert.ok(geometry.height>100 && geometry.scroll<=geometry.width+1,theme+' preview overflow '+JSON.stringify(geometry));
 for(const width of ['1400','600']){
  await page.getByRole('combobox',{name:'预览宽度',exact:true}).selectOption(width);await page.waitForTimeout(30);
  const metrics=await page.locator('.homepage-studio-layout-row').first().evaluate(row=>({display:getComputedStyle(row).display,width:row.getBoundingClientRect().width,cols:Array.from(row.children).map(col=>({width:col.getBoundingClientRect().width,size:col.dataset.width}))}));
  if(width==='600')for(const col of metrics.cols)assert.ok(Math.abs(col.width-metrics.width)<1,theme+' mobile column width');
  else if(theme==='archive-observatory'){
   const pair=await page.locator('.homepage-studio-layout-row').nth(1).evaluate(row=>({width:row.getBoundingClientRect().width,cols:Array.from(row.children).map(e=>e.getBoundingClientRect().width)}));
   assert.ok(Math.abs(pair.cols[0]/pair.width-0.6)<0.01);assert.ok(Math.abs(pair.cols[1]/pair.width-0.35)<0.01);
  }
 }
}
await page.evaluate(()=>window.mount());
await page.locator('[data-layout-module-id=tasks] .homepage-studio-layout-sample').click();
assert.equal(await page.getByRole('combobox',{name:'选中的模块',exact:true}).inputValue(),'tasks','module body should be selectable');
const titleSize=await page.locator('[data-layout-module-id=tasks] h3').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)*Number(getComputedStyle(e.closest('.homepage-studio-layout-preview')).getPropertyValue('--layout-preview-scale')));
assert.ok(titleSize>=15,'scaled title should remain legible');
await page.getByRole('combobox',{name:'选中的模块',exact:true}).selectOption('tasks');
await page.locator('[data-board-size="expanded"]').click();assert.equal(await page.evaluate(()=>window.saved.sizes.tasks),'expanded');
await page.locator('.homepage-studio-layout-editor-inspector').getByRole('button',{name:'隐藏模块',exact:true}).click();assert.equal(await page.locator('[data-layout-module-id=tasks]').count(),0);
await page.locator('[data-layout-restore=tasks]').click();assert.equal(await page.locator('[data-layout-module-id=tasks]').count(),1);
await page.locator('[data-board-size="compact"]').click();await page.getByRole('combobox',{name:'目标模块',exact:true}).selectOption('current-plan');await page.getByRole('combobox',{name:'放置位置',exact:true}).selectOption('below');await page.getByRole('button',{name:'确认',exact:true}).click();
assert.ok(await page.evaluate(()=>window.saved.board.rows.some(row=>row.columns.some(col=>col.modules.includes('tasks')&&col.modules.includes('current-plan')))));
await page.evaluate(()=>window.mount());
const source=page.locator('[data-layout-drag-module="current-plan"]');await source.scrollIntoViewIfNeeded();const from=await source.boundingBox();const target=await page.locator('[data-layout-module-id=heatmap]').boundingBox();await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(target.x+target.width/2,target.y+target.height*0.7);await page.waitForTimeout(40);assert.equal(await page.evaluate(()=>window.writes),0);await page.mouse.up();assert.equal(await page.evaluate(()=>window.writes),1);assert.equal(await page.evaluate(()=>window.saved.sizes['current-plan']),'standard');
await page.evaluate(()=>window.mount());
const dragCard=await page.locator('[data-layout-module-id=current-plan]').boundingBox();const targetCard=await page.locator('[data-layout-module-id=heatmap]').boundingBox();
await page.mouse.move(dragCard.x+dragCard.width/2,dragCard.y+dragCard.height/2);await page.mouse.down();
await page.mouse.move(targetCard.x+targetCard.width/2,targetCard.y+targetCard.height*0.3);await page.waitForTimeout(30);assert.match(await page.locator('.homepage-studio-layout-editor-status').innerText(),/同列上方/);
await page.mouse.move(targetCard.x+targetCard.width/2,targetCard.y+targetCard.height*0.7);await page.waitForTimeout(30);assert.match(await page.locator('.homepage-studio-layout-editor-status').innerText(),/同列下方/);
const indicated=await page.locator('.homepage-studio-layout-drop-zone').boundingBox();const previewed=await page.locator('[data-preview-moving=true]').boundingBox();
for(const key of ['x','y','width','height'])assert.ok(Math.abs(indicated[key]-previewed[key])<3,'drop indicator must match final preview '+key);

await page.mouse.up();assert.ok(await page.evaluate(()=>window.saved.board.rows.some(row=>row.columns.some(col=>JSON.stringify(col.modules)===JSON.stringify(['heatmap','current-plan'])))));
await page.evaluate(()=>window.mount());const resize=page.locator('[data-layout-resize=heatmap]');await resize.scrollIntoViewIfNeeded();const r=await resize.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2-140,r.y+r.height/2);await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await page.evaluate(()=>window.writes),0);
await page.evaluate(()=>window.mount());
for(const id of ['heatmap','current-plan','journal','tasks','file-groups'])await page.locator('[data-layout-hide='+id+']').click();
assert.equal(await page.locator('.homepage-studio-layout-empty-canvas').count(),1);
const hidden=page.locator('[data-layout-restore=journal]');await hidden.scrollIntoViewIfNeeded();const h=await hidden.boundingBox();const blank=await page.locator('.homepage-studio-layout-empty-canvas').boundingBox();await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(blank.x+blank.width/2,blank.y+blank.height/2);await page.mouse.up();assert.equal(await page.locator('[data-layout-module-id=journal]').count(),1);
await page.evaluate(()=>window.mount('minimal-paper'));
await page.setViewportSize({width:1100,height:2000});
for(const theme of ['klein-blue','watercolor-journal','celestial-orbit','minimal-paper','archive-observatory','cosmic-cartography'])for(const appearance of ['light','dark']){
 await page.evaluate(({theme,appearance})=>window.mount(theme,appearance),{theme,appearance});
 const titleColor=await page.locator('.homepage-studio-module-title').first().evaluate(e=>({title:getComputedStyle(e).color,module:getComputedStyle(e.closest('.homepage-studio-module')).color}));assert.equal(titleColor.title,titleColor.module,theme+' '+appearance+' preview title must follow canvas theme');
 const from=await page.locator('[data-layout-module-id=current-plan]').boundingBox();const to=await page.locator('[data-layout-module-id=heatmap]').boundingBox();
 await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height*0.7);await page.waitForTimeout(30);
 const box=await page.locator('.homepage-studio-layout-drop-zone').boundingBox();const card=await page.locator('[data-preview-moving=true]').boundingBox();
 for(const key of ['x','y','width','height'])assert.ok(Math.abs(box[key]-card[key])<3,theme+' '+appearance+' final slot '+key);
 const color=await page.locator('.homepage-studio-layout-drop-label').evaluate(e=>({label:getComputedStyle(e).color,module:getComputedStyle(e.closest('.homepage-studio-module')).color}));assert.equal(color.label,color.module,theme+' '+appearance+' label must inherit theme text');
 await page.mouse.up();
 const placed=await page.locator('[data-layout-module-id=current-plan]').boundingBox();for(const key of ['width','height'])assert.ok(Math.abs(placed[key]-card[key])<3,theme+' final placement matches preview');
}
await page.evaluate(()=>window.mount());
const origin=await page.locator('[data-layout-module-id=current-plan]').boundingBox();
await page.mouse.move(origin.x+origin.width/2,origin.y+origin.height/2);await page.mouse.down();await page.mouse.move(origin.x+origin.width/2+12,origin.y+origin.height/2);
assert.equal(await page.locator('[data-preview-origin=true]').count(),1,'dragging inside original position must highlight origin');
await page.mouse.move(1095,10);assert.equal(await page.locator('[data-preview-origin=true]').count(),1,'invalid/outside drop must retain origin highlight');
await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await page.locator('[data-preview-origin=true]').count(),0);
await page.evaluate(()=>window.mount());
const destination=page.getByRole('combobox',{name:'目标模块',exact:true});
assert.equal(await destination.locator('option[value=heatmap]').count(),0);
assert.equal(await page.getByRole('combobox',{name:'放置位置',exact:true}).isVisible(),false);
await page.getByRole('combobox',{name:'选中的模块',exact:true}).selectOption('tasks');
assert.match(await page.locator('.homepage-studio-layout-move-description').innerText(),/将 任务 移动到/);
assert.equal(await destination.locator('option[value=tasks]').count(),0);
await destination.selectOption('heatmap');assert.equal(await page.getByRole('combobox',{name:'放置位置',exact:true}).isVisible(),true);
await page.locator('[data-layout-hide=heatmap]').click();assert.equal(await destination.locator('option[value=heatmap]').count(),0);assert.equal(await page.getByRole('combobox',{name:'放置位置',exact:true}).isVisible(),false);
await page.locator('[data-layout-restore=heatmap]').click();await page.getByRole('combobox',{name:'选中的模块',exact:true}).selectOption('tasks');assert.equal(await destination.locator('option[value=heatmap]').count(),1);
await destination.selectOption('__start__');await page.getByRole('button',{name:'确认',exact:true}).click();assert.equal(await page.evaluate(()=>window.saved.moduleOrder[0]),'tasks');
await destination.selectOption('');await page.getByRole('button',{name:'确认',exact:true}).click();assert.equal(await page.evaluate(()=>window.saved.moduleOrder.at(-1)),'tasks');
if(process.env.HOMEPAGE_LAYOUT_SCREENSHOT)await page.screenshot({path:process.env.HOMEPAGE_LAYOUT_SCREENSHOT,fullPage:true});
assert.deepEqual(errors,[]);await page.evaluate(()=>window.cleanup());await browser.close();process.stdout.write('PASS: six-theme responsive previews, migration rendering, sizing, hide/restore, column stacking, pointer move save, and Escape rollback.\n');
