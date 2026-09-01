import type { Diagnostic } from "../domain/diagnostics";
import type { PluginData } from "../domain/data/types";
import { validatePluginData } from "../domain/data/validation";
import type { LocalTimeSnapshot } from "./ports/Clock";

export type PersistenceUrgency = "normal" | "immediate";

export interface PersistenceRequest {
  readonly name: string;
  readonly revision: number;
  readonly urgency: PersistenceUrgency;
  readonly snapshot: PluginData;
  readonly onSaved: () => void;
  readonly onFailed: (error: unknown) => void;
}

export interface PersistenceScheduler {
  schedule(request: PersistenceRequest): void;
}

export interface LocalTimeChange {
  readonly dateChanged: boolean;
}

export type AppStoreState =
  | { readonly mode: "loading" }
  | {
    readonly mode: "ready";
    readonly data: PluginData;
    readonly dirty: boolean;
    readonly revision: number;
  }
  | {
    readonly mode: "safe";
    readonly diagnostics: readonly Diagnostic[];
  };

export type TransactionResult =
  | { readonly type: "applied"; readonly revision: number }
  | { readonly type: "rejected"; readonly diagnostics: readonly Diagnostic[] }
  | { readonly type: "blocked-safe-mode" }
  | { readonly type: "blocked-loading" };

export type ConditionalTransactionResult =
  | TransactionResult
  | { readonly type: "noop" };

type StoreScalar = string | number | boolean | null;

export class AppStore {
  private state: AppStoreState = { mode: "loading" };
  private readonly stateListeners = new Set<() => void>();
  private readonly localTimeListeners = new Set<(
    change: LocalTimeChange
  ) => void>();
  private localTime: LocalTimeSnapshot | null = null;
  private generation = 0;

  public constructor(private readonly persistence: PersistenceScheduler) {}

  public getState(): AppStoreState {
    return structuredClone(this.state);
  }

  public isReady(): boolean {
    return this.state.mode === "ready";
  }

  public selectReadyScalar<T extends StoreScalar>(
    selector: (data: PluginData) => T
  ): T | null {
    return this.state.mode === "ready"
      ? selector(this.state.data)
      : null;
  }

  public selectReadySnapshot<T>(
    selector: (data: PluginData) => T
  ): T | null {
    return this.state.mode === "ready"
      ? structuredClone(selector(this.state.data))
      : null;
  }

  public getLocalTime(): LocalTimeSnapshot | null {
    return this.localTime === null ? null : { ...this.localTime };
  }

  public subscribeState(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public subscribeLocalTime(
    listener: (change: LocalTimeChange) => void
  ): () => void {
    this.localTimeListeners.add(listener);
    return () => {
      this.localTimeListeners.delete(listener);
    };
  }

  public updateLocalTime(localTime: LocalTimeSnapshot): void {
    if (
      this.localTime?.dateKey === localTime.dateKey
      && this.localTime.weekday === localTime.weekday
      && this.localTime.minuteOfDay === localTime.minuteOfDay
      && this.localTime.timezoneOffsetMinutes === localTime.timezoneOffsetMinutes
    ) {
      return;
    }

    const dateChanged = this.localTime?.dateKey !== localTime.dateKey;
    this.localTime = { ...localTime };
    for (const listener of this.localTimeListeners) {
      listener({ dateChanged });
    }
  }

  public initializeReady(data: PluginData, persistInitial: boolean): void {
    this.generation += 1;
    this.state = {
      mode: "ready",
      data: structuredClone(data),
      dirty: persistInitial,
      revision: persistInitial ? 1 : 0
    };
    this.notifyState();

    if (persistInitial) {
      this.scheduleCurrent("initialize defaults", "immediate");
    }
  }

  public initializeSafe(diagnostics: readonly Diagnostic[]): void {
    this.generation += 1;
    this.state = {
      mode: "safe",
      diagnostics: [...diagnostics]
    };
    this.notifyState();
  }

  public transact(
    name: string,
    urgency: PersistenceUrgency,
    mutate: (data: PluginData) => PluginData
  ): TransactionResult {
    if (this.state.mode === "loading") {
      return { type: "blocked-loading" };
    }
    if (this.state.mode === "safe") {
      return { type: "blocked-safe-mode" };
    }

    const candidate = mutate(structuredClone(this.state.data));
    return this.commitCandidate(name, urgency, candidate);
  }

  public transactIfChanged(
    name: string,
    urgency: PersistenceUrgency,
    mutate: (data: PluginData) => PluginData | null
  ): ConditionalTransactionResult {
    if (this.state.mode === "loading") {
      return { type: "blocked-loading" };
    }
    if (this.state.mode === "safe") {
      return { type: "blocked-safe-mode" };
    }
    const candidate = mutate(structuredClone(this.state.data));
    return candidate === null
      ? { type: "noop" }
      : this.commitCandidate(name, urgency, candidate);
  }

  private commitCandidate(
    name: string,
    urgency: PersistenceUrgency,
    candidate: PluginData
  ): TransactionResult {
    if (this.state.mode === "loading") {
      return { type: "blocked-loading" };
    }
    if (this.state.mode === "safe") {
      return { type: "blocked-safe-mode" };
    }
    const validation = validatePluginData(candidate);
    if (validation.type === "invalid") {
      return {
        type: "rejected",
        diagnostics: validation.diagnostics
      };
    }

    const revision = this.state.revision + 1;
    this.state = {
      mode: "ready",
      data: validation.data,
      dirty: true,
      revision
    };
    this.notifyState();
    this.scheduleCurrent(name, urgency);
    return { type: "applied", revision };
  }

  private scheduleCurrent(name: string, urgency: PersistenceUrgency): void {
    if (this.state.mode !== "ready") {
      return;
    }
    const revision = this.state.revision;
    const generation = this.generation;
    this.persistence.schedule({
      name,
      revision,
      urgency,
      snapshot: structuredClone(this.state.data),
      onSaved: () => {
        if (
          this.state.mode === "ready"
          && this.state.revision === revision
          && this.generation === generation
        ) {
          this.state = {
            ...this.state,
            dirty: false
          };
        }
      },
      onFailed: () => {
        // The latest in-memory snapshot intentionally remains dirty.
      }
    });
  }

  private notifyState(): void {
    for (const listener of this.stateListeners) {
      listener();
    }
  }
}
