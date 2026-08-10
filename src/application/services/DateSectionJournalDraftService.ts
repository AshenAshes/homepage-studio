import type {
  DateSectionJournalMutationResult
} from "./DateSectionJournalService";
import type { DateSectionMutation } from
  "../../domain/journal/dateSectionOperations";

export interface JournalMutationPort {
  mutate(
    path: string,
    mutation: DateSectionMutation
  ): Promise<DateSectionJournalMutationResult>;
}

export interface JournalDraftTimer {
  set(callback: () => void, delay: number): number;
  clear(handle: number): void;
}

export interface JournalDraftTarget {
  readonly path: string;
  readonly dateKey: string;
  readonly todayKey: string;
  readonly content: string;
  readonly revision: string | null;
}

export type JournalDraftState =
  | { readonly type: "idle" }
  | {
    readonly type: "editing";
    readonly target: JournalDraftTarget;
    readonly originalContent: string;
    readonly dirty: boolean;
  }
  | {
    readonly type: "conflict";
    readonly target: JournalDraftTarget;
    readonly originalContent: string;
    readonly reason: "created-externally" | "changed" | "deleted";
  }
  | {
    readonly type: "failed";
    readonly target: JournalDraftTarget;
    readonly originalContent: string;
    readonly reason:
    | "missing-source"
    | "invalid-source"
    | "io-error"
    | "future-date";
  };

const AUTOSAVE_DELAY_MS = 800;

export class DateSectionJournalDraftService {
  private state: JournalDraftState = { type: "idle" };
  private timerHandle: number | null = null;
  private mutationGeneration = 0;
  private readonly listeners = new Set<(state: JournalDraftState) => void>();

  public constructor(
    private readonly journal: JournalMutationPort,
    private readonly timer: JournalDraftTimer
  ) {}

  public getState(): JournalDraftState {
    return structuredClone(this.state);
  }

  public subscribe(listener: (state: JournalDraftState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public begin(target: JournalDraftTarget): void {
    this.cancelTimer();
    this.mutationGeneration += 1;
    this.state = {
      type: "editing",
      target: { ...target },
      originalContent: target.content,
      dirty: false
    };
  }

  public update(content: string): void {
    if (this.state.type !== "editing") {
      return;
    }
    this.state = {
      ...this.state,
      target: {
        ...this.state.target,
        content
      },
      dirty: content !== this.state.originalContent
    };
    this.cancelTimer();
    if (this.state.dirty) {
      this.timerHandle = this.timer.set(() => {
        this.timerHandle = null;
        void this.flush();
      }, AUTOSAVE_DELAY_MS);
    }
  }

  public async flush(): Promise<JournalDraftState> {
    this.cancelTimer();
    if (this.state.type !== "editing" || !this.state.dirty) {
      return this.getState();
    }
    const pending = this.state;
    const generation = ++this.mutationGeneration;
    const result = await this.journal.mutate(pending.target.path, {
      type: "upsert",
      dateKey: pending.target.dateKey,
      todayKey: pending.target.todayKey,
      expectedRevision: pending.target.revision,
      content: pending.target.content
    });
    if (generation !== this.mutationGeneration) {
      return this.getState();
    }
    this.applyResult(pending, result);
    this.notify();
    return this.getState();
  }

  public hasUnsavedDraft(): boolean {
    return this.state.type === "conflict"
      || this.state.type === "failed"
      || (this.state.type === "editing" && this.state.dirty);
  }

  public discardAndBegin(target: JournalDraftTarget): void {
    this.begin(target);
  }

  public async dispose(): Promise<void> {
    await this.flush();
    this.cancelTimer();
  }

  private applyResult(
    pending: Extract<JournalDraftState, { readonly type: "editing" }>,
    result: DateSectionJournalMutationResult
  ): void {
    if (result.type === "applied" || result.type === "noop") {
      this.state = {
        type: "editing",
        target: {
          ...pending.target,
          revision: result.type === "applied"
            ? result.revision
            : pending.target.revision
        },
        originalContent: pending.target.content,
        dirty: false
      };
      return;
    }
    if (result.type === "conflict") {
      this.state = {
        type: "conflict",
        target: pending.target,
        originalContent: pending.originalContent,
        reason: result.reason
      };
      return;
    }
    const reason = result.type === "future-date"
      ? "future-date"
      : result.type;
    this.state = {
      type: "failed",
      target: pending.target,
      originalContent: pending.originalContent,
      reason
    };
  }

  private cancelTimer(): void {
    if (this.timerHandle !== null) {
      this.timer.clear(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
