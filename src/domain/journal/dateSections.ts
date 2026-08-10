export type DateSectionDiagnosticCode =
  | "JRN-D-INVALID-DATE"
  | "JRN-D-DUPLICATE-DATE"
  | "JRN-D-OUT-OF-ORDER"
  | "JRN-D-AMBIGUOUS-HEADING"
  | "JRN-D-UNSTRUCTURED";

export interface DateSectionDiagnostic {
  readonly code: DateSectionDiagnosticCode;
  readonly line: number;
  readonly details: string;
}

export interface DateSectionRecord {
  readonly dateKey: string;
  readonly line: number;
  readonly headingStart: number;
  readonly headingEnd: number;
  readonly bodyStart: number;
  readonly bodyEnd: number;
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly content: string;
  readonly rawBody: string;
  readonly revision: string;
}

export interface DateSectionDocument {
  readonly source: string;
  readonly bom: "" | "\uFEFF";
  readonly newline: "\n" | "\r\n";
  readonly hasTerminalNewline: boolean;
  readonly sections: readonly DateSectionRecord[];
}

export type DateSectionParseResult =
  | { readonly type: "valid"; readonly journal: DateSectionDocument }
  | {
    readonly type: "invalid";
    readonly diagnostics: readonly DateSectionDiagnostic[];
  };

interface SourceLine {
  readonly number: number;
  readonly start: number;
  readonly contentEnd: number;
  readonly end: number;
  readonly text: string;
  readonly structuralText: string;
  readonly structuralStart: number;
}

interface Heading {
  readonly type: "date" | "other";
  readonly line: SourceLine;
  readonly dateKey: string | null;
}

interface OpenFence {
  readonly marker: "`" | "~";
  readonly length: number;
}

const DATE_HEADING = /^## (\d{4}-\d{2}-\d{2})[ \t]*$/u;
const DATE_LIKE_HEADING = /^## [0-9]/u;
const LEVEL_TWO_HEADING = /^##(?!#)(?:[ \t]+.*)?$/u;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/u;

const scanLines = (source: string): readonly SourceLine[] => {
  const lines: SourceLine[] = [];
  let start = 0;
  let number = 1;
  while (start < source.length) {
    const newlineIndex = source.indexOf("\n", start);
    const end = newlineIndex === -1 ? source.length : newlineIndex + 1;
    const contentEnd = newlineIndex === -1
      ? source.length
      : newlineIndex > start && source[newlineIndex - 1] === "\r"
        ? newlineIndex - 1
        : newlineIndex;
    const text = source.slice(start, contentEnd);
    const hasBom = start === 0 && text.startsWith("\uFEFF");
    lines.push({
      number,
      start,
      contentEnd,
      end,
      text,
      structuralText: hasBom ? text.slice(1) : text,
      structuralStart: start + (hasBom ? 1 : 0)
    });
    start = end;
    number += 1;
  }
  return lines;
};

const isRealDateKey = (dateKey: string): boolean => {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const parseFenceOpen = (line: string): OpenFence | null => {
  const match = FENCE_OPEN.exec(line);
  const matchedPrefix = match?.[0];
  const token = match?.[1];
  if (matchedPrefix === undefined || token === undefined) {
    return null;
  }
  const marker = token[0];
  if (marker !== "`" && marker !== "~") {
    return null;
  }
  if (marker === "`" && line.slice(matchedPrefix.length).includes("`")) {
    return null;
  }
  return {
    marker,
    length: token.length
  };
};

const closesFence = (line: string, fence: OpenFence): boolean => {
  const trimmed = line.replace(/^ {0,3}/u, "");
  const markerRun = trimmed.match(
    fence.marker === "`" ? /^`+/u : /^~+/u
  )?.[0];
  return markerRun !== undefined
    && markerRun.length >= fence.length
    && trimmed.slice(markerRun.length).trim() === "";
};

const detectNewline = (source: string): "\n" | "\r\n" => {
  const newlineIndex = source.indexOf("\n");
  return newlineIndex > 0 && source[newlineIndex - 1] === "\r"
    ? "\r\n"
    : "\n";
};

const isBlankSource = (source: string): boolean =>
  source.replace(/^\uFEFF/u, "").trim() === "";

export const createDateSectionRevision = (content: string): string =>
  content
    .replace(/\r\n|\r|\n/gu, "\n")
    .replace(/\n+$/u, "");

const trimTerminalNewlines = (
  source: string,
  start: number,
  end: number
): number => {
  let cursor = end;
  while (cursor > start) {
    if (source[cursor - 1] === "\n") {
      cursor -= 1;
      if (cursor > start && source[cursor - 1] === "\r") {
        cursor -= 1;
      }
      continue;
    }
    break;
  }
  return cursor;
};

export const parseDateSectionJournal = (
  source: string
): DateSectionParseResult => {
  const lines = scanLines(source);
  const headings: Heading[] = [];
  const diagnostics: DateSectionDiagnostic[] = [];
  let fence: OpenFence | null = null;

  for (const line of lines) {
    if (fence !== null) {
      if (closesFence(line.structuralText, fence)) {
        fence = null;
      }
      continue;
    }
    const openingFence = parseFenceOpen(line.structuralText);
    if (openingFence !== null) {
      fence = openingFence;
      continue;
    }
    const dateMatch = DATE_HEADING.exec(line.structuralText);
    const dateKey = dateMatch?.[1];
    if (dateKey !== undefined) {
      if (!isRealDateKey(dateKey)) {
        diagnostics.push({
          code: "JRN-D-INVALID-DATE",
          line: line.number,
          details: `Invalid calendar date heading: ${dateKey}`
        });
      } else {
        headings.push({
          type: "date",
          line,
          dateKey
        });
      }
      continue;
    }
    if (DATE_LIKE_HEADING.test(line.structuralText)) {
      diagnostics.push({
        code: "JRN-D-INVALID-DATE",
        line: line.number,
        details: "Date headings must exactly match ## YYYY-MM-DD."
      });
      continue;
    }
    if (LEVEL_TWO_HEADING.test(line.structuralText)) {
      headings.push({
        type: "other",
        line,
        dateKey: null
      });
    }
  }

  const dateHeadings = headings.filter(
    (heading): heading is Heading & { readonly dateKey: string } =>
      heading.type === "date" && heading.dateKey !== null
  );
  const seenDates = new Map<string, number>();
  let previousDate = "";
  for (const heading of dateHeadings) {
    const firstLine = seenDates.get(heading.dateKey);
    if (firstLine !== undefined) {
      diagnostics.push({
        code: "JRN-D-DUPLICATE-DATE",
        line: heading.line.number,
        details:
          `Duplicate date ${heading.dateKey}; first declared on line ${firstLine}.`
      });
      continue;
    }
    seenDates.set(heading.dateKey, heading.line.number);
    if (previousDate !== "" && heading.dateKey < previousDate) {
      diagnostics.push({
        code: "JRN-D-OUT-OF-ORDER",
        line: heading.line.number,
        details:
          `Date ${heading.dateKey} appears after later date ${previousDate}.`
      });
    }
    previousDate = heading.dateKey;
  }

  const firstDateLine = dateHeadings[0]?.line.number;
  const lastDateLine = dateHeadings[dateHeadings.length - 1]?.line.number;
  if (firstDateLine !== undefined && lastDateLine !== undefined) {
    for (const heading of headings) {
      if (
        heading.type === "other"
        && heading.line.number > firstDateLine
        && heading.line.number < lastDateLine
      ) {
        diagnostics.push({
          code: "JRN-D-AMBIGUOUS-HEADING",
          line: heading.line.number,
          details:
            "A non-date level-two heading cannot split ordered date sections."
        });
      }
    }
  }

  if (dateHeadings.length === 0 && !isBlankSource(source)) {
    diagnostics.push({
      code: "JRN-D-UNSTRUCTURED",
      line: 1,
      details:
        "A non-empty date-section journal must contain a valid date heading."
    });
  }
  if (diagnostics.length > 0) {
    return {
      type: "invalid",
      diagnostics
    };
  }

  const newline = detectNewline(source);
  const sections = dateHeadings.map((heading) => {
    const headingIndex = headings.indexOf(heading);
    const nextHeading = headings[headingIndex + 1];
    const bodyStart = heading.line.end;
    const bodyEnd = nextHeading?.line.structuralStart ?? source.length;
    const contentStart = source.startsWith(newline, bodyStart)
      ? bodyStart + newline.length
      : bodyStart;
    const contentEnd = trimTerminalNewlines(
      source,
      contentStart,
      bodyEnd
    );
    const rawBody = source.slice(bodyStart, bodyEnd);
    return {
      dateKey: heading.dateKey,
      line: heading.line.number,
      headingStart: heading.line.structuralStart,
      headingEnd: heading.line.end,
      bodyStart,
      bodyEnd,
      contentStart,
      contentEnd,
      content: source.slice(contentStart, contentEnd),
      rawBody,
      revision: createDateSectionRevision(
        source.slice(contentStart, contentEnd)
      )
    };
  });

  return {
    type: "valid",
    journal: {
      source,
      bom: source.startsWith("\uFEFF") ? "\uFEFF" : "",
      newline,
      hasTerminalNewline: source.endsWith("\n"),
      sections
    }
  };
};
