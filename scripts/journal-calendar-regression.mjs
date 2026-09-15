import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `
      export * from './src/domain/journal/calendar';
      export { AppStore } from './src/application/AppStore';
      export { HomepageApplicationFacade } from './src/application/HomepageApplicationFacade';
      export { LocalizationService } from './src/application/services/LocalizationService';
      export { createDefaultPluginData } from './src/domain/data/defaults';
      export { DateSectionJournalService } from './src/application/services/DateSectionJournalService';
      export { DateSectionJournalDraftService } from './src/application/services/DateSectionJournalDraftService';
    `,
    resolveDir: process.cwd(), loader: "ts"
  },
  bundle: true, platform: "node", format: "esm", write: false
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

test("Monday-first calendar covers leap days, year boundaries and early years", () => {
  const days = api.journalMonthDays("2024-02");
  assert.equal(days.length, 42);
  assert.equal(days[0], "2024-01-29");
  assert.ok(days.includes("2024-02-29"));
  assert.equal(api.journalMonthDays("2026-01")[0], "2025-12-29");
  assert.ok(api.journalMonthDays("0099-01").includes("0099-01-01"));
  assert.ok(api.isJournalDateKey("2024-02-29"));
  for (const key of ["2026-02-29", "2026-13-01", "0000-01-01", "oops"]) {
    assert.equal(api.isJournalDateKey(key), false);
  }
});

async function fixture() {
  let source = "## 2026-09-10\n\nExisting entry\n";
  let writes = 0;
  let failure = false;
  let watch = () => {};
  const files = {
    read: async (path) => ({ type: "loaded", path, source }),
    process: async (path, mutate) => {
      if (failure) return { type: "io-error", path, cause: "test failure" };
      const result = mutate(source);
      source = result.source;
      writes++;
      queueMicrotask(() => watch({ type: "changed", path }));
      return { type: "processed", result: result.result };
    },
    watch: (_path, listener) => { watch = listener; return () => {}; }
  };
  const service = new api.DateSectionJournalService(files);
  const drafts = new api.DateSectionJournalDraftService(service, { set: () => 1, clear: () => {} });
  const store = new api.AppStore({ schedule: () => {} });
  const data = api.createDefaultPluginData();
  data.journal.filePath = "journal.md";
  store.initializeReady(data, false);
  store.updateLocalTime({ dateKey: "2026-09-16", weekday: "wednesday", minuteOfDay: 600, timezoneOffsetMinutes: -480 });
  const facade = new api.HomepageApplicationFacade({}, new api.LocalizationService("zh"), store,
    {}, {}, {}, undefined, undefined, undefined, service, drafts);
  const stop = facade.startDateSectionJournalLifecycle();
  await new Promise((resolve) => setImmediate(resolve));
  const journal = () => facade.getSnapshot().shell.modules.find((module) => module.id === "journal").journal;
  return { facade, drafts, journal, stop, source: () => source, writes: () => writes, fail: () => { failure = true; } };
}

test("browsing empty days never writes; typing creates the selected day and preserves existing entries", async () => {
  const f = await fixture();
  try {
    f.facade.setJournalViewMode("preview");
    assert.equal(await f.facade.selectJournalDate("2026-09-11"), true);
    assert.equal(f.journal().viewMode, "edit");
    assert.equal(f.journal().dateKey, "2026-09-11");
    assert.equal(f.journal().content, "");
    assert.equal(f.writes(), 0);
    assert.deepEqual(f.journal().calendar.entryDates, ["2026-09-10"]);
    f.facade.updateJournalDraft("New entry");
    assert.equal(await f.facade.selectJournalDate("2026-09-10"), true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(f.source(), /## 2026-09-11\n\nNew entry/u);
    assert.equal(f.journal().content, "Existing entry");
    assert.ok(f.journal().calendar.entryDates.includes("2026-09-11"));
  } finally { f.stop(); }
});

test("future dates and invalid dates cannot navigate or create; next-day arrow remains bounded", async () => {
  const f = await fixture();
  try {
    for (const key of ["2026-09-17", "2026-02-30", "bad"]) {
      assert.equal(await f.facade.selectJournalDate(key), false);
    }
    await f.facade.moveJournalDate(1);
    assert.equal(f.journal().dateKey, "2026-09-16");
    assert.equal(f.journal().canMoveNext, false);
    assert.equal(f.writes(), 0);
  } finally { f.stop(); }
});

test("failed saves preserve the current date and unsaved draft", async () => {
  const f = await fixture();
  try {
    f.facade.updateJournalDraft("Do not lose this");
    f.fail();
    assert.equal(await f.facade.selectJournalDate("2026-09-10"), false);
    assert.equal(f.journal().dateKey, "2026-09-16");
    assert.equal(f.journal().content, "Do not lose this");
    assert.equal(f.drafts.hasUnsavedDraft(), true);
  } finally { f.stop(); }
});
