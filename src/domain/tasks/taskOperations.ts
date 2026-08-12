import {
  createMinimalTaskSource,
  parseHomepageTaskSource,
  type HomepageTaskRecord,
  type TaskRecurrence,
  type TaskSourceDiagnostic,
  type TaskSourceDocument,
  type TaskTarget
} from "./taskSource";
import {
  isMondayTaskDateKey,
  isTaskDateKey,
  type TaskPeriodKeys
} from "./taskRecurrence";

export type TaskMutation =
  | { readonly type: "append-region" }
  | { readonly type: "add"; readonly text: string }
  | {
    readonly type: "add-recurring";
    readonly text: string;
    readonly recurrence: TaskRecurrence;
    readonly period: string;
  }
  | {
    readonly type: "edit";
    readonly target: TaskTarget;
    readonly text: string;
  }
  | {
    readonly type: "set-completed";
    readonly target: TaskTarget;
    readonly completed: boolean;
  }
  | {
    readonly type: "set-recurrence";
    readonly target: TaskTarget;
    readonly recurrence: TaskRecurrence;
    readonly period: string;
  }
  | {
    readonly type: "update-recurring";
    readonly target: TaskTarget;
    readonly text: string;
    readonly recurrence: TaskRecurrence;
    readonly period: string;
  }
  | {
    readonly type: "refresh-recurring";
    readonly periodKeys: TaskPeriodKeys;
  }
  | { readonly type: "archive"; readonly target: TaskTarget }
  | {
    readonly type: "archive-completed";
    readonly targets: readonly TaskTarget[];
  }
  | { readonly type: "unarchive"; readonly target: TaskTarget }
  | { readonly type: "delete"; readonly target: TaskTarget };

export type TaskMutationResult =
  | {
    readonly type: "applied";
    readonly source: string;
  }
  | { readonly type: "noop" }
  | { readonly type: "missing-region" }
  | {
    readonly type: "invalid-source";
    readonly diagnostics: readonly TaskSourceDiagnostic[];
  }
  | {
    readonly type: "invalid-task";
    readonly reason:
      | "empty"
      | "multiline"
      | "reserved-metadata"
      | "invalid-period"
      | "not-completed"
      | "not-archived"
      | "not-recurring"
      | "recurring";
  }
  | {
    readonly type: "conflict";
    readonly reason: "changed" | "deleted" | "ambiguous";
  };

const validateText = (
  text: string
): Extract<TaskMutationResult, { readonly type: "invalid-task" }> | null => {
  if (/[\r\n]/u.test(text)) {
    return { type: "invalid-task", reason: "multiline" };
  }
  if (/\[homepage-studio-(?:repeat|period)\b/u.test(text)) {
    return { type: "invalid-task", reason: "reserved-metadata" };
  }
  return text.trim() === ""
    ? { type: "invalid-task", reason: "empty" }
    : null;
};

const appendRegion = (source: string): TaskMutationResult => {
  const parsed = parseHomepageTaskSource(source);
  if (parsed.type === "valid") {
    return { type: "noop" };
  }
  if (parsed.type === "invalid") {
    return {
      type: "invalid-source",
      diagnostics: parsed.diagnostics
    };
  }
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const prefix = source === ""
    ? ""
    : source.endsWith(newline.repeat(2))
      ? ""
      : source.endsWith(newline)
        ? newline
        : newline.repeat(2);
  return {
    type: "applied",
    source: `${source}${prefix}${createMinimalTaskSource(newline)}`
  };
};

const locateTarget = (
  taskSource: TaskSourceDocument,
  target: TaskTarget
): HomepageTaskRecord | TaskMutationResult => {
  const candidates = taskSource.tasks.filter(
    (task) =>
      task.section === target.section
      && task.rawLine === target.rawLine
  );
  if (candidates.length === 0) {
    const sameSection = taskSource.tasks.filter(
      (task) => task.section === target.section
    );
    const changedCandidates = sameSection.filter((candidate) =>
      candidate.target.previousTaskLine === target.previousTaskLine
      && candidate.target.nextTaskLine === target.nextTaskLine
    );
    return changedCandidates.length === 1
      ? { type: "conflict", reason: "changed" }
      : changedCandidates.length > 1
        ? { type: "conflict", reason: "ambiguous" }
        : { type: "conflict", reason: "deleted" };
  }
  if (candidates.length === 1) {
    return candidates[0] ?? { type: "conflict", reason: "deleted" };
  }
  const contextual = candidates.filter((candidate) =>
    candidate.target.previousTaskLine === target.previousTaskLine
    && candidate.target.nextTaskLine === target.nextTaskLine
  );
  return contextual.length === 1
    ? contextual[0] ?? { type: "conflict", reason: "deleted" }
    : { type: "conflict", reason: "ambiguous" };
};

const insertTask = (
  taskSource: TaskSourceDocument,
  text: string,
  recurrence?: TaskRecurrence,
  period?: string
): TaskMutationResult => {
  const invalid = validateText(text);
  if (invalid !== null) {
    return invalid;
  }
  if (
    recurrence !== undefined
    && (
      period === undefined
      || !isTaskDateKey(period)
      || (recurrence === "weekly" && !isMondayTaskDateKey(period))
    )
  ) {
    return { type: "invalid-task", reason: "invalid-period" };
  }
  const activeTasks = taskSource.tasks.filter(
    (task) => task.section === "active"
  );
  const last = activeTasks[activeTasks.length - 1];
  const offset = last?.lineEnd ?? taskSource.activeContentStart;
  const prefix = last === undefined
    ? taskSource.newline
    : "";
  const source = [
    taskSource.source.slice(0, offset),
    prefix,
    serializeTaskLine(false, text, recurrence, period),
    taskSource.newline,
    taskSource.source.slice(offset)
  ].join("");
  return { type: "applied", source };
};

const replaceLine = (
  taskSource: TaskSourceDocument,
  task: HomepageTaskRecord,
  nextLine: string
): TaskMutationResult => {
  if (task.rawLine === nextLine) {
    return { type: "noop" };
  }
  return {
    type: "applied",
    source: [
      taskSource.source.slice(0, task.lineStart),
      nextLine,
      taskSource.source.slice(task.lineStart + task.rawLine.length)
    ].join("")
  };
};

const serializeTaskBody = (
  text: string,
  recurrence?: TaskRecurrence | null,
  period?: string | null
): string => recurrence === undefined
  || recurrence === null
  || period === undefined
  || period === null
  ? text
  : `${text} [homepage-studio-repeat:: ${recurrence}] [homepage-studio-period:: ${period}]`;

const serializeTaskLine = (
  completed: boolean,
  text: string,
  recurrence?: TaskRecurrence | null,
  period?: string | null
): string => `- [${completed ? "x" : " "}] ${serializeTaskBody(
  text,
  recurrence,
  period
)}`;

const refreshRecurringTasks = (
  taskSource: TaskSourceDocument,
  periodKeys: TaskPeriodKeys
): TaskMutationResult => {
  if (
    !isTaskDateKey(periodKeys.daily)
    || !isMondayTaskDateKey(periodKeys.weekly)
  ) {
    return { type: "invalid-task", reason: "invalid-period" };
  }
  const staleTasks = taskSource.tasks.filter((task) =>
    task.recurrence !== null
    && task.period !== periodKeys[task.recurrence]
  );
  if (staleTasks.length === 0) {
    return { type: "noop" };
  }
  const parts: string[] = [];
  let cursor = 0;
  for (const task of staleTasks) {
    const recurrence = task.recurrence;
    if (recurrence === null) {
      continue;
    }
    parts.push(taskSource.source.slice(cursor, task.lineStart));
    parts.push(serializeTaskLine(
      false,
      task.text,
      recurrence,
      periodKeys[recurrence]
    ));
    cursor = task.lineStart + task.rawLine.length;
  }
  parts.push(taskSource.source.slice(cursor));
  return { type: "applied", source: parts.join("") };
};

const locateTargets = (
  taskSource: TaskSourceDocument,
  targets: readonly TaskTarget[]
): readonly HomepageTaskRecord[] | TaskMutationResult => {
  const located: HomepageTaskRecord[] = [];
  for (const target of targets) {
    const task = locateTarget(taskSource, target);
    if ("type" in task) {
      return task;
    }
    if (located.some((candidate) => candidate.lineStart === task.lineStart)) {
      return { type: "conflict", reason: "ambiguous" };
    }
    located.push(task);
  }
  return located;
};

const removeTaskLines = (
  taskSource: TaskSourceDocument,
  tasks: readonly HomepageTaskRecord[]
): string => {
  const ordered = [...tasks].sort((left, right) =>
    left.lineStart - right.lineStart
  );
  const parts: string[] = [];
  let cursor = 0;
  for (const task of ordered) {
    parts.push(taskSource.source.slice(cursor, task.lineStart));
    cursor = task.lineEnd;
  }
  parts.push(taskSource.source.slice(cursor));
  return parts.join("");
};

const appendTaskLines = (
  source: string,
  destination: "active" | "archive",
  lines: readonly string[]
): TaskMutationResult => {
  const parsed = parseHomepageTaskSource(source);
  if (parsed.type !== "valid") {
    return parsed.type === "missing-region"
      ? { type: "missing-region" }
      : {
        type: "invalid-source",
        diagnostics: parsed.diagnostics
      };
  }
  const taskSource = parsed.taskSource;
  const destinationTasks = taskSource.tasks.filter(
    (task) => task.section === destination
  );
  const last = destinationTasks[destinationTasks.length - 1];
  const offset = last?.lineEnd ?? (
    destination === "active"
      ? taskSource.activeContentStart
      : taskSource.archiveContentStart
  );
  const prefix = last === undefined
    || !source.slice(0, offset).endsWith(taskSource.newline)
    ? taskSource.newline
    : "";
  return {
    type: "applied",
    source: [
      source.slice(0, offset),
      prefix,
      lines.join(taskSource.newline),
      taskSource.newline,
      source.slice(offset)
    ].join("")
  };
};

const moveTasks = (
  taskSource: TaskSourceDocument,
  tasks: readonly HomepageTaskRecord[],
  destination: "active" | "archive"
): TaskMutationResult => {
  if (tasks.length === 0) {
    return { type: "noop" };
  }
  const ordered = [...tasks].sort((left, right) =>
    left.lineStart - right.lineStart
  );
  return appendTaskLines(
    removeTaskLines(taskSource, ordered),
    destination,
    ordered.map((task) => task.rawLine)
  );
};

export const mutateHomepageTaskSource = (
  source: string,
  mutation: TaskMutation
): TaskMutationResult => {
  if (mutation.type === "append-region") {
    return appendRegion(source);
  }
  const parsed = parseHomepageTaskSource(source);
  if (parsed.type === "missing-region") {
    return { type: "missing-region" };
  }
  if (parsed.type === "invalid") {
    return {
      type: "invalid-source",
      diagnostics: parsed.diagnostics
    };
  }
  const taskSource = parsed.taskSource;
  if (mutation.type === "add") {
    return insertTask(taskSource, mutation.text);
  }
  if (mutation.type === "add-recurring") {
    return insertTask(
      taskSource,
      mutation.text,
      mutation.recurrence,
      mutation.period
    );
  }
  if (mutation.type === "refresh-recurring") {
    return refreshRecurringTasks(taskSource, mutation.periodKeys);
  }
  if (mutation.type === "archive-completed") {
    const locatedTasks = locateTargets(taskSource, mutation.targets);
    if ("type" in locatedTasks) {
      return locatedTasks;
    }
    const archivable = locatedTasks.filter(
      (task) => task.recurrence === null
    );
    return archivable.every(
      (task) => task.section === "active" && task.completed
    )
      ? moveTasks(taskSource, archivable, "archive")
      : { type: "invalid-task", reason: "not-completed" };
  }
  const located = locateTarget(taskSource, mutation.target);
  if ("type" in located) {
    return located;
  }
  if (mutation.type === "edit") {
    const invalid = validateText(mutation.text);
    if (invalid !== null) {
      return invalid;
    }
    return replaceLine(
      taskSource,
      located,
      serializeTaskLine(
        located.completed,
        mutation.text,
        located.recurrence,
        located.period
      )
    );
  }
  if (mutation.type === "set-completed") {
    return replaceLine(
      taskSource,
      located,
      serializeTaskLine(
        mutation.completed,
        located.text,
        located.recurrence,
        located.period
      )
    );
  }
  if (
    mutation.type === "set-recurrence"
    || mutation.type === "update-recurring"
  ) {
    if (located.recurrence === null) {
      return { type: "invalid-task", reason: "not-recurring" };
    }
    const text = mutation.type === "update-recurring"
      ? mutation.text
      : located.text;
    const invalid = validateText(text);
    if (invalid !== null) {
      return invalid;
    }
    if (
      !isTaskDateKey(mutation.period)
      || (
        mutation.recurrence === "weekly"
        && !isMondayTaskDateKey(mutation.period)
      )
    ) {
      return { type: "invalid-task", reason: "invalid-period" };
    }
    return replaceLine(
      taskSource,
      located,
      serializeTaskLine(
        located.completed,
        text,
        mutation.recurrence,
        mutation.period
      )
    );
  }
  if (mutation.type === "archive") {
    if (located.recurrence !== null) {
      return { type: "invalid-task", reason: "recurring" };
    }
    return located.section === "active" && located.completed
      ? moveTasks(taskSource, [located], "archive")
      : { type: "invalid-task", reason: "not-completed" };
  }
  if (mutation.type === "unarchive") {
    return located.section === "archive"
      ? moveTasks(taskSource, [located], "active")
      : { type: "invalid-task", reason: "not-archived" };
  }
  return {
    type: "applied",
    source: [
      taskSource.source.slice(0, located.lineStart),
      taskSource.source.slice(located.lineEnd)
    ].join("")
  };
};
