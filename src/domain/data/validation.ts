import type { Diagnostic } from "../diagnostics";
import { validatePluginDataShape } from "./shapeValidation";
import type {
  BannerSource,
  PlanPeriod,
  PluginData,
  Weekday
} from "./types";

export type PluginDataValidation =
  | { readonly type: "valid"; readonly data: PluginData }
  | { readonly type: "invalid"; readonly diagnostics: readonly Diagnostic[] };

const WEEKDAYS: readonly Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
];
const MINUTES_PER_DAY = 1440;
const MINUTES_PER_WEEK = MINUTES_PER_DAY * WEEKDAYS.length;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (record: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

const diagnostic = (
  code: Diagnostic["code"],
  details: string,
  messageKey: Diagnostic["messageKey"] = "diagnosticInvalidData",
  pointer = "/"
): Diagnostic => ({
  code,
  messageKey,
  relatedPaths: [`data.json#${pointer}`],
  details,
  severity: "error",
  suggestedActionKey: "diagnosticRepairData"
});

const normalizeLegacyOptionalFields = (input: unknown): unknown => {
  if (!isRecord(input)) {
    return input;
  }

  const normalized = structuredClone(input);
  if (!isRecord(normalized)) {
    return input;
  }

  if (isRecord(normalized.heatmap)) {
    const heatmap = normalized.heatmap;
    if (!hasOwn(heatmap, "countType")) {
      heatmap.countType = heatmap.language === "zh" ? "char" : "word";
    }
    if (!hasOwn(heatmap, "historyRetentionDays")) {
      heatmap.historyRetentionDays = 0;
    }
    if (!hasOwn(heatmap, "language")) {
      heatmap.language = "auto";
    }
  }

  if (isRecord(normalized.banner)) {
    if (!hasOwn(normalized.banner, "title")) {
      normalized.banner.title = null;
    }
    if (!hasOwn(normalized.banner, "subtitle")) {
      normalized.banner.subtitle = null;
    }
  }

  if (
    isRecord(normalized.tasks)
    && !hasOwn(normalized.tasks, "showArchiveToggle")
  ) {
    normalized.tasks.showArchiveToggle = true;
  }

  return normalized;
};

export const normalizePluginDataInput = (input: unknown): unknown =>
  normalizeLegacyOptionalFields(input);

interface Interval {
  readonly start: number;
  readonly end: number;
}

const splitCyclicInterval = (
  start: number,
  end: number,
  cycleLength: number
): readonly Interval[] => {
  if (end <= cycleLength) {
    return [{ start, end }];
  }
  return [
    { start, end: cycleLength },
    { start: 0, end: end - cycleLength }
  ];
};

const hasOverlap = (intervals: readonly Interval[]): boolean => {
  const ordered = [...intervals].sort((left, right) =>
    left.start - right.start || left.end - right.end
  );
  return ordered.some((current, index) => {
    const previous = ordered[index - 1];
    return previous !== undefined && current.start < previous.end;
  });
};

const validatePeriodIds = (
  entries: readonly {
    readonly period: PlanPeriod;
    readonly path: string;
  }[],
  owner: string,
  diagnostics: Diagnostic[]
): void => {
  const seen = new Set<string>();
  for (const { period, path } of entries) {
    if (seen.has(period.id)) {
      diagnostics.push(diagnostic(
        "DATA-DUPLICATE-ID",
        `Duplicate period ID "${period.id}" in ${owner}.`,
        "diagnosticInvalidData",
        `${path}/id`
      ));
    }
    seen.add(period.id);
    if (period.endMinute <= period.startMinute) {
      diagnostics.push(diagnostic(
        "DATA-INVALID-PERIOD",
        `Period "${period.id}" must end after it starts.`,
        "diagnosticInvalidData",
        path
      ));
    }
    if (period.endMinute - period.startMinute > MINUTES_PER_DAY) {
      diagnostics.push(diagnostic(
        "DATA-INVALID-PERIOD",
        `Period "${period.id}" crosses more than one midnight.`,
        "diagnosticInvalidData",
        path
      ));
    }
  }
};

const validatePlans = (data: PluginData, diagnostics: Diagnostic[]): void => {
  const dailyIds = new Set<string>();
  for (const [templateIndex, template] of data.plans.dailyTemplates.entries()) {
    const templatePath = `/plans/dailyTemplates/${templateIndex}`;
    if (dailyIds.has(template.id)) {
      diagnostics.push(diagnostic(
        "DATA-DUPLICATE-ID",
        `Duplicate daily template ID "${template.id}".`,
        "diagnosticInvalidData",
        `${templatePath}/id`
      ));
    }
    dailyIds.add(template.id);
    validatePeriodIds(
      template.periods.map((period, periodIndex) => ({
        period,
        path: `${templatePath}/periods/${periodIndex}`
      })),
      `daily template "${template.id}"`,
      diagnostics
    );
    const intervals = template.periods.flatMap((period) =>
      splitCyclicInterval(period.startMinute, period.endMinute, MINUTES_PER_DAY)
    );
    if (hasOverlap(intervals)) {
      diagnostics.push(diagnostic(
        "DATA-PLAN-OVERLAP",
        `Daily template "${template.id}" contains overlapping periods.`,
        "diagnosticInvalidData",
        `${templatePath}/periods`
      ));
    }
  }

  const weeklyIds = new Set<string>();
  for (const [templateIndex, template] of data.plans.weeklyTemplates.entries()) {
    const templatePath = `/plans/weeklyTemplates/${templateIndex}`;
    if (weeklyIds.has(template.id)) {
      diagnostics.push(diagnostic(
        "DATA-DUPLICATE-ID",
        `Duplicate weekly template ID "${template.id}".`,
        "diagnosticInvalidData",
        `${templatePath}/id`
      ));
    }
    weeklyIds.add(template.id);
    const periodEntries = WEEKDAYS.flatMap((day) =>
      template.days[day].map((period, periodIndex) => ({
        period,
        path: `${templatePath}/days/${day}/${periodIndex}`
      }))
    );
    validatePeriodIds(
      periodEntries,
      `weekly template "${template.id}"`,
      diagnostics
    );
    const intervals = WEEKDAYS.flatMap((day, dayIndex) =>
      template.days[day].flatMap((period) =>
        splitCyclicInterval(
          dayIndex * MINUTES_PER_DAY + period.startMinute,
          dayIndex * MINUTES_PER_DAY + period.endMinute,
          MINUTES_PER_WEEK
        )
      )
    );
    if (hasOverlap(intervals)) {
      diagnostics.push(diagnostic(
        "DATA-PLAN-OVERLAP",
        `Weekly template "${template.id}" contains overlapping periods.`,
        "diagnosticInvalidData",
        `${templatePath}/days`
      ));
    }
  }

  if (
    data.plans.selectedDailyTemplateId !== null
    && !dailyIds.has(data.plans.selectedDailyTemplateId)
  ) {
    diagnostics.push(diagnostic(
      "DATA-INVALID-REFERENCE",
      `Selected daily template "${data.plans.selectedDailyTemplateId}" does not exist.`,
      "diagnosticInvalidData",
      "/plans/selectedDailyTemplateId"
    ));
  }
  if (
    data.plans.selectedWeeklyTemplateId !== null
    && !weeklyIds.has(data.plans.selectedWeeklyTemplateId)
  ) {
    diagnostics.push(diagnostic(
      "DATA-INVALID-REFERENCE",
      `Selected weekly template "${data.plans.selectedWeeklyTemplateId}" does not exist.`,
      "diagnosticInvalidData",
      "/plans/selectedWeeklyTemplateId"
    ));
  }
};

const isRealCalendarDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(0);
  candidate.setFullYear(year, month - 1, day);
  candidate.setHours(0, 0, 0, 0);
  return candidate.getFullYear() === year
    && candidate.getMonth() === month - 1
    && candidate.getDate() === day;
};

const validateHeatmap = (data: PluginData, diagnostics: Diagnostic[]): void => {
  for (const [date, stats] of Object.entries(data.heatmap.history)) {
    if (!isRealCalendarDate(date)) {
      diagnostics.push(diagnostic(
        "DATA-INVALID-DATE",
        `Heatmap date "${date}" is not a real calendar date.`,
        "diagnosticInvalidData",
        `/heatmap/history/${date}`
      ));
    }
    const contributions = Object.values(stats.files);
    if (
      contributions.length > 0
      && contributions.reduce((total, value) => total + value, 0) !== stats.totalWords
    ) {
      diagnostics.push(diagnostic(
        "DATA-HEATMAP-TOTAL",
        `Heatmap total for "${date}" does not match its file contributions.`,
        "diagnosticInvalidData",
        `/heatmap/history/${date}/totalWords`
      ));
    }
  }
  if (
    data.heatmap.sessionDate !== ""
    && !isRealCalendarDate(data.heatmap.sessionDate)
  ) {
    diagnostics.push(diagnostic(
      "DATA-INVALID-DATE",
      `Session date "${data.heatmap.sessionDate}" is not a real calendar date.`,
      "diagnosticInvalidData",
      "/heatmap/sessionDate"
    ));
  }
  const [low, medium, high] = data.heatmap.preferences.thresholds;
  if (!(low < medium && medium < high)) {
    diagnostics.push(diagnostic(
      "DATA-HEATMAP-THRESHOLDS",
      "Heatmap thresholds must be strictly increasing.",
      "diagnosticInvalidData",
      "/heatmap/preferences/thresholds"
    ));
  }
};

const validateFileGroups = (data: PluginData, diagnostics: Diagnostic[]): void => {
  const groupIds = new Set<string>();
  const entryIds = new Set<string>();
  for (const [groupIndex, group] of data.fileGroups.entries()) {
    const groupPath = `/fileGroups/${groupIndex}`;
    if (groupIds.has(group.id)) {
      diagnostics.push(diagnostic(
        "DATA-DUPLICATE-ID",
        `Duplicate file group ID "${group.id}".`,
        "diagnosticInvalidData",
        `${groupPath}/id`
      ));
    }
    groupIds.add(group.id);
    const paths = new Set<string>();
    for (const [entryIndex, entry] of group.entries.entries()) {
      const entryPath = `${groupPath}/entries/${entryIndex}`;
      if (entryIds.has(entry.id)) {
        diagnostics.push(diagnostic(
          "DATA-DUPLICATE-ID",
          `Duplicate file entry ID "${entry.id}".`,
          "diagnosticInvalidData",
          `${entryPath}/id`
        ));
      }
      entryIds.add(entry.id);
      if (paths.has(entry.path)) {
        diagnostics.push(diagnostic(
          "DATA-DUPLICATE-PATH",
          `Duplicate path "${entry.path}" in file group "${group.id}".`,
          "diagnosticInvalidData",
          `${entryPath}/path`
        ));
      }
      paths.add(entry.path);
    }
  }
};

const isValidRemoteSource = (source: BannerSource | null): boolean => {
  if (source === null || source.type === "vault") {
    return true;
  }
  try {
    const url = new URL(source.value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const validatePathsAndUrls = (data: PluginData, diagnostics: Diagnostic[]): void => {
  const escapePointer = (value: string): string =>
    value.replace(/~/g, "~0").replace(/\//g, "~1");
  const paths: Array<{ readonly value: string; readonly pointer: string }> = [];
  const addNullablePath = (value: string | null, pointer: string): void => {
    if (value !== null) {
      paths.push({ value, pointer });
    }
  };
  addNullablePath(data.journal.filePath, "/journal/filePath");
  addNullablePath(data.tasks.filePath, "/tasks/filePath");
  data.fileGroups.forEach((group, groupIndex) => {
    group.entries.forEach((entry, entryIndex) => {
      paths.push({
        value: entry.path,
        pointer: `/fileGroups/${groupIndex}/entries/${entryIndex}/path`
      });
    });
  });
  data.heatmap.preferences.excludeFolders.forEach((value, index) => {
    paths.push({
      value,
      pointer: `/heatmap/preferences/excludeFolders/${index}`
    });
  });
  Object.keys(data.heatmap.todaySession).forEach((value) => {
    paths.push({
      value,
      pointer: `/heatmap/todaySession/${escapePointer(value)}`
    });
  });
  Object.entries(data.heatmap.history).forEach(([date, stats]) => {
    Object.keys(stats.files).forEach((value) => {
      paths.push({
        value,
        pointer: `/heatmap/history/${date}/files/${escapePointer(value)}`
      });
    });
  });

  for (const { value, pointer } of paths) {
    if (value.includes("\\")) {
      diagnostics.push(diagnostic(
        "DATA-INVALID-PATH",
        `Vault path "${value}" must use forward slashes.`,
        "diagnosticInvalidData",
        pointer
      ));
    }
  }

  const sources: Array<{
    readonly source: BannerSource | null;
    readonly pointer: string;
  }> = [{
    source: data.banner.globalSource,
    pointer: "/banner/globalSource"
  }];
  Object.entries(data.banner.themes).forEach(([theme, setting]) => {
    sources.push({
      source: setting.source,
      pointer: `/banner/themes/${escapePointer(theme)}/source`
    });
  });
  for (const { source, pointer } of sources) {
    if (!isValidRemoteSource(source)) {
      diagnostics.push(diagnostic(
        "DATA-INVALID-URL",
        "Banner remote source must be a valid HTTP or HTTPS URL.",
        "diagnosticInvalidData",
        pointer
      ));
    }
  }
};

export const validatePluginData = (input: unknown): PluginDataValidation => {
  if (isRecord(input) && hasOwn(input, "schemaVersion") && input.schemaVersion !== 1) {
    return {
      type: "invalid",
      diagnostics: [diagnostic(
        "DATA-SCHEMA-VERSION",
        `Unsupported schema version "${String(input.schemaVersion)}".`,
        "diagnosticInvalidData",
        "/schemaVersion"
      )]
    };
  }

  const normalized = normalizePluginDataInput(input);
  const shapeErrors = validatePluginDataShape(normalized);
  if (shapeErrors.length > 0) {
    return {
      type: "invalid",
      diagnostics: shapeErrors.map((error) =>
        diagnostic(
          "DATA-SCHEMA",
          `${error.path}: ${error.message}`,
          "diagnosticInvalidData",
          error.path
        )
      )
    };
  }

  const data = normalized as PluginData;
  const diagnostics: Diagnostic[] = [];
  validatePlans(data, diagnostics);
  validateHeatmap(data, diagnostics);
  validateFileGroups(data, diagnostics);
  validatePathsAndUrls(data, diagnostics);

  return diagnostics.length === 0
    ? { type: "valid", data: structuredClone(data) }
    : { type: "invalid", diagnostics };
};
