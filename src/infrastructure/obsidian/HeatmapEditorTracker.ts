import type {
  App,
  Editor,
  EventRef,
  MarkdownFileInfo,
  MarkdownView,
  TFile
} from "obsidian";

export interface HeatmapEditorTrackingPort {
  establishHeatmapBaseline(path: string, content: string): void;
  recordHeatmapEditorContent(path: string, content: string): void;
}

export interface HeatmapTimerDriver {
  set(callback: () => void, delay: number): number;
  clear(handle: number): void;
}

interface PendingEditorContent {
  readonly content: string;
  readonly handle: number;
}

export class HeatmapEditorTracker {
  private readonly pendingByPath = new Map<string, PendingEditorContent>();
  private readonly eventRefs: EventRef[] = [];
  private started = false;

  public constructor(
    private readonly app: App,
    private readonly tracking: HeatmapEditorTrackingPort,
    private readonly timers: HeatmapTimerDriver,
    private readonly debounceMs = 300
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
      this.tracking.recordHeatmapEditorContent(path, pending.content);
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
  }

  private handleFileOpen(file: TFile | null): void {
    if (!isMarkdownFile(file)) {
      return;
    }

    void this.app.vault.cachedRead(file).then((content) => {
      if (this.started) {
        this.tracking.establishHeatmapBaseline(file.path, content);
      }
    });
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
    }
    const content = editor.getValue();
    const handle = this.timers.set(() => {
      this.pendingByPath.delete(file.path);
      this.tracking.recordHeatmapEditorContent(file.path, content);
    }, this.debounceMs);
    this.pendingByPath.set(file.path, { content, handle });
  }
}

const isMarkdownFile = (file: TFile | null): file is TFile =>
  file !== null && file.extension.toLowerCase() === "md";
