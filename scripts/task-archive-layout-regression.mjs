import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.HOMEPAGE_PLAYWRIGHT_PATH||'playwright');
const css=await build({entryPoints:['src/styles/index.css'],bundle:true,write:false});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage();
await page.setContent('<main class="homepage-studio"><ul class="homepage-studio-task-list homepage-studio-task-archive-list"></ul></main>');
await page.addStyleTag({content:css.outputFiles[0].text+':root{--line-height-normal:1.5;--border-width:1px}main{width:600px}'});
for(const theme of ['klein-blue','watercolor-journal','celestial-orbit','minimal-paper','archive-observatory','cosmic-cartography']){
 await page.evaluate(theme=>{document.querySelector('main').dataset.theme=theme;const list=document.querySelector('ul');list.replaceChildren();for(let i=0;i<6;i++){const row=document.createElement('li');row.className='homepage-studio-task homepage-studio-task-archived';row.dataset.archiveDate='true';for(const [tag,cls,text]of [['span','homepage-studio-task-archive-icon','A'],['div','homepage-studio-task-body','Long task content '.repeat(30)],['time','homepage-studio-task-archive-date','2026-10-16'],['button','','R']]){const e=document.createElement(tag);e.className=cls;e.textContent=text;row.append(e);}list.append(row);}},theme);
 const colors=await page.locator('li').first().evaluate(row=>{const body=getComputedStyle(row.querySelector('.homepage-studio-task-body')),date=getComputedStyle(row.querySelector('time'));return [body.color,date.color,body.opacity,date.opacity];});
 assert.equal(colors[0],colors[1],theme+' date color');assert.equal(colors[2],colors[3],theme+' date opacity');
 if(theme==='archive-observatory')assert.ok(await page.locator('li').first().evaluate(row=>parseFloat(getComputedStyle(row).rowGap))<=4);
 const result=await page.locator('ul').evaluate(list=>{const rows=[...list.children];return {overlap:rows.some((row,i)=>{const body=row.querySelector('.homepage-studio-task-body').getBoundingClientRect(),r=row.getBoundingClientRect();return body.bottom>r.bottom+1||(i>0&&r.top<rows[i-1].getBoundingClientRect().bottom-1);}),date:(()=>{const row=rows[0],d=row.querySelector('time').getBoundingClientRect(),b=row.querySelector('.homepage-studio-task-body').getBoundingClientRect();return {below:d.top>=b.bottom-1,right:d.left>=b.right-1};})()};});
 assert.equal(await page.locator('li').evaluateAll(rows=>{const rs=rows.map(r=>r.getBoundingClientRect());return rs.some((a,i)=>rs.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1));}),false,theme+' cards must not overlap');
 assert.equal(await page.locator('li').evaluateAll(rows=>rows.some(row=>row.querySelector('.homepage-studio-task-body').getBoundingClientRect().bottom>row.getBoundingClientRect().bottom+1)),false,theme+' content must fit');
 assert.ok(theme==='archive-observatory'?result.date.below:result.date.right,theme+' date placement');
}
await browser.close();process.stdout.write('PASS: six-theme multiline archive heights and date placement.\n');
