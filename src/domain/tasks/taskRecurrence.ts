export type TaskRecurrence = "daily" | "weekly";

export const TASK_RESET_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type TaskResetDay = typeof TASK_RESET_DAYS[number];
export interface TaskResetSchedule {
  readonly time?: string;
  readonly day?: TaskResetDay;
}
export const isTaskResetDay = (value: string): value is TaskResetDay =>
  TASK_RESET_DAYS.some((day) => day === value);
export const isTaskResetTime = (value: string): boolean => /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value);
export const validateTaskSchedule = (recurrence: TaskRecurrence, schedule: TaskResetSchedule): "invalid-reset-time" | "invalid-reset-day" | null => {
  if (schedule.time !== undefined && !isTaskResetTime(schedule.time)) return "invalid-reset-time";
  if (schedule.day !== undefined && (recurrence !== "weekly" || !isTaskResetDay(schedule.day))) return "invalid-reset-day";
  return null;
};

export interface TaskPeriodKeys {
  readonly daily: string;
  readonly weekly: string;
  readonly minuteOfDay?: number;
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
  return taskPeriodKeysForDate(daily, now.getHours() * 60 + now.getMinutes());
};

export const taskPeriodKeysForDate = (daily: string, minuteOfDay = 0): TaskPeriodKeys => ({
  daily,
  weekly: weeklyTaskPeriodKey(daily),
  minuteOfDay
});

export const taskPeriodKeyFor = (
  recurrence: TaskRecurrence,
  periodKeys: TaskPeriodKeys,
  schedule: TaskResetSchedule = {}
): string => {
  const date = parseDateKey(periodKeys.daily);
  if (date === null || validateTaskSchedule(recurrence, schedule) !== null) {
    throw new Error("Invalid task refresh schedule");
  }
  const [hours = 0, minutes = 0] = (schedule.time ?? "00:00").split(":").map(Number);
  const beforeTime = (periodKeys.minuteOfDay ?? 0) < hours * 60 + minutes;
  if (recurrence === "daily") {
    if (beforeTime) date.setUTCDate(date.getUTCDate() - 1);
    return formatUtcDate(date);
  }
  const weekday = (date.getUTCDay() + 6) % 7;
  const resetDay = TASK_RESET_DAYS.indexOf(schedule.day ?? "mon");
  date.setUTCDate(date.getUTCDate() - weekday);
  if (weekday < resetDay || (weekday === resetDay && beforeTime)) date.setUTCDate(date.getUTCDate() - 7);
  return formatUtcDate(date);
};
