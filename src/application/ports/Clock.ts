import type { Weekday } from "../../domain/data/types";

export interface LocalTimeSnapshot {
  readonly dateKey: string;
  readonly weekday: Weekday;
  readonly minuteOfDay: number;
  readonly timezoneOffsetMinutes: number;
}

export interface Clock {
  now(): Date;
  getCurrent(): LocalTimeSnapshot;
  localDateKey(): string;
  localWeekday(): Weekday;
  minuteOfDay(): number;
  subscribe(listener: (snapshot: LocalTimeSnapshot) => void): () => void;
}
