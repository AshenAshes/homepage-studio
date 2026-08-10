import type { PluginData } from "../data/types";
import { selectHeatmapDay } from "./selection";

type HeatmapData = PluginData["heatmap"];

export interface HeatmapCalendarDay {
  readonly dateKey: string;
  readonly value: number;
  readonly level: 0 | 1 | 2 | 3 | 4;
  readonly isToday: boolean;
  readonly weekIndex: number;
  readonly weekdayIndex: number;
  readonly weekStartKey: string;
}

const DAY_IN_MILLISECONDS = 86_400_000;

const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
};

const formatDateKey = (date: Date): string => [
  date.getUTCFullYear(),
  (date.getUTCMonth() + 1).toString().padStart(2, "0"),
  date.getUTCDate().toString().padStart(2, "0")
].join("-");

const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * DAY_IN_MILLISECONDS);

const startOfCalendarWeek = (
  date: Date,
  startOfWeek: HeatmapData["preferences"]["startOfWeek"]
): Date => {
  const offset = (date.getUTCDay() - startOfWeek + 7) % 7;
  return addDays(date, -offset);
};

const getLevel = (
  value: number,
  [low, medium, high]: HeatmapData["preferences"]["thresholds"]
): HeatmapCalendarDay["level"] => {
  if (value <= 0) {
    return 0;
  }
  if (value < low) {
    return 1;
  }
  if (value < medium) {
    return 2;
  }
  if (value < high) {
    return 3;
  }
  return 4;
};

const getConfiguredRange = (
  heatmap: HeatmapData,
  today: Date
): readonly [Date, Date] => {
  const range = heatmap.preferences.dateRange;
  if (range.type === "fixedYear") {
    return [
      new Date(Date.UTC(range.year, 0, 1)),
      new Date(Date.UTC(range.year, 11, 31))
    ];
  }

  return [addDays(today, 1 - range.days), today];
};

export const buildHeatmapCalendar = (
  heatmap: HeatmapData,
  todayKey: string
): readonly HeatmapCalendarDay[] => {
  const today = parseDateKey(todayKey);
  const [configuredStart, configuredEnd] = getConfiguredRange(heatmap, today);
  const end = configuredEnd.getTime() > today.getTime()
    ? today
    : configuredEnd;
  if (configuredStart.getTime() > end.getTime()) {
    return [];
  }
  const firstWeekStart = startOfCalendarWeek(
    configuredStart,
    heatmap.preferences.startOfWeek
  );
  const days: HeatmapCalendarDay[] = [];

  for (
    let cursor = configuredStart;
    cursor.getTime() <= end.getTime();
    cursor = addDays(cursor, 1)
  ) {
    const dateKey = formatDateKey(cursor);
    const daysFromFirstWeek = Math.floor(
      (cursor.getTime() - firstWeekStart.getTime()) / DAY_IN_MILLISECONDS
    );
    const value = selectHeatmapDay(
      heatmap.history[dateKey],
      heatmap.preferences.excludeFolders
    ).total;
    days.push({
      dateKey,
      value,
      level: getLevel(value, heatmap.preferences.thresholds),
      isToday: dateKey === todayKey,
      weekIndex: Math.floor(daysFromFirstWeek / 7),
      weekdayIndex: daysFromFirstWeek % 7,
      weekStartKey: formatDateKey(addDays(cursor, -(daysFromFirstWeek % 7)))
    });
  }

  return days;
};
