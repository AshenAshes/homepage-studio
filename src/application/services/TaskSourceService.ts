import type {
  MarkdownFileCreateResult,
  MarkdownFileEvent,
  MarkdownFilePort
} from "../ports/MarkdownFile";
import {
  parseHomepageTaskSource,
  type TaskSourceDiagnostic,
  type TaskSourceDocument
} from "../../domain/tasks/taskSource";
import {
  mutateHomepageTaskSource,
  type TaskMutation,
  type TaskMutationResult
} from "../../domain/tasks/taskOperations";

export type TaskSourceLoadResult =
  | {
    readonly type: "loaded";
    readonly path: string;
    readonly taskSource: TaskSourceDocument;
  }
  | { readonly type: "missing-region"; readonly path: string }
  | {
    readonly type: "invalid-source";
    readonly path: string;
    readonly diagnostics: readonly TaskSourceDiagnostic[];
  }
  | { readonly type: "missing-source"; readonly path: string }
  | { readonly type: "io-error"; readonly path: string; readonly cause: unknown };

export type TaskSourceMutationResult =
  | TaskMutationResult
  | { readonly type: "missing-source"; readonly path: string }
  | { readonly type: "io-error"; readonly path: string; readonly cause: unknown };

export type TaskSourceCreationResult =
  | { readonly type: "created"; readonly path: string }
  | Exclude<MarkdownFileCreateResult, { readonly type: "created" }>
  | Exclude<TaskSourceMutationResult, { readonly type: "applied" }>;

export class TaskSourceService {
  public constructor(private readonly files: MarkdownFilePort) {}

  public async load(path: string): Promise<TaskSourceLoadResult> {
    const read = await this.files.read(path);
    if (read.type !== "loaded") {
      return read;
    }
    const parsed = parseHomepageTaskSource(read.source);
    if (parsed.type === "valid") {
      return {
        type: "loaded",
        path: read.path,
        taskSource: parsed.taskSource
      };
    }
    return parsed.type === "missing-region"
      ? { type: "missing-region", path: read.path }
      : {
        type: "invalid-source",
        path: read.path,
        diagnostics: parsed.diagnostics
      };
  }

  public async create(path: string): Promise<TaskSourceCreationResult> {
    const created = await this.files.createEmpty(path);
    if (created.type !== "created") {
      return created;
    }
    const appended = await this.mutate(created.path, {
      type: "append-region"
    });
    return appended.type === "applied"
      ? { type: "created", path: created.path }
      : appended;
  }

  public async mutate(
    path: string,
    mutation: TaskMutation
  ): Promise<TaskSourceMutationResult> {
    const processed = await this.files.process(path, (source) => {
      const result = mutateHomepageTaskSource(source, mutation);
      return {
        source: result.type === "applied" ? result.source : source,
        result
      };
    });
    return processed.type === "processed"
      ? processed.result
      : processed;
  }

  public watch(
    path: string,
    listener: (event: MarkdownFileEvent) => void
  ): () => void {
    return this.files.watch(path, listener);
  }
}
