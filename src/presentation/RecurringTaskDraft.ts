import { validateTaskText } from "../domain/tasks/taskOperations";
import type { TaskRecurrence, TaskTarget } from "../domain/tasks/taskSource";
import type { TaskSourceMutationResult } from "../application/services/TaskSourceService";

export class RecurringTaskDraft {
  public composing = false;
  public error: TaskSourceMutationResult | null = null;
  public onResult: (result: TaskSourceMutationResult) => void = () => {};
  private savedText: string;
  private savedRecurrence: TaskRecurrence;
  private timer: number | null = null;
  private pending: Promise<boolean> | null = null;
  private cancelled = false;
  private closing = false;

  public constructor(
    public readonly path: string,
    public target: TaskTarget,
    public text: string,
    public recurrence: TaskRecurrence,
    private readonly clock: Pick<Window, "setTimeout" | "clearTimeout">,
    private readonly save: (target: TaskTarget, text: string, recurrence: TaskRecurrence) => Promise<TaskSourceMutationResult>
  ) {
    this.savedText = text;
    this.savedRecurrence = recurrence;
  }

  public get dirty(): boolean {
    return this.text !== this.savedText || this.recurrence !== this.savedRecurrence;
  }

  public get busy(): boolean { return this.pending !== null; }

  public reconcile(targets: readonly TaskTarget[]): boolean {
    // A successful write can publish its new source before its promise settles.
    // Wait for that write to supply updatedTarget before comparing identities.
    if (this.busy) return true;
    const exact = targets.find((target) => JSON.stringify(target) === JSON.stringify(this.target));
    const candidates = targets.filter((target) => target.section === this.target.section
      && target.rawLine === this.target.rawLine);
    const current = exact ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (current === undefined) {
      void this.cancel();
      return false;
    }
    this.target = current;
    return true;
  }

  public cancelTimer(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  public schedule(): void {
    this.cancelTimer();
    if (this.composing || this.cancelled) return;
    this.timer = this.clock.setTimeout(() => { this.timer = null; void this.flush(); }, 500);
  }

  public async flush(): Promise<boolean> {
    this.cancelTimer();
    if (this.pending !== null) {
      const saved = await this.pending;
      return saved ? this.flush() : false;
    }
    if (this.cancelled || this.composing || !this.dirty) return !this.dirty;
    const text = this.text;
    const recurrence = this.recurrence;
    const operation = async (): Promise<boolean> => {
      let result: TaskSourceMutationResult;
      try {
        result = validateTaskText(text.trim())
          ?? await this.save(this.target, text.trim(), recurrence);
      } catch (cause) {
        result = { type: "io-error", path: this.path, cause };
      }
      const success = result.type === "applied" || result.type === "noop";
      if (success) {
        this.savedText = text;
        this.savedRecurrence = recurrence;
        if (result.type === "applied" && result.updatedTarget !== undefined) {
          this.target = result.updatedTarget;
        }
        this.error = null;
      } else this.error = result;
      if (!this.closing || result.type !== "invalid-task") this.onResult(result);
      return success;
    };
    this.pending = operation();
    const success = await this.pending;
    this.pending = null;
    if (success && this.dirty && !this.composing) return this.flush();
    return success;
  }

  public async close(): Promise<void> {
    this.closing = true;
    this.composing = false;
    this.cancelTimer();
    if (validateTaskText(this.text.trim()) !== null) {
      // Stop the in-flight save's follow-up loop from writing a discarded draft.
      this.cancelled = true;
      this.restoreSaved();
      await this.pending;
      // A valid earlier edit may have finished while the invalid draft was open.
      this.restoreSaved();
      return;
    }
    await this.flush();
    if (this.error?.type === "invalid-task") this.restoreSaved();
  }

  private restoreSaved(): void {
    this.text = this.savedText;
    this.recurrence = this.savedRecurrence;
    this.error = null;
  }

  public async cancel(): Promise<void> {
    this.cancelled = true;
    this.cancelTimer();
    await this.pending;
  }

  public resume(): void { this.cancelled = false; this.closing = false; }
}
