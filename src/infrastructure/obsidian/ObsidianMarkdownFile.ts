import {
  normalizePath,
  TFile,
  TFolder,
  type App,
  type EventRef
} from "obsidian";
import type {
  MarkdownFileCreateResult,
  MarkdownFileEvent,
  MarkdownFilePort,
  MarkdownFileProcessResult,
  MarkdownFileReadResult,
  MarkdownFileTransform
} from "../../application/ports/MarkdownFile";

const normalizeMarkdownPath = (path: string): string | null => {
  const normalized = normalizePath(path.trim());
  return normalized !== ""
    && !normalized.startsWith("/")
    && normalized.toLowerCase().endsWith(".md")
    ? normalized
    : null;
};

export class ObsidianMarkdownFile implements MarkdownFilePort {
  private readonly mutationTails = new Map<string, Promise<void>>();

  public constructor(private readonly app: App) {}

  public async read(path: string): Promise<MarkdownFileReadResult> {
    const normalized = normalizeMarkdownPath(path);
    if (normalized === null) {
      return { type: "missing-source", path };
    }
    const pendingMutation = this.mutationTails.get(normalized);
    if (pendingMutation !== undefined) {
      await pendingMutation;
    }
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (!(file instanceof TFile)) {
      return { type: "missing-source", path: normalized };
    }
    try {
      return {
        type: "loaded",
        path: normalized,
        source: await this.app.vault.read(file)
      };
    } catch (cause) {
      return {
        type: "io-error",
        path: normalized,
        cause
      };
    }
  }

  public async createEmpty(path: string): Promise<MarkdownFileCreateResult> {
    const normalized = normalizeMarkdownPath(path);
    if (normalized === null) {
      return { type: "invalid-path", path };
    }
    if (this.app.vault.getAbstractFileByPath(normalized) !== null) {
      return { type: "already-exists", path: normalized };
    }
    try {
      await this.ensureParentFolders(normalized);
      await this.app.vault.create(normalized, "");
      return { type: "created", path: normalized };
    } catch (cause) {
      if (this.app.vault.getAbstractFileByPath(normalized) !== null) {
        return { type: "already-exists", path: normalized };
      }
      return {
        type: "io-error",
        path: normalized,
        cause
      };
    }
  }

  public process<T>(
    path: string,
    transform: (source: string) => MarkdownFileTransform<T>
  ): Promise<MarkdownFileProcessResult<T>> {
    const normalized = normalizeMarkdownPath(path);
    if (normalized === null) {
      return Promise.resolve({
        type: "missing-source",
        path
      });
    }
    return this.enqueue(normalized, async () => {
      const file = this.app.vault.getAbstractFileByPath(normalized);
      if (!(file instanceof TFile)) {
        return { type: "missing-source", path: normalized };
      }
      const transformed: {
        value?: MarkdownFileTransform<T>;
      } = {};
      try {
        await this.app.vault.process(file, (source) => {
          const next = transform(source);
          transformed.value = next;
          return next.source;
        });
      } catch (cause) {
        if (
          !(this.app.vault.getAbstractFileByPath(normalized) instanceof TFile)
        ) {
          return { type: "missing-source", path: normalized };
        }
        return {
          type: "io-error",
          path: normalized,
          cause
        };
      }
      const completed = transformed.value;
      if (completed === undefined) {
        return {
          type: "io-error",
          path: normalized,
          cause: new Error("Vault.process() did not invoke its transform.")
        };
      }
      return {
        type: "processed",
        path: normalized,
        result: completed.result
      };
    });
  }

  public watch(
    path: string,
    listener: (event: MarkdownFileEvent) => void
  ): () => void {
    const normalized = normalizeMarkdownPath(path);
    if (normalized === null) {
      return () => undefined;
    }
    const refs: EventRef[] = [
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.path === normalized) {
          listener({ type: "changed", path: normalized });
        }
      }),
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile && file.path === normalized) {
          listener({ type: "missing", path: normalized });
        }
      }),
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.path === normalized) {
          listener({ type: "restored", path: normalized });
        }
      }),
      this.app.vault.on("rename", (file, oldPath) => {
        if (oldPath === normalized) {
          listener({ type: "missing", path: normalized });
        } else if (file instanceof TFile && file.path === normalized) {
          listener({ type: "restored", path: normalized });
        }
      })
    ];
    return () => {
      for (const ref of refs) {
        this.app.vault.offref(ref);
      }
    };
  }

  private async ensureParentFolders(path: string): Promise<void> {
    const segments = path.split("/");
    segments.pop();
    let parentPath = "";
    for (const segment of segments) {
      parentPath = parentPath === "" ? segment : `${parentPath}/${segment}`;
      const existing = this.app.vault.getAbstractFileByPath(parentPath);
      if (existing instanceof TFolder) {
        continue;
      }
      if (existing !== null) {
        throw new Error(`A file already exists at folder path ${parentPath}.`);
      }
      await this.app.vault.createFolder(parentPath);
    }
  }

  private enqueue<T>(path: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTails.get(path) ?? Promise.resolve();
    const result = previous.then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined
    );
    this.mutationTails.set(path, tail);
    void tail.then(() => {
      if (this.mutationTails.get(path) === tail) {
        this.mutationTails.delete(path);
      }
    });
    return result;
  }
}
