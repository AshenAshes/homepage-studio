import type {
  DailyTemplate,
  PlanPeriod
} from "../data/types";

export type DailyPlanMutationIssue =
  | "invalid-name"
  | "invalid-label"
  | "invalid-start-time"
  | "invalid-end-time"
  | "invalid-duration"
  | "overlap"
  | "overnight-overlap";

export interface DailyPlanEvaluation {
  readonly periods: readonly PlanPeriod[];
  readonly current: PlanPeriod | null;
  readonly currentDayOffset: -1 | 0 | null;
  readonly next: {
    readonly period: PlanPeriod;
    readonly dayOffset: number;
  } | null;
  readonly elapsedMinutes: number | null;
  readonly remainingMinutes: number | null;
  readonly progress: number | null;
}

const MINUTES_PER_DAY = 1440;

export const normalizePlanName = (name: string): string => name.trim();

export const validateDailyPlanName = (
  name: string
): DailyPlanMutationIssue | null => {
  const normalized = normalizePlanName(name);
  return normalized.length === 0 || normalized.length > 100
    ? "invalid-name"
    : null;
};

export const normalizePlanLabel = (label: string): string => label.trim();

export const validateDailyPeriods = (
  periods: readonly PlanPeriod[]
): DailyPlanMutationIssue | null => {
  for (const period of periods) {
    const label = normalizePlanLabel(period.label);
    if (label.length === 0 || label.length > 200) {
      return "invalid-label";
    }
    if (
      !Number.isInteger(period.startMinute)
      || period.startMinute < 0
      || period.startMinute >= MINUTES_PER_DAY
    ) {
      return "invalid-start-time";
    }
    if (!Number.isInteger(period.endMinute)) {
      return "invalid-end-time";
    }
    if (
      period.endMinute <= period.startMinute
      || period.endMinute > period.startMinute + MINUTES_PER_DAY
    ) {
      return "invalid-duration";
    }
  }

  const intervals = periods.flatMap((period) =>
    period.endMinute <= MINUTES_PER_DAY
      ? [{
        start: period.startMinute,
        end: period.endMinute,
        overnight: false
      }]
      : [{
        start: period.startMinute,
        end: MINUTES_PER_DAY,
        overnight: true
      }, {
        start: 0,
        end: period.endMinute - MINUTES_PER_DAY,
        overnight: true
      }]
  ).sort((left, right) => left.start - right.start || left.end - right.end);
  for (const [index, period] of intervals.entries()) {
    const previous = intervals[index - 1];
    if (previous !== undefined && period.start < previous.end) {
      return period.overnight || previous.overnight
        ? "overnight-overlap"
        : "overlap";
    }
  }
  return null;
};

export const normalizeDailyTemplate = (
  template: DailyTemplate
): DailyTemplate => ({
  ...template,
  name: normalizePlanName(template.name),
  periods: template.periods.map((period) => ({
    ...period,
    label: normalizePlanLabel(period.label)
  }))
});

export const evaluateDailyPlan = (
  template: DailyTemplate,
  minuteOfDay: number
): DailyPlanEvaluation => {
  const periods = [...template.periods].sort((left, right) =>
    left.startMinute - right.startMinute
    || left.endMinute - right.endMinute
  );
  if (periods.length === 0) {
    return {
      periods,
      current: null,
      currentDayOffset: null,
      next: null,
      elapsedMinutes: null,
      remainingMinutes: null,
      progress: null
    };
  }

  const occurrences = [-1, 0, 1].flatMap((dayOffset) =>
    periods.map((period) => ({
      period,
      dayOffset,
      start: dayOffset * MINUTES_PER_DAY + period.startMinute,
      end: dayOffset * MINUTES_PER_DAY + period.endMinute
    }))
  );
  const current = occurrences.find((occurrence) =>
    minuteOfDay >= occurrence.start && minuteOfDay < occurrence.end
  );
  if (current !== undefined) {
    const next = occurrences
      .filter((occurrence) => occurrence.start > minuteOfDay)
      .sort((left, right) => left.start - right.start)[0];
    const elapsedMinutes = minuteOfDay - current.start;
    const remainingMinutes = current.end - minuteOfDay;
    return {
      periods,
      current: current.period,
      currentDayOffset: current.dayOffset === -1 ? -1 : 0,
      next: next === undefined
        ? null
        : {
          period: next.period,
          dayOffset: Math.max(0, next.dayOffset)
        },
      elapsedMinutes,
      remainingMinutes,
      progress: elapsedMinutes / (current.end - current.start)
    };
  }

  const upcoming = occurrences
    .filter((occurrence) => occurrence.start > minuteOfDay)
    .sort((left, right) => left.start - right.start)[0];
  return {
    periods,
    current: null,
    currentDayOffset: null,
    next: upcoming === undefined
      ? null
      : {
        period: upcoming.period,
        dayOffset: Math.max(0, upcoming.dayOffset)
      },
    elapsedMinutes: null,
    remainingMinutes: null,
    progress: null
  };
};

export const formatPlanMinute = (minute: number): string => {
  const bounded = Math.max(0, Math.min(MINUTES_PER_DAY * 2, minute));
  const normalized = bounded > MINUTES_PER_DAY
    ? bounded % MINUTES_PER_DAY
    : bounded;
  return [
    Math.floor(normalized / 60).toString().padStart(2, "0"),
    (normalized % 60).toString().padStart(2, "0")
  ].join(":");
};

export const parsePlanTime = (
  value: string,
  allowEndOfDay = false
): number | null => {
  const normalized = value.trim().replaceAll("：", ":");
  const match = /^(\d{1,2}):(\d{2})$/u.exec(normalized);
  if (match === null) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (allowEndOfDay && hour === 24 && minute === 0) {
    return MINUTES_PER_DAY;
  }
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    ? hour * 60 + minute
    : null;
};
