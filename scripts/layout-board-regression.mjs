import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
const bundle = await build({ stdin: { contents: `
  export * from './src/domain/layout/layout';
  export { createDefaultPluginData } from './src/domain/data/defaults';
  export { validatePluginData } from './src/domain/data/validation';
`, loader: "ts", resolveDir: process.cwd() }, bundle: true, platform: "node", format: "esm", write: false });
// eslint-disable-next-line no-unsanitized/method -- Imports only the local esbuild test bundle.
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const themes = ["klein-blue", "watercolor-journal", "celestial-orbit", "minimal-paper", "archive-observatory", "cosmic-cartography"];
const validate = (theme, layout) => {
  const data = api.createDefaultPluginData(); data.layouts[theme] = layout;
  assert.equal(api.validatePluginData(data).type, "valid");
};
test("all defaults migrate to valid independent boards and remain idempotent", () => {
  for (const theme of themes) {
    const layout = api.getDefaultLayout(theme);
    validate(theme, layout);
    assert.deepEqual(api.getLayout({ [theme]: layout }, theme), layout);
    assert.equal(new Set(layout.moduleOrder).size, 5);
    assert.equal(layout.sizes['file-groups'], theme === 'cosmic-cartography' ? 'standard' : 'expanded');
  }
});
test("legacy 6+6 converts to 5+7 without changing other theme settings", () => {
  const legacy = { moduleOrder: [...api.HOMEPAGE_MODULE_IDS], hiddenModules: ['tasks'], bannerVisible: true,
    sizes: {heatmap:'standard','current-plan':'standard',journal:'expanded',tasks:'compact','file-groups':'expanded'} };
  const original = structuredClone(legacy);
  const layout = api.migrateLayout(legacy, 'klein-blue');
  assert.deepEqual(legacy, original);
  assert.equal(layout.sizes.heatmap,'compact'); assert.equal(layout.sizes['current-plan'],'standard');
  assert.deepEqual(layout.hiddenModules,['tasks']); validate('klein-blue',layout);
});
test("paper default uses a generic stack and any other theme can use the same structure", () => {
  const paper = api.getDefaultLayout('minimal-paper');
  assert.ok(paper.board.rows.some(row=>row.columns.some(col=>JSON.stringify(col.modules)===JSON.stringify(['current-plan','tasks']))));
  let layout=api.getDefaultLayout('klein-blue');
  layout=api.placeLayoutModule(layout,'tasks','current-plan','below');
  assert.ok(layout.board.rows.some(row=>row.columns.some(col=>col.modules.includes('tasks')&&col.modules.includes('current-plan'))));
  validate('klein-blue',layout);
});
test("visibility preserves slots and widths, hides empty rows, and restores position", () => {
  const original=api.getDefaultLayout('archive-observatory');
  const hidden=api.setModuleVisibility(original,'journal',false);
  assert.deepEqual(hidden.board,original.board);assert.deepEqual(hidden.sizes,original.sizes);
  const row=api.visibleLayoutRows(hidden).find(row=>row.columns.some(col=>col.modules.includes('current-plan')));
  assert.equal(row.columns[0].modules.length,0);
  assert.deepEqual(api.setModuleVisibility(hidden,'journal',true),original);
  let empty=hidden;for(const id of original.moduleOrder)empty=api.setModuleVisibility(empty,id,false);
  assert.equal(api.visibleLayoutRows(empty).length,0);validate('archive-observatory',empty);
});
test("column resizing updates a stack together and moves an overflowing column to its own row",()=>{
  const base=api.getDefaultLayout('minimal-paper');
  const next=api.setModuleSize(base,'tasks','expanded');
  assert.equal(next.sizes['current-plan'],'expanded');assert.equal(next.sizes.tasks,'expanded');
  validate('minimal-paper',next);assert.equal(base.sizes.tasks,'compact');
});
test("all legal drag placements preserve every module exactly once",()=>{
  for(const theme of themes)for(const source of api.HOMEPAGE_MODULE_IDS)for(const target of api.HOMEPAGE_MODULE_IDS)
    for(const placement of ['above','below','left','right','row-before','row-after']){
      const layout=api.getDefaultLayout(theme);const next=api.placeLayoutModule(layout,source,target,placement);
      if(next)validate(theme,next);
    }
});
test("schema rejects duplicate modules, excessive row width and size mismatches",()=>{
  for(const corrupt of [layout=>layout.board.rows[0].columns[0].modules.push('tasks'),
    layout=>layout.board.rows[0].columns.forEach(col=>col.size='expanded'),
    layout=>layout.sizes.heatmap='compact']){
    const layout=api.getDefaultLayout('klein-blue');corrupt(layout);const data=api.createDefaultPluginData();data.layouts['klein-blue']=layout;
    assert.equal(api.validatePluginData(data).type,'invalid');
  }
});
