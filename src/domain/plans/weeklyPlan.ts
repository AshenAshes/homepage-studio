import type {
  Weekday,
  WeeklyTemplate
} from "../data/types";
import type {
  DailyPlanEvaluation,
  DailyPlanMutationIssue
} from "./dailyPlan";
import {
  normalizePlanLabel,
  validateDailyPlanName
} from "./dailyPlan";

export const WEEKDAYS: readonly Weekday[] = [
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

export interface WeeklyPlanEvaluation extends DailyPlanEvaluation {
  readonly currentDay: Weekday | null;
}

const splitInterval = (
  start: number,
  end: number,
  overnight: boolean
): readonly {
  readonly start: number;
  readonly end: number;
  readonly overnight: boolean;
}[] =>
  end <= MINUTES_PER_WEEK
    ? [{ start, end, overnight }]
    : [{
      start,
      end: MINUTES_PER_WEEK,
      overnight
    }, {
      start: 0,
      end: end - MINUTES_PER_WEEK,
      overnight
    }];

export const validateWeeklyTemplate = (
  template: WeeklyTemplate
): DailyPlanMutationIssue | null => {
  if (validateDailyPlanName(template.name) !== null) {
    return "invalid-name";
  }
  const intervals: Array<{
    readonly start: number;
    readonly end: number;
    readonly overnight: boolean;
  }> = [];
  for (const [dayIndex, day] of WEEKDAYS.entries()) {
    for (const period of template.days[day]) {
      const labelLength = normalizePlanLabel(period.label).length;
      if (labelLength === 0 || labelLength > 200) {
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
      intervals.push(...splitInterval(
        dayIndex * MINUTES_PER_DAY + period.startMinute,
        dayIndex * MINUTES_PER_DAY + period.endMinute,
        period.endMinute > MINUTES_PER_DAY
      ));
    }
  }
  intervals.sort((left, right) =>
    left.start - right.start || left.end - right.end
  );
  for (const [index, current] of intervals.entries()) {
    const previous = intervals[index - 1];
    if (previous !== undefined && current.start < previous.end) {
      return current.overnight || previous.overnight
        ? "overnight-overlap"
        : "overlap";
    }
  }
  return null;
};

export const evaluateWeeklyPlan = (
  template: WeeklyTemplate,
  weekday: Weekday,
  minuteOfDay: number
): WeeklyPlanEvaluation => {
  const dayIndex = WEEKDAYS.indexOf(weekday);
  const now = dayIndex * MINUTES_PER_DAY + minuteOfDay;
  const base = WEEKDAYS.flatMap((day, originDayIndex) =>
    template.days[day].map((period) => ({
      period,
      originDay: day,
      originDayIndex,
      start: originDayIndex * MINUTES_PER_DAY + period.startMinute,
      end: originDayIndex * MINUTES_PER_DAY + period.endMinute
    }))
  );
  const occurrences = [-1, 0, 1].flatMap((weekOffset) =>
    base.map((occurrence) => ({
      ...occurrence,
      start: occurrence.start + weekOffset * MINUTES_PER_WEEK,
      end: occurrence.end + weekOffset * MINUTES_PER_WEEK
    }))
  );
  const current = occurrences.find((occurrence) =>
    now >= occurrence.start && now < occurrence.end
  );
  const next = occurrences
    .filter((occurrence) => occurrence.start > now)
    .sort((left, right) => left.start - right.start)[0];
  const periods = [...template.days[weekday]].sort((left, right) =>
    left.startMinute - right.startMinute || left.endMinute - right.endMinute
  );
  return {
    periods,
    current: current?.period ?? null,
    currentDay: current?.originDay ?? null,
    currentDayOffset: current !== undefined && current.originDay !== weekday
      ? -1
      : current === undefined
        ? null
        : 0,
    next: next === undefined
      ? null
      : {
        period: next.period,
        dayOffset: Math.floor(
          (next.start - dayIndex * MINUTES_PER_DAY) / MINUTES_PER_DAY
        )
      },
    elapsedMinutes: current === undefined ? null : now - current.start,
    remainingMinutes: current === undefined ? null : current.end - now,
    progress: current === undefined
      ? null
      : (now - current.start) / (current.end - current.start)
  };
};
