import type { PersistenceRequest, PersistenceScheduler } from "../../application/AppStore";
import type { PluginData } from "../../domain/data/types";

export interface PluginDataWriter {
  save(data: PluginData): Promise<void>;
}

export interface SessionBackup {
  ensureSessionBackup(): Promise<void>;
}

export interface PersistenceFailureNotifier {
  notify(error: unknown): void;
}

export interface TimerDriver {
  set(callback: () => void, delay: number): number;
  clear(handle: number): void;
}

export interface PersistenceCoordinatorOptions {
  readonly debounceMs?: number;
  readonly retryDelays?: readonly number[];
}

const DEFAULT_RETRY_DELAYS = [250, 1000, 3000] as const;

const errorFingerprint = (error: unknown): string =>
  error instanceof Error
    ? `${error.name}:${error.message}`
    : String(error);

export class SerialPersistenceCoordinator implements PersistenceScheduler {
  private pending: PersistenceRequest | null = null;
  private activeDrain: Promise<void> | null = null;
  private debounceTimer: number | null = null;
  private retryTimer: number | null = null;
  private retryIndex = 0;
  private failureEpisode: string | null = null;
  private readonly debounceMs: number;
  private readonly retryDelays: readonly number[];

  public constructor(
    private readonly writer: PluginDataWriter,
    private readonly backup: SessionBackup,
    private readonly notifier: PersistenceFailureNotifier,
    private readonly timers: TimerDriver,
    options: PersistenceCoordinatorOptions = {}
  ) {
    this.debounceMs = options.debounceMs ?? 500;
    this.retryDelays = options.retryDelays ?? DEFAULT_RETRY_DELAYS;
  }

  public schedule(request: PersistenceRequest): void {
    this.pending = request;

    if (this.activeDrain !== null) {
      return;
    }

    if (request.urgency === "immediate") {
      this.clearDebounce();
      this.clearRetry();
      void this.drain();
      return;
    }

    this.clearDebounce();
    this.debounceTimer = this.timers.set(() => {
      this.debounceTimer = null;
      void this.drain();
    }, this.debounceMs);
  }

  public hasPendingWork(): boolean {
    return this.pending !== null || this.activeDrain !== null;
  }

  public async flush(): Promise<void> {
    this.clearDebounce();
    this.clearRetry();
    if (this.activeDrain !== null) {
      await this.activeDrain;
    }
    if (this.pending !== null) {
      await this.drain();
    }
    this.clearRetry();
  }

  private async drain(): Promise<void> {
    if (this.activeDrain !== null) {
      await this.activeDrain;
      return;
    }

    this.activeDrain = this.runDrainLoop().finally(() => {
      this.activeDrain = null;
    });
    await this.activeDrain;
  }

  private async runDrainLoop(): Promise<void> {
    while (this.pending !== null) {
      const request = this.pending;
      this.pending = null;

      try {
        await this.backup.ensureSessionBackup();
        await this.writer.save(request.snapshot);
        request.onSaved();
        this.retryIndex = 0;
        this.failureEpisode = null;
      } catch (error) {
        request.onFailed(error);
        if (this.pending === null) {
          this.pending = request;
        }
        this.notifyFailure(error);
        this.scheduleRetry();
        return;
      }
    }
  }

  private notifyFailure(error: unknown): void {
    const fingerprint = errorFingerprint(error);
    if (this.failureEpisode !== fingerprint) {
      this.failureEpisode = fingerprint;
      this.notifier.notify(error);
    }
  }

  private scheduleRetry(): void {
    const delay = this.retryDelays[this.retryIndex];
    if (delay === undefined) {
      return;
    }
    this.retryIndex += 1;
    this.clearRetry();
    this.retryTimer = this.timers.set(() => {
      this.retryTimer = null;
      void this.drain();
    }, delay);
  }

  private clearDebounce(): void {
    if (this.debounceTimer !== null) {
      this.timers.clear(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      this.timers.clear(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
