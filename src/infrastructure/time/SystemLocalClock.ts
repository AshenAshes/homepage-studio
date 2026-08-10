import type {
  Clock,
  LocalTimeSnapshot
} from "../../application/ports/Clock";
import type { Weekday } from "../../domain/data/types";

export interface LocalClockDriver {
  now(): Date;
  set(callback: () => void, delay: number): number;
  clear(handle: number): void;
}

const WEEKDAYS: readonly Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

const padTwoDigits = (value: number): string => value.toString().padStart(2, "0");

const readLocalTime = (date: Date): LocalTimeSnapshot => {
  const weekday = WEEKDAYS[date.getDay()];
  if (weekday === undefined) {
    throw new Error("System local weekday is unavailable.");
  }

  return {
    dateKey: [
      date.getFullYear(),
      padTwoDigits(date.getMonth() + 1),
      padTwoDigits(date.getDate())
    ].join("-"),
    weekday,
    minuteOfDay: date.getHours() * 60 + date.getMinutes(),
    timezoneOffsetMinutes: date.getTimezoneOffset()
  };
};

const snapshotsMatch = (
  left: LocalTimeSnapshot,
  right: LocalTimeSnapshot
): boolean =>
  left.dateKey === right.dateKey
  && left.weekday === right.weekday
  && left.minuteOfDay === right.minuteOfDay
  && left.timezoneOffsetMinutes === right.timezoneOffsetMinutes;

export class SystemLocalClock implements Clock {
  private current: LocalTimeSnapshot;
  private readonly listeners = new Set<(snapshot: LocalTimeSnapshot) => void>();
  private timerHandle: number | null = null;
  private started = false;

  public constructor(private readonly driver: LocalClockDriver) {
    this.current = readLocalTime(this.driver.now());
  }

  public now(): Date {
    return new Date(this.driver.now());
  }

  public getCurrent(): LocalTimeSnapshot {
    return { ...this.current };
  }

  public localDateKey(): string {
    return this.current.dateKey;
  }

  public localWeekday(): Weekday {
    return this.current.weekday;
  }

  public minuteOfDay(): number {
    return this.current.minuteOfDay;
  }

  public subscribe(listener: (snapshot: LocalTimeSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.current = readLocalTime(this.driver.now());
    this.scheduleNextMinute();
  }

  public refresh(): void {
    const next = readLocalTime(this.driver.now());
    if (!snapshotsMatch(this.current, next)) {
      this.current = next;
      for (const listener of this.listeners) {
        listener(this.getCurrent());
      }
    }

    if (this.started) {
      this.scheduleNextMinute();
    }
  }

  public stop(): void {
    this.started = false;
    if (this.timerHandle !== null) {
      this.driver.clear(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private scheduleNextMinute(): void {
    if (this.timerHandle !== null) {
      this.driver.clear(this.timerHandle);
    }

    const now = this.driver.now();
    const elapsedInMinute = now.getSeconds() * 1000 + now.getMilliseconds();
    const delay = 60_000 - elapsedInMinute;
    this.timerHandle = this.driver.set(() => {
      this.timerHandle = null;
      this.refresh();
    }, delay);
  }
}
