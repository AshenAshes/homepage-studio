import {
  createDateSectionRevision,
  parseDateSectionJournal,
  type DateSectionDiagnostic,
  type DateSectionDocument,
  type DateSectionRecord
} from "./dateSections";

export type DateSectionMutationResult =
  | {
    readonly type: "applied";
    readonly source: string;
    readonly revision: string | null;
  }
  | { readonly type: "noop" }
  | {
    readonly type: "conflict";
    readonly reason: "created-externally" | "changed" | "deleted";
  }
  | {
    readonly type: "invalid-source";
    readonly diagnostics: readonly DateSectionDiagnostic[];
  }
  | { readonly type: "future-date"; readonly dateKey: string };

export interface UpsertDateSection {
  readonly type: "upsert";
  readonly dateKey: string;
  readonly todayKey: string;
  readonly expectedRevision: string | null;
  readonly content: string;
}

export interface DeleteDateSection {
  readonly type: "delete";
  readonly dateKey: string;
  readonly expectedRevision: string;
}

export type DateSectionMutation = UpsertDateSection | DeleteDateSection;

const normalizeLineEndings = (
  content: string,
  newline: DateSectionDocument["newline"]
): string => content.replace(/\r\n|\r|\n/gu, newline);

const stripTerminalNewlines = (
  content: string,
  newline: DateSectionDocument["newline"]
): string => {
  let result = content;
  while (result.endsWith(newline)) {
    result = result.slice(0, -newline.length);
  }
  return result;
};

const formatBody = (
  content: string,
  journal: DateSectionDocument,
  hasFollowingBoundary: boolean
): string => {
  const normalized = stripTerminalNewlines(
    normalizeLineEndings(content, journal.newline),
    journal.newline
  );
  if (normalized === "") {
    return hasFollowingBoundary ? journal.newline : "";
  }
  return [
    journal.newline,
    normalized,
    ...(hasFollowingBoundary
      ? [journal.newline, journal.newline]
      : journal.hasTerminalNewline
        ? [journal.newline]
        : [])
  ].join("");
};

const countTerminalNewlines = (
  source: string,
  newline: DateSectionDocument["newline"]
): number => {
  let count = 0;
  let cursor = source.length;
  while (cursor >= newline.length) {
    if (source.slice(cursor - newline.length, cursor) !== newline) {
      break;
    }
    count += 1;
    cursor -= newline.length;
  }
  return count;
};

const separatorBefore = (
  source: string,
  offset: number,
  journal: DateSectionDocument
): string => {
  const prefix = source.slice(0, offset);
  if (prefix === "" || prefix === journal.bom) {
    return "";
  }
  const terminalNewlines = countTerminalNewlines(prefix, journal.newline);
  if (terminalNewlines >= 2) {
    return "";
  }
  return journal.newline.repeat(2 - terminalNewlines);
};

const formatInsertedSection = (
  dateKey: string,
  content: string,
  journal: DateSectionDocument,
  hasFollowingBoundary: boolean
): string => {
  const normalized = stripTerminalNewlines(
    normalizeLineEndings(content, journal.newline),
    journal.newline
  );
  const terminal = hasFollowingBoundary
    ? journal.newline.repeat(2)
    : journal.hasTerminalNewline
      ? journal.newline
      : "";
  return [
    `## ${dateKey}`,
    journal.newline,
    journal.newline,
    normalized,
    terminal
  ].join("");
};

const findSection = (
  journal: DateSectionDocument,
  dateKey: string
): DateSectionRecord | undefined =>
  journal.sections.find((section) => section.dateKey === dateKey);

const findInsertionOffset = (
  journal: DateSectionDocument,
  dateKey: string
): number => {
  const nextSection = journal.sections.find(
    (section) => section.dateKey > dateKey
  );
  if (nextSection !== undefined) {
    return nextSection.headingStart;
  }
  const lastSection = journal.sections[journal.sections.length - 1];
  return lastSection?.bodyEnd ?? journal.source.length;
};

const applyUpsert = (
  journal: DateSectionDocument,
  mutation: UpsertDateSection
): DateSectionMutationResult => {
  if (mutation.dateKey > mutation.todayKey) {
    return {
      type: "future-date",
      dateKey: mutation.dateKey
    };
  }
  const section = findSection(journal, mutation.dateKey);
  if (section === undefined) {
    if (mutation.expectedRevision !== null) {
      return {
        type: "conflict",
        reason: "deleted"
      };
    }
    if (mutation.content === "") {
      return { type: "noop" };
    }
    const insertionOffset = findInsertionOffset(journal, mutation.dateKey);
    const hasFollowingBoundary = insertionOffset < journal.source.length;
    const inserted = [
      separatorBefore(journal.source, insertionOffset, journal),
      formatInsertedSection(
        mutation.dateKey,
        mutation.content,
        journal,
        hasFollowingBoundary
      )
    ].join("");
    const source = [
      journal.source.slice(0, insertionOffset),
      inserted,
      journal.source.slice(insertionOffset)
    ].join("");
    const parsed = parseDateSectionJournal(source);
    if (parsed.type !== "valid") {
      return {
        type: "invalid-source",
        diagnostics: parsed.diagnostics
      };
    }
    return {
      type: "applied",
      source,
      revision: findSection(parsed.journal, mutation.dateKey)?.revision ?? null
    };
  }
  if (mutation.expectedRevision === null) {
    return {
      type: "conflict",
      reason: "created-externally"
    };
  }
  if (section.revision !== mutation.expectedRevision) {
    return {
      type: "conflict",
      reason: "changed"
    };
  }
  if (section.revision === createDateSectionRevision(mutation.content)) {
    return { type: "noop" };
  }
  const hasFollowingBoundary = section.bodyEnd < journal.source.length;
  const nextBody = formatBody(
    mutation.content,
    journal,
    hasFollowingBoundary
  );
  const source = [
    journal.source.slice(0, section.bodyStart),
    nextBody,
    journal.source.slice(section.bodyEnd)
  ].join("");
  return {
    type: "applied",
    source,
    revision: createDateSectionRevision(mutation.content)
  };
};

const applyDelete = (
  journal: DateSectionDocument,
  mutation: DeleteDateSection
): DateSectionMutationResult => {
  const section = findSection(journal, mutation.dateKey);
  if (section === undefined) {
    return {
      type: "conflict",
      reason: "deleted"
    };
  }
  if (section.revision !== mutation.expectedRevision) {
    return {
      type: "conflict",
      reason: "changed"
    };
  }
  let deletionStart = section.headingStart;
  const prefix = journal.source.slice(0, deletionStart);
  if (
    section.bodyEnd === journal.source.length
    &&
    prefix.endsWith(journal.newline.repeat(2))
    && deletionStart >= journal.newline.length
  ) {
    deletionStart -= journal.newline.length;
  }
  const source = [
    journal.source.slice(0, deletionStart),
    journal.source.slice(section.bodyEnd)
  ].join("");
  return {
    type: "applied",
    source,
    revision: null
  };
};

export const mutateDateSectionJournal = (
  source: string,
  mutation: DateSectionMutation
): DateSectionMutationResult => {
  const parsed = parseDateSectionJournal(source);
  if (parsed.type !== "valid") {
    return {
      type: "invalid-source",
      diagnostics: parsed.diagnostics
    };
  }
  return mutation.type === "upsert"
    ? applyUpsert(parsed.journal, mutation)
    : applyDelete(parsed.journal, mutation);
};
