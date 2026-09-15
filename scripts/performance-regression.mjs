import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `
      export { AppStore } from './src/application/AppStore';
      export { HeatmapTrackingService } from './src/application/services/HeatmapTrackingService';
      export { HomepageApplicationFacade } from './src/application/HomepageApplicationFacade';
      export { LocalizationService } from './src/application/services/LocalizationService';
      export { createDefaultPluginData } from './src/domain/data/defaults';
      export { HeatmapEditorTracker } from './src/infrastructure/obsidian/HeatmapEditorTracker';
      export { HomepageView } from './src/presentation/HomepageView';
    `,
    resolveDir: process.cwd(),
    loader: "ts"
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins: [{
    name: "view-host-fixture",
    setup(build) {
      build.onResolve({ filter: /^(obsidian|\.\/HomepageShellRenderer)$/ }, ({ path }) => ({ path, namespace: "fixture" }));
      build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
        contents: path === "obsidian"
          ? `export class Component {
               loaded = false; cleanups = [];
               load() { this.loaded = true; }
               register(callback) { this.cleanups.push(callback); }
               registerDomEvent(target, event, callback) {
                 target.addEventListener(event, callback);
                 this.register(() => target.removeEventListener(event, callback));
               }
               unload() {
                 if (!this.loaded) return;
                 this.loaded = false;
                 while (this.cleanups.length) this.cleanups.pop()();
               }
             }
             export class ItemView extends Component {
               contentEl = {}; containerEl = { closest: () => null };
             }
             export const MarkdownRenderer = {};
             export const setIcon = () => {};`
          : `export const clearHomepageBannerImageState = () => {};
             export const refreshHomepageTemporalContent = () => {};
             export const renderHomepageShell = (container, model, actions, scope) => {
               scope.registerDomEvent(container.ownerDocument, 'visibilitychange', () => {});
             };`,
        loader: "js"
      }));
    }
  }]
});

const {
  AppStore, HeatmapTrackingService, HomepageApplicationFacade,
  LocalizationService, createDefaultPluginData, HeatmapEditorTracker, HomepageView
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

function fakeElement() {
  const listeners = new Set();
  return {
    listeners,
    addEventListener: (_event, callback) => listeners.add(callback),
    removeEventListener: (_event, callback) => listeners.delete(callback),
    querySelector: () => null,
    setAttribute: () => {}, removeAttribute: () => {},
    empty: () => {}, addClass: () => {}, removeClass: () => {}
  };
}

test("repeated homepage rendering and close release DOM and document listeners", async () => {
  const view = new HomepageView({}, {
    getSnapshot: () => ({ status: "ready", shell: { theme: "klein-blue" } }),
    flushJournalDraft: async () => {}
  });
  view.contentEl = fakeElement();
  view.contentEl.ownerDocument = fakeElement();
  view.containerEl = fakeElement();
  for (let i = 0; i < 20; i += 1) view.render();
  const counts = {
    clicks: view.contentEl.listeners.size,
    documentListeners: view.contentEl.ownerDocument.listeners.size
  };
  process.stdout.write(`After 20 renders: ${JSON.stringify(counts)}\n`);
  assert.deepEqual(counts, { clicks: 1, documentListeners: 1 });
  await view.onClose();
  assert.equal(view.contentEl.listeners.size, 0);
  assert.equal(view.contentEl.ownerDocument.listeners.size, 0);
});
test("calendar clicks keep full rendering deferred until the dialog closes", () => {
  const view = new HomepageView({}, {
    getSnapshot: () => ({ status: "ready", shell: { theme: "klein-blue" } })
  });
  view.contentEl = fakeElement();
  view.contentEl.ownerDocument = fakeElement();
  view.containerEl = fakeElement();
  view.render();
  for (const opening of [true, false]) {
    view.journalCalendarOpening = opening;
    view.journalCalendar = opening ? null : {};
    view.textInputInteractionActive = true;
    for (const callback of view.contentEl.listeners) callback({ target: {} });
    assert.equal(view.textInputInteractionActive, true);
  }
  view.renderScope.unload();
});

function fixture() {
  let dateKey = "2026-09-08";
  let writes = 0;
  let notifications = 0;
  const store = new AppStore({ schedule: () => { writes += 1; } });
  const data = createDefaultPluginData();
  // Long-lived vault: five years of per-file writing history.
  for (let day = 0; day < 1826; day += 1) {
    const key = new Date(Date.UTC(2021, 8, 8 + day)).toISOString().slice(0, 10);
    data.heatmap.history[key] = {
      totalWords: 1000,
      files: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`notes/${i}.md`, 50]))
    };
  }
  data.heatmap.sessionDate = dateKey;
  store.initializeReady(data, false);
  store.updateLocalTime({ dateKey, weekday: "tuesday", minuteOfDay: 600, timezoneOffsetMinutes: -480 });
  store.subscribeState(() => { notifications += 1; });
  const tracking = new HeatmapTrackingService(store, {
    localDateKey: () => dateKey,
    now: () => new Date(`${dateKey}T10:00:00Z`)
  });
  return {
    store, tracking,
    counts: () => ({ writes, notifications }),
    nextDay: () => { dateKey = "2026-09-09"; }
  };
}

test("opening unedited notes does not save plugin data or refresh the homepage", () => {
  const { tracking, counts } = fixture();
  const start = performance.now();
  for (let i = 0; i < 10; i += 1) {
    tracking.establishBaseline(`opened/${i}.md`, "original text");
  }
  process.stdout.write(`Open 10 note baselines: ${(performance.now() - start).toFixed(2)} ms; ${JSON.stringify(counts())}\n`);
  assert.deepEqual(counts(), { writes: 0, notifications: 0 });
});

test("first edit retains the opened baseline and unchanged counts do not save again", () => {
  const { store, tracking, counts } = fixture();
  tracking.establishBaseline("new.md", "abc");
  tracking.recordEditorContent("new.md", "abcde");
  assert.equal(store.getState().data.heatmap.history["2026-09-08"].files["new.md"], 2);
  const before = counts();
  tracking.recordEditorContent("new.md", "vwxyz");
  assert.deepEqual(counts(), before);
  tracking.recordEditorContent("new.md", "ab");
  assert.equal(store.getState().data.heatmap.history["2026-09-08"].files["new.md"], undefined);
});

test("pending baselines expire on rollover, count mode changes, and data reload", () => {
  const { store, tracking, nextDay } = fixture();
  tracking.establishBaseline("date.md", "abc");
  nextDay();
  tracking.recordEditorContent("date.md", "abcdef");
  assert.equal(store.getState().data.heatmap.history["2026-09-09"].totalWords, 0);
  tracking.establishBaseline("mode.md", "one two");
  tracking.setCountType("word");
  tracking.recordEditorContent("mode.md", "one two three");
  assert.equal(store.getState().data.heatmap.todaySession["mode.md"].initial, 3);
  tracking.establishBaseline("toggle.md", "one two");
  tracking.setCountType("char");
  tracking.setCountType("word");
  tracking.recordEditorContent("toggle.md", "one two three");
  assert.equal(store.getState().data.heatmap.todaySession["toggle.md"].initial, 3);
  tracking.establishBaseline("reload.md", "old text");
  store.initializeReady(createDefaultPluginData(), false);
  tracking.recordEditorContent("reload.md", "abc");
  assert.equal(store.getState().data.heatmap.todaySession["reload.md"].initial, 3);
});

test("file-open and editor-change events preserve baseline without opening-time notifications", async () => {
  const { tracking, store, counts } = fixture();
  const events = new Map();
  const timers = new Map();
  let nextHandle = 0;
  const tracker = new HeatmapEditorTracker({
    workspace: {
      on: (name, callback) => { events.set(name, callback); return name; },
      offref: (name) => events.delete(name)
    },
    vault: { cachedRead: async () => "abc" }
  }, {
    shouldTrackHeatmapPath: (path) => tracking.shouldTrackPath(path),
    shouldEstablishHeatmapBaseline: (path) => tracking.shouldEstablishBaseline(path),
    establishHeatmapBaseline: (path, content) => tracking.establishBaseline(path, content),
    recordHeatmapEditorContent: (path, content) => tracking.recordEditorContent(path, content)
  }, {
    set: (callback) => { timers.set(++nextHandle, callback); return nextHandle; },
    clear: (handle) => timers.delete(handle)
  });
  tracker.start();
  const file = { path: "event.md", extension: "md" };
  events.get("file-open")(file);
  // Start the first edit before the delayed disk baseline resolves.
  events.get("editor-change")({ getValue: () => "abcde" }, { file });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(counts(), { writes: 0, notifications: 0 });
  for (const callback of [...timers.values()]) callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.getState().data.heatmap.history["2026-09-08"].files["event.md"], 2);
  tracker.stop();
  assert.equal(events.size, 0);
});

test("input and file drag notifications defer full snapshots until interaction ends", () => {
  let fullSnapshots = 0;
  let temporalSnapshots = 0;
  const view = new HomepageView({}, {
    getSnapshot: () => { fullSnapshots += 1; return { status: "ready", shell: {} }; },
    getTemporalSnapshot: () => { temporalSnapshots += 1; return {}; }
  });
  view.textInputInteractionActive = true;
  view.requestRender();
  view.textInputInteractionActive = false;
  view.fileGroupEntryDragActive = true;
  view.requestRender();
  assert.equal(fullSnapshots, 0);
  assert.equal(temporalSnapshots, 2);
  assert.equal(view.renderPending, true);
  let renders = 0;
  view.render = () => { renders += 1; };
  view.endFileGroupEntryDrag();
  assert.equal(renders, 1);
});

test("minute updates in a hidden homepage do not require a full render", () => {
  let temporalSnapshots = 0;
  const view = new HomepageView({}, {
    getTemporalSnapshot: () => { temporalSnapshots += 1; return {}; }
  });
  let hidden = true;
  view.isInactiveTab = () => hidden;
  view.requestTemporalRefresh();
  assert.equal(temporalSnapshots, 0);
  assert.equal(view.renderPending, false);
  assert.equal(view.temporalRefreshPending, true);
  hidden = false;
  view.requestTemporalRefresh();
  assert.equal(temporalSnapshots, 1);
  assert.equal(view.temporalRefreshPending, false);
});

test("background task refresh does not notify for an unchanged source", async () => {
  const { store } = fixture();
  store.transact("configure tasks", "normal", data => {
    data.tasks.filePath = "tasks.md";
    return data;
  });
  const application = new HomepageApplicationFacade({}, new LocalizationService("zh"), store);
  let source = "original";
  let failed = false;
  application.taskSource = {
    load: async path => failed
      ? { type: "io-error", path }
      : { type: "loaded", path, taskSource: { source, tasks: [] } },
    watch: () => () => {}
  };
  let notifications = 0;
  application.subscribeHomepageState(() => { notifications += 1; });
  const stop = application.startTaskSourceLifecycle();
  await new Promise(resolve => setImmediate(resolve));
  notifications = 0;
  application.refreshRecurringTasks();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(notifications, 0);
  source = "changed";
  application.refreshRecurringTasks();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(notifications, 1);
  failed = true;
  application.refreshRecurringTasks();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(notifications, 2);
  failed = false;
  application.refreshRecurringTasks();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(notifications, 3);
  // Explicit reload must still notify: it also clears interaction conflicts.
  await application.reloadTaskSource();
  assert.equal(notifications, 4);
  stop();
});

test("homepage snapshot does not clone complete persisted history", () => {
  const { store } = fixture();
  const application = new HomepageApplicationFacade({}, new LocalizationService("zh"), store);
  const originalClone = globalThis.structuredClone;
  let fullClones = 0;
  globalThis.structuredClone = (value, ...args) => {
    if (value?.data?.heatmap?.history || value?.heatmap?.history) fullClones += 1;
    return originalClone(value, ...args);
  };
  try {
    const start = performance.now();
    const snapshot = application.getSnapshot();
    process.stdout.write(`Homepage snapshot: ${(performance.now() - start).toFixed(2)} ms; full history clones: ${fullClones}\n`);
    assert.equal(snapshot.status, "ready");
    assert.equal(fullClones, 0);
    snapshot.shell.modules.length = 0;
    assert.ok(application.getSnapshot().shell.modules.length > 0);
  } finally {
    globalThis.structuredClone = originalClone;
  }
});
