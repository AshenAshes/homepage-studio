import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const bundle = await build({
  stdin: { contents: `
    export * from './src/domain/tasks/taskRecurrence';
    export { normalizePluginDataInput } from './src/domain/data/validation';
    export * from './src/domain/tasks/taskSource';
    export * from './src/domain/tasks/taskOperations';
    export { AppStore } from './src/application/AppStore';
    export { HomepageApplicationFacade } from './src/application/HomepageApplicationFacade';
    export { LocalizationService } from './src/application/services/LocalizationService';
    export { TaskSourceService } from './src/application/services/TaskSourceService';
    export { createDefaultPluginData } from './src/domain/data/defaults';
  `, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false
});
// eslint-disable-next-line no-unsanitized/method -- Local source bundled for the regression suite.
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const keys = api.taskPeriodKeysForDate;
const period = api.taskPeriodKeyFor;
const tasks = (source) => {
  const parsed = api.parseHomepageTaskSource(source);
  assert.equal(parsed.type, "valid", JSON.stringify(parsed));
  return parsed.taskSource.tasks;
};
const apply = (source, mutation) => {
  const result = api.mutateHomepageTaskSource(source, mutation);
  assert.equal(result.type, "applied", JSON.stringify(result));
  return result.source;
};
function seed(recurrence = "daily", schedule = { time: "04:00" }) {
  let source = apply(api.createMinimalTaskSource(), {
    type: "add-recurring", text: "Task", recurrence, schedule,
    period: period(recurrence, keys("2026-09-23", 239), schedule)
  });
  source = apply(source, { type: "set-completed", target: tasks(source)[0].target, completed: true });
  return source;
}

test("daily boundary is inclusive and handles leap days and year rollover", () => {
  for (const [date, previous] of [["2026-09-23", "2026-09-22"], ["2024-03-01", "2024-02-29"], ["2027-01-01", "2026-12-31"]]) {
    assert.equal(period("daily", keys(date, 239), { time: "04:00" }), previous);
    assert.equal(period("daily", keys(date, 240), { time: "04:00" }), date);
  }
});

test("weekly refresh uses its own weekday and time but keeps Monday period identifiers", () => {
  const rule = { day: "wed", time: "04:00" };
  assert.equal(period("weekly", keys("2026-09-23", 239), rule), "2026-09-14");
  assert.equal(period("weekly", keys("2026-09-23", 240), rule), "2026-09-21");
  assert.equal(period("weekly", keys("2026-09-29", 1439), rule), "2026-09-21");
  assert.equal(period("weekly", keys("2026-09-30", 240), rule), "2026-09-28");
  assert.equal(period("weekly", keys("2026-09-27", 1439), { day: "sun", time: "23:59" }), "2026-09-21");
});

test("legacy tasks default to midnight/Monday without adding fields", () => {
  const source = seed("daily", {});
  assert.deepEqual(tasks(source)[0].schedule, {});
  assert.ok(!source.includes("reset-time"));
  const changed = apply(source, { type: "edit", target: tasks(source)[0].target, text: "Renamed" });
  assert.ok(!changed.includes("reset-time"));
  assert.equal(period("daily", keys("2026-09-23", 0)), "2026-09-23");
  assert.equal(period("weekly", keys("2026-09-21", 0)), "2026-09-21");
});

test("refresh is once per boundary, catches up after absence and ignores backward clocks", () => {
  let source = seed();
  assert.equal(api.mutateHomepageTaskSource(source, { type: "refresh-recurring", periodKeys: keys("2026-09-23", 239) }).type, "noop");
  source = apply(source, { type: "refresh-recurring", periodKeys: keys("2026-09-23", 240) });
  assert.equal(tasks(source)[0].completed, false);
  assert.equal(tasks(source)[0].period, "2026-09-23");
  assert.deepEqual(tasks(source)[0].schedule, { time: "04:00" });
  assert.equal(api.mutateHomepageTaskSource(source, { type: "refresh-recurring", periodKeys: keys("2026-09-23", 240) }).type, "noop");
  assert.equal(api.mutateHomepageTaskSource(source, { type: "refresh-recurring", periodKeys: keys("2026-09-22", 240) }).type, "noop");
  source = apply(source, { type: "refresh-recurring", periodKeys: keys("2026-10-05", 240) });
  assert.equal(tasks(source).length, 1);
  assert.equal(tasks(source)[0].period, "2026-10-05");
});

test("rename, completion, reorder and type changes preserve applicable metadata", () => {
  let source = seed("weekly", { day: "wed", time: "04:00" });
  source = apply(source, { type: "edit", target: tasks(source)[0].target, text: "Renamed" });
  assert.deepEqual(tasks(source)[0].schedule, { day: "wed", time: "04:00" });
  source = apply(source, { type: "set-completed", target: tasks(source)[0].target, completed: false });
  assert.deepEqual(tasks(source)[0].schedule, { day: "wed", time: "04:00" });
  source = apply(source, { type: "add-recurring", text: "Second", recurrence: "weekly", period: "2026-09-14", schedule: { time: "06:00", day: "fri" } });
  source = apply(source, { type: "reorder", target: tasks(source)[1].target, before: tasks(source)[0].target });
  assert.deepEqual(tasks(source)[0].schedule, { day: "fri", time: "06:00" });
  source = apply(source, { type: "set-recurrence", target: tasks(source)[0].target, recurrence: "daily", period: "2026-09-22" });
  assert.deepEqual(tasks(source)[0].schedule, { time: "06:00" });
});

test("invalid, duplicate and inapplicable fields are rejected without silently defaulting", () => {
  const base = seed();
  for (const replacement of ["24:00", "4:00", "04:60", "", "oops"]) {
    const parsed = api.parseHomepageTaskSource(base.replace("reset-time:: 04:00", `reset-time:: ${replacement}`));
    assert.equal(parsed.type, "invalid");
    assert.ok(parsed.diagnostics.some((d) => d.code === "TASK-RECURRING-RESET-TIME"));
  }
  for (const field of [" [homepage-studio-reset-time:: 05:00]", " [homepage-studio-reset-day:: mon]"]) {
    assert.equal(api.parseHomepageTaskSource(base.replace(" [homepage-studio-period", `${field} [homepage-studio-period`)).type, "invalid");
  }
  const weekly = seed("weekly", { day: "wed", time: "04:00" });
  assert.equal(api.parseHomepageTaskSource(weekly.replace("reset-day:: wed", "reset-day:: xyz")).type, "invalid");
});

const settle = () => new Promise((resolve) => setImmediate(resolve));
async function fixture() {
  let source = seed(); let reads = 0; let writes = 0;
  const service = new api.TaskSourceService({
    read: async (path) => { reads++; return { type: "loaded", path, source }; },
    process: async (_path, mutate) => { const output = mutate(source); source = output.source; writes++; return { type: "processed", result: output.result }; },
    watch: () => () => {}
  });
  const store = new api.AppStore({ schedule: () => {} });
  const data = api.createDefaultPluginData(); data.tasks.filePath = "tasks.md";
  store.initializeReady(data, false);
  const tick = async (minuteOfDay) => {
    store.updateLocalTime({ dateKey: "2026-09-23", weekday: "wednesday", minuteOfDay, timezoneOffsetMinutes: -480 });
    await settle();
  };
  await tick(238);
  const app = new api.HomepageApplicationFacade({}, new api.LocalizationService("zh"), store, {}, {}, {}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, service);
  const stop = app.startTaskSourceLifecycle(); await settle();
  return { app, tick, stop, source: () => source, counts: () => ({ reads, writes }) };
}

test("minute ticks refresh at 04:00 without reading/writing every minute", async () => {
  const f = await fixture();
  try {
    await f.tick(239); const before = f.counts();
    await f.tick(240);
    assert.equal(tasks(f.source())[0].completed, false);
    assert.equal(f.counts().writes, before.writes + 1);
    const refreshed = f.counts();
    for (let minute = 241; minute <= 250; minute++) await f.tick(minute);
    assert.deepEqual(f.counts(), refreshed);
  } finally { f.stop(); }
});

test("changing the rule rebases the period but preserves completion until the next boundary", async () => {
  const f = await fixture();
  try {
    const item = f.app.getTaskSettings().recurringTasks[0];
    const result = await f.app.updateRecurringTask(item.target, item.text, "weekly", { time: "05:00", day: "wed" });
    assert.equal(result.type, "applied");
    assert.equal(tasks(f.source())[0].completed, true);
    assert.equal(tasks(f.source())[0].period, "2026-09-14");
    await f.tick(299); assert.equal(tasks(f.source())[0].completed, true);
    await f.tick(300); assert.equal(tasks(f.source())[0].completed, false);
    assert.equal(tasks(f.source())[0].period, "2026-09-21");
  } finally { f.stop(); }
});


test("refresh labels default off, migrate old settings, and never change task metadata", async () => {
  const old = api.createDefaultPluginData(); delete old.tasks.showRefreshTime;
  assert.equal(api.normalizePluginDataInput(old).tasks.showRefreshTime, false);
  const f = await fixture();
  try {
    const label = () => f.app.getSnapshot().shell.modules.find((m) => m.id === "tasks").tasks.items[0].recurrenceLabel;
    assert.equal(f.app.getTaskSettings().showRefreshTime, false);
    assert.equal(label(), "每日");
    const source = f.source();
    f.app.setShowTaskRefreshTime(true);
    assert.equal(label(), "每日04:00");
    assert.equal(f.source(), source);
    const item = f.app.getTaskSettings().recurringTasks[0];
    await f.app.updateRecurringTask(item.target, item.text, "weekly", { time: "00:00", day: "mon" });
    assert.equal(label(), "每周一00:00");
    const weeklySource = f.source();
    f.app.setShowTaskRefreshTime(false);
    assert.equal(label(), "每周");
    assert.equal(f.source(), weeklySource);
  } finally { f.stop(); }
});
