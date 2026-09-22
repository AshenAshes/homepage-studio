import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const bundle = await build({
  stdin: { contents: `
    export { RecurringTaskDraft } from './src/presentation/RecurringTaskDraft';
    export { createMinimalTaskSource, parseHomepageTaskSource } from './src/domain/tasks/taskSource';
    export { mutateHomepageTaskSource } from './src/domain/tasks/taskOperations';
  `, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false
});
const { RecurringTaskDraft, createMinimalTaskSource, parseHomepageTaskSource, mutateHomepageTaskSource } =
  // eslint-disable-next-line no-unsanitized/method -- Imports only the local esbuild test bundle.
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

const turn = () => new Promise((resolve) => setImmediate(resolve));
function fixture(saveOverride) {
  let source = mutateHomepageTaskSource(createMinimalTaskSource(), {
    type: "add-recurring", text: "Original", recurrence: "daily", period: "2026-09-22"
  }).source;
  const target = parseHomepageTaskSource(source).taskSource.tasks[0].target;
  const timers = new Map();
  let nextId = 0;
  const writes = [];
  const save = async (target, text, recurrence) => {
    writes.push({ target, text, recurrence });
    if (saveOverride) return saveOverride(target, text, recurrence);
    const result = mutateHomepageTaskSource(source, {
      type: "update-recurring", target, text, recurrence,
      period: recurrence === "daily" ? "2026-09-22" : "2026-09-21"
    });
    if (result.type === "applied") source = result.source;
    return result;
  };
  const draft = new RecurringTaskDraft("tasks.md", target, "Original", "daily", {
    setTimeout: (fn, ms) => { assert.equal(ms, 500); timers.set(++nextId, fn); return nextId; },
    clearTimeout: (id) => timers.delete(id)
  }, save);
  return { draft, writes, source: () => source, tick: async () => {
    const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((fn) => fn()); await turn();
  } };
}

test("debounces typing and resolves the updated target across repeated real file mutations", async () => {
  const f = fixture();
  f.draft.text = "Fir"; f.draft.schedule();
  f.draft.text = "First"; f.draft.schedule();
  assert.equal(f.writes.length, 0);
  await f.tick();
  assert.equal(f.writes.length, 1);
  f.draft.text = "Second"; f.draft.schedule(); await f.tick();
  assert.equal(f.draft.dirty, false);
  assert.equal(parseHomepageTaskSource(f.source()).taskSource.tasks[0].text, "Second");
});

test("IME composition does not write intermediate input", async () => {
  const f = fixture();
  f.draft.composing = true; f.draft.text = "pin"; f.draft.schedule(); await f.tick();
  await f.draft.flush(); assert.equal(f.writes.length, 0);
  f.draft.composing = false; f.draft.text = "拼音"; f.draft.schedule(); await f.tick();
  assert.equal(f.writes[0].text, "拼音");
});

test("blur/close flushes immediately and cancels the debounce timer", async () => {
  const f = fixture(); f.draft.text = "Saved on close"; f.draft.schedule();
  assert.equal(await f.draft.flush(), true); await f.tick();
  assert.equal(f.writes.length, 1);
});

test("empty names never delete or overwrite the existing task", async () => {
  const f = fixture(); f.draft.text = "  ";
  assert.equal(await f.draft.flush(), false);
  assert.equal(f.writes.length, 0); assert.equal(f.draft.dirty, true);
  assert.equal(f.draft.error.type, "invalid-task");
  assert.equal(parseHomepageTaskSource(f.source()).taskSource.tasks[0].text, "Original");
});

test("a failed save retains the draft and can recover on later edits", async () => {
  let fail = true;
  const f = fixture(async () => fail ? { type: "io-error", path: "tasks.md" } : { type: "noop" });
  f.draft.text = "Keep me"; assert.equal(await f.draft.flush(), false);
  assert.equal(f.draft.text, "Keep me"); assert.equal(f.draft.dirty, true);
  fail = false; assert.equal(await f.draft.flush(), true); assert.equal(f.draft.error, null);
});

test("edits arriving during a write are serialized and the latest value is saved", async () => {
  let release;
  const f = fixture(() => new Promise((resolve) => { release = resolve; }));
  f.draft.text = "First"; const pending = f.draft.flush();
  f.draft.text = "Latest"; f.draft.recurrence = "weekly";
  assert.equal(f.writes.length, 1);
  release({ type: "noop" }); await turn();
  assert.equal(f.writes.length, 2); assert.equal(f.writes[1].text, "Latest");
  assert.equal(f.writes[1].recurrence, "weekly");
  release({ type: "noop" }); await pending;
  assert.equal(f.draft.dirty, false);
});

test("deleting cancels pending autosave; cancelling deletion allows editing to continue", async () => {
  const f = fixture(); f.draft.text = "New"; f.draft.schedule();
  await f.draft.cancel(); await f.tick(); assert.equal(f.writes.length, 0);
  f.draft.resume(); f.draft.schedule(); await f.tick(); assert.equal(f.writes.length, 1);
});

test("external rename supersedes a rejected empty draft without writing it back", async () => {
  const f = fixture(); f.draft.text = "";
  await f.draft.flush();
  assert.equal(f.draft.reconcile([{ ...f.draft.target, rawLine: "Renamed outside" }]), false);
  f.draft.schedule(); await f.tick();
  assert.equal(f.writes.length, 0);
});

test("unchanged source retains failed edits while changed neighbors only refresh the target", async () => {
  const f = fixture(); f.draft.text = ""; await f.draft.flush();
  assert.equal(f.draft.reconcile([f.draft.target]), true);
  assert.equal(f.draft.text, "");
  const moved = { ...f.draft.target, previousTaskLine: "New neighboring task" };
  assert.equal(f.draft.reconcile([moved]), true);
  assert.deepEqual(f.draft.target, moved);
});

test("external deletion removes the orphan draft", async () => {
  const f = fixture(); f.draft.text = ""; await f.draft.flush();
  assert.equal(f.draft.reconcile([]), false);
});

test("source notification during an own save does not discard newer input", async () => {
  let release;
  const f = fixture(() => new Promise((resolve) => { release = resolve; }));
  f.draft.text = "Saving";
  const pending = f.draft.flush();
  assert.equal(f.draft.reconcile([{ ...f.draft.target, rawLine: "Saving" }]), true);
  release({ type: "applied", updatedTarget: { ...f.draft.target, rawLine: "Saving" } });
  await pending;
  assert.equal(f.draft.target.rawLine, "Saving");
});

test("closing discards invalid names without reissuing validation notices", async () => {
  for (const name of ["", "  ", "a\nb", "[homepage-studio-repeat:daily]"]) {
    const f = fixture(); let notices = 0;
    f.draft.onResult = () => { notices++; };
    f.draft.text = name; await f.draft.flush();
    const before = notices;
    await f.draft.close();
    assert.equal(f.draft.text, "Original");
    assert.equal(f.draft.dirty, false); assert.equal(f.draft.error, null);
    assert.equal(notices, before); assert.equal(f.writes.length, 0);
  }
});

test("closing before debounce validation discards the bad name immediately", async () => {
  const f = fixture(); f.draft.text = ""; f.draft.schedule();
  await f.draft.close(); await f.tick();
  assert.equal(f.draft.text, "Original"); assert.equal(f.writes.length, 0);
});

test("closing with an invalid newer edit keeps the last valid in-flight save", async () => {
  let release;
  const f = fixture(() => new Promise((resolve) => { release = resolve; }));
  f.draft.text = "Last valid"; const saving = f.draft.flush();
  f.draft.text = ""; const closing = f.draft.close();
  release({ type: "noop" }); await saving; await closing;
  assert.equal(f.draft.text, "Last valid"); assert.equal(f.draft.dirty, false);
  assert.equal(f.writes.length, 1);
});

test("closing still saves valid names and retains valid drafts on IO errors", async () => {
  const f = fixture(); f.draft.text = "Valid on close";
  await f.draft.close(); assert.equal(f.writes[0].text, "Valid on close");
  const failed = fixture(async () => ({ type: "io-error", path: "tasks.md" }));
  failed.draft.text = "Retain valid work"; await failed.draft.close();
  assert.equal(failed.draft.text, "Retain valid work"); assert.equal(failed.draft.dirty, true);
});
