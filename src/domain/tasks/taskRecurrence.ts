export type TaskRecurrence = "daily" | "weekly";

export interface TaskPeriodKeys {
  readonly daily: string;
  readonly weekly: string;
}

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/u;

const pad = (value: number): string => value.toString().padStart(2, "0");

const parseDateKey = (dateKey: string): Date | null => {
  const match = DATE_KEY.exec(dateKey);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  if (
    match === null
    || !Number.isInteger(year)
    || !Number.isInteger(month)
    || !Number.isInteger(day)
    || year < 1
  ) {
    return null;
  }
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? date
    : null;
};

const formatUtcDate = (date: Date): string => [
  date.getUTCFullYear().toString().padStart(4, "0"),
  pad(date.getUTCMonth() + 1),
  pad(date.getUTCDate())
].join("-");

export const isTaskDateKey = (dateKey: string): boolean =>
  parseDateKey(dateKey) !== null;

export const isMondayTaskDateKey = (dateKey: string): boolean =>
  parseDateKey(dateKey)?.getUTCDay() === 1;

export const localTaskDateKey = (now: Date): string => [
  now.getFullYear().toString().padStart(4, "0"),
  pad(now.getMonth() + 1),
  pad(now.getDate())
].join("-");

export const weeklyTaskPeriodKey = (dateKey: string): string => {
  const date = parseDateKey(dateKey);
  if (date === null) {
    throw new Error(`Invalid task date key: ${dateKey}`);
  }
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return formatUtcDate(date);
};

export const taskPeriodKeys = (now: Date): TaskPeriodKeys => {
  const daily = localTaskDateKey(now);
  return taskPeriodKeysForDate(daily);
};

export const taskPeriodKeysForDate = (daily: string): TaskPeriodKeys => ({
  daily,
  weekly: weeklyTaskPeriodKey(daily)
});

export const taskPeriodKeyFor = (
  recurrence: TaskRecurrence,
  periodKeys: TaskPeriodKeys
): string => periodKeys[recurrence];
