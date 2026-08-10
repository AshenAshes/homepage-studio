export type MarkdownFileReadResult =
  | {
    readonly type: "loaded";
    readonly path: string;
    readonly source: string;
  }
  | { readonly type: "missing-source"; readonly path: string }
  | {
    readonly type: "io-error";
    readonly path: string;
    readonly cause: unknown;
  };

export type MarkdownFileCreateResult =
  | { readonly type: "created"; readonly path: string }
  | { readonly type: "already-exists"; readonly path: string }
  | { readonly type: "invalid-path"; readonly path: string }
  | {
    readonly type: "io-error";
    readonly path: string;
    readonly cause: unknown;
  };

export interface MarkdownFileTransform<T> {
  readonly source: string;
  readonly result: T;
}

export type MarkdownFileProcessResult<T> =
  | { readonly type: "processed"; readonly path: string; readonly result: T }
  | { readonly type: "missing-source"; readonly path: string }
  | {
    readonly type: "io-error";
    readonly path: string;
    readonly cause: unknown;
  };

export type MarkdownFileEvent =
  | { readonly type: "changed"; readonly path: string }
  | { readonly type: "missing"; readonly path: string }
  | { readonly type: "restored"; readonly path: string };

export interface MarkdownFilePort {
  read(path: string): Promise<MarkdownFileReadResult>;
  createEmpty(path: string): Promise<MarkdownFileCreateResult>;
  process<T>(
    path: string,
    transform: (source: string) => MarkdownFileTransform<T>
  ): Promise<MarkdownFileProcessResult<T>>;
  watch(path: string, listener: (event: MarkdownFileEvent) => void): () => void;
}
