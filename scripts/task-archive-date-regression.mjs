import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:"export * from './src/domain/tasks/taskOperations'; export * from './src/domain/tasks/taskSource'; export * from './src/domain/data/defaults'; export * from './src/domain/data/validation';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
// eslint-disable-next-line no-unsanitized/method -- Import only bundled local source for this regression suite.
const {mutateHomepageTaskSource:mutate,parseHomepageTaskSource:parse,validateTaskText,createDefaultPluginData,normalizePluginDataInput}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const old=createDefaultPluginData();assert.equal(old.tasks.recordArchiveDate,true);delete old.tasks.recordArchiveDate;assert.equal(normalizePluginDataInput(old).tasks.recordArchiveDate,true);old.tasks.recordArchiveDate=false;assert.equal(normalizePluginDataInput(old).tasks.recordArchiveDate,false);
const now=new Date(2026,9,16,0,5);
const tasks=s=>{const p=parse(s);assert.equal(p.type,'valid');return p.taskSource.tasks;};
const apply=(s,m,d=now)=>{const r=mutate(s,m,d);assert.equal(r.type,'applied');return r.source;};
for(const nl of ['\n','\r\n']){
 let source='\uFEFFIntro'+nl+'# Homepage tasks'+nl+'## Active'+nl+'- [x] One [other:: keep]'+nl+'- [x] Two'+nl+'## Archive'+nl+'- [x] Legacy'+nl;
 const original=source;
 for(const type of ['archive','archive-completed']) {
  const result=apply(source,{type,recordDate:false,target:tasks(source)[0].target,targets:tasks(source).filter(t=>t.section==='active').map(t=>t.target)});
  assert.ok(!result.includes('homepage-studio-archived'));
 }

 source=apply(source,{type:'archive',target:tasks(source)[0].target});
 const archived=tasks(source).find(t=>t.text==='One [other:: keep]');
 assert.equal(archived.archivedDate,'2026-10-16');assert.equal(archived.section,'archive');
 assert.ok(source.startsWith('\uFEFFIntro'+nl));assert.ok(source.includes('- [x] Legacy'+nl));
 assert.equal(tasks(source).find(t=>t.text==='Legacy').archivedDate,null);
 source=apply(source,{type:'unarchive',target:archived.target});
 assert.ok(!source.includes('homepage-studio-archived'));
 source=apply(source,{type:'archive-completed',targets:tasks(source).filter(t=>t.section==='active').map(t=>t.target)},new Date(2026,9,17));
 assert.equal(tasks(source).filter(t=>t.archivedDate==='2026-10-17').length,2);
 const one=tasks(source).find(t=>t.text==='One [other:: keep]');
 source=apply(source,{type:'edit',target:one.target,text:'Renamed [other:: keep]'});
 assert.equal(tasks(source).find(t=>t.text==='Renamed [other:: keep]').archivedDate,'2026-10-17');
 const conflict=mutate(original.replace('One','Changed'),{type:'archive',target:tasks(original)[0].target},now);
 assert.equal(conflict.type,'conflict');
 assert.equal(mutate(original,{type:'archive-completed',targets:[tasks(original)[1].target,{...tasks(original)[0].target,rawLine:'- [x] Changed'}]},now).type,'conflict');
 const broken=source.replace('2026-10-17','2026-02-30');assert.equal(parse(broken).type,'invalid');
 const duplicate=source.replace('[homepage-studio-archived:: 2026-10-17]','[homepage-studio-archived:: 2026-10-17] [homepage-studio-archived:: 2026-10-17]');assert.equal(parse(duplicate).type,'invalid');
 const old=tasks(source).find(t=>t.text==='Legacy');source=apply(source,{type:'unarchive',target:old.target});assert.equal(tasks(source).find(t=>t.text==='Legacy').archivedDate,null);
 const renamed=tasks(source).find(t=>t.text==='Renamed [other:: keep]');source=apply(source,{type:'reorder',target:renamed.target,before:tasks(source).find(t=>t.text==='Two').target});assert.equal(tasks(source).find(t=>t.text==='Renamed [other:: keep]').archivedDate,'2026-10-17');
}
assert.equal(validateTaskText('Name [homepage-studio-archived:: 2026-10-16]').reason,'reserved-metadata');
process.stdout.write('PASS: archive dates, batch archive, restore/rearchive, clean display, legacy compatibility, CRLF/BOM, metadata preservation and conflict protection.\n');
