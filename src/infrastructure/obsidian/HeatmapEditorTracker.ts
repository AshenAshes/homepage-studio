import type {
  App,
  Editor,
  EventRef,
  MarkdownFileInfo,
  MarkdownView,
  TFile
} from "obsidian";

export interface HeatmapEditorTrackingPort {
  shouldTrackHeatmapPath(path: string): boolean;
  shouldEstablishHeatmapBaseline(path: string): boolean;
  establishHeatmapBaseline(path: string, content: string): void;
  recordHeatmapEditorContent(path: string, content: string): void;
}

export interface HeatmapTimerDriver {
  set(callback: () => void, delay: number): number;
  clear(handle: number): void;
}

interface PendingEditorContent {
  readonly readContent: () => string | null;
  readonly handle: number;
}

interface PendingBaseline {
  readonly file: TFile;
  readonly handle: number;
}

export class HeatmapEditorTracker {
  private readonly pendingByPath = new Map<string, PendingEditorContent>();
  private readonly pendingBaselines = new Map<string, PendingBaseline>();
  private readonly baselineOperations = new Map<string, Promise<void>>();
  private readonly eventRefs: EventRef[] = [];
  private started = false;

  public constructor(
    private readonly app: App,
    private readonly tracking: HeatmapEditorTrackingPort,
    private readonly timers: HeatmapTimerDriver,
    private readonly debounceMs = 300,
    private readonly baselineDelayMs = 500
  ) {}

  public start(): void {
    if (this.eventRefs.length > 0) {
      return;
    }

    this.started = true;
    this.eventRefs.push(
      this.app.workspace.on("file-open", (file) => {
        this.handleFileOpen(file);
      }),
      this.app.workspace.on("editor-change", (editor, info) => {
        this.handleEditorChange(editor, info);
      })
    );
  }

  public flush(): void {
    for (const [path, pending] of this.pendingByPath) {
      this.timers.clear(pending.handle);
      const content = pending.readContent();
      if (content !== null) {
        this.tracking.recordHeatmapEditorContent(path, content);
      }
    }
    this.pendingByPath.clear();
  }

  public stop(): void {
    this.started = false;
    for (const eventRef of this.eventRefs.splice(0)) {
      this.app.workspace.offref(eventRef);
    }
    for (const pending of this.pendingByPath.values()) {
      this.timers.clear(pending.handle);
    }
    this.pendingByPath.clear();
    for (const pending of this.pendingBaselines.values()) {
      this.timers.clear(pending.handle);
    }
    this.pendingBaselines.clear();
    this.baselineOperations.clear();
  }

  private handleFileOpen(file: TFile | null): void {
    if (!isMarkdownFile(file)) {
      return;
    }
    if (
      !this.tracking.shouldEstablishHeatmapBaseline(file.path)
      || this.baselineOperations.has(file.path)
    ) {
      return;
    }
    const existing = this.pendingBaselines.get(file.path);
    if (existing !== undefined) {
      this.timers.clear(existing.handle);
    }
    const handle = this.timers.set(() => {
      void this.startPendingBaseline(file.path);
    }, this.baselineDelayMs);
    this.pendingBaselines.set(file.path, { file, handle });
  }

  private handleEditorChange(
    editor: Editor,
    info: MarkdownView | MarkdownFileInfo
  ): void {
    const file = info.file;
    if (!isMarkdownFile(file)) {
      return;
    }

    const existing = this.pendingByPath.get(file.path);
    if (existing !== undefined) {
      this.timers.clear(existing.handle);
      this.pendingByPath.delete(file.path);
    }
    if (!this.tracking.shouldTrackHeatmapPath(file.path)) {
      return;
    }
    const baselineOperation = this.startPendingBaseline(file.path);
    const readContent = (): string | null => {
      const currentFile = info.file;
      return isMarkdownFile(currentFile) && currentFile.path === file.path
        ? editor.getValue()
        : null;
    };
    const handle = this.timers.set(() => {
      this.pendingByPath.delete(file.path);
      const record = (): void => {
        if (!this.started) {
          return;
        }
        const content = readContent();
        if (content !== null) {
          this.tracking.recordHeatmapEditorContent(file.path, content);
        }
      };
      if (baselineOperation === null) {
        record();
      } else {
        void baselineOperation.then(record);
      }
    }, this.debounceMs);
    this.pendingByPath.set(file.path, { readContent, handle });
  }

  private startPendingBaseline(path: string): Promise<void> | null {
    const running = this.baselineOperations.get(path);
    if (running !== undefined) {
      return running;
    }
    const pending = this.pendingBaselines.get(path);
    if (pending === undefined) {
      return null;
    }
    this.timers.clear(pending.handle);
    this.pendingBaselines.delete(path);
    if (
      !this.started
      || !this.tracking.shouldEstablishHeatmapBaseline(path)
    ) {
      return null;
    }
    const operation = this.app.vault.cachedRead(pending.file)
      .then((content) => {
        if (
          this.started
          && this.tracking.shouldEstablishHeatmapBaseline(path)
        ) {
          this.tracking.establishHeatmapBaseline(path, content);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (this.baselineOperations.get(path) === operation) {
          this.baselineOperations.delete(path);
        }
      });
    this.baselineOperations.set(path, operation);
    return operation;
  }
}

const isMarkdownFile = (file: TFile | null): file is TFile =>
  file !== null && file.extension.toLowerCase() === "md";
