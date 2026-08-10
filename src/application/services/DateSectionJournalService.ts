import type {
  MarkdownFileCreateResult,
  MarkdownFileEvent,
  MarkdownFilePort
} from "../ports/MarkdownFile";
import {
  parseDateSectionJournal,
  type DateSectionDiagnostic,
  type DateSectionDocument
} from "../../domain/journal/dateSections";
import {
  mutateDateSectionJournal,
  type DateSectionMutation,
  type DateSectionMutationResult
} from "../../domain/journal/dateSectionOperations";

export type DateSectionJournalLoadResult =
  | {
    readonly type: "loaded";
    readonly path: string;
    readonly journal: DateSectionDocument;
  }
  | {
    readonly type: "invalid-source";
    readonly path: string;
    readonly diagnostics: readonly DateSectionDiagnostic[];
  }
  | { readonly type: "missing-source"; readonly path: string }
  | {
    readonly type: "io-error";
    readonly path: string;
    readonly cause: unknown;
  };

export type DateSectionJournalMutationResult =
  | DateSectionMutationResult
  | { readonly type: "missing-source"; readonly path: string }
  | {
    readonly type: "io-error";
    readonly path: string;
    readonly cause: unknown;
  };

export class DateSectionJournalService {
  public constructor(private readonly files: MarkdownFilePort) {}

  public async load(path: string): Promise<DateSectionJournalLoadResult> {
    const readResult = await this.files.read(path);
    if (readResult.type !== "loaded") {
      return readResult;
    }
    const parsed = parseDateSectionJournal(readResult.source);
    return parsed.type === "valid"
      ? {
        type: "loaded",
        path: readResult.path,
        journal: parsed.journal
      }
      : {
        type: "invalid-source",
        path: readResult.path,
        diagnostics: parsed.diagnostics
      };
  }

  public createEmpty(path: string): Promise<MarkdownFileCreateResult> {
    return this.files.createEmpty(path);
  }

  public async mutate(
    path: string,
    mutation: DateSectionMutation
  ): Promise<DateSectionJournalMutationResult> {
    const processResult = await this.files.process(path, (source) => {
      const result = mutateDateSectionJournal(source, mutation);
      return {
        source: result.type === "applied" ? result.source : source,
        result
      };
    });
    return processResult.type === "processed"
      ? processResult.result
      : processResult;
  }

  public watch(
    path: string,
    listener: (event: MarkdownFileEvent) => void
  ): () => void {
    return this.files.watch(path, listener);
  }
}
