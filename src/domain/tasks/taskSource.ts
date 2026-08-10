export type TaskSourceDiagnosticCode =
  | "TASK-DUPLICATE-REGION"
  | "TASK-MISSING-ACTIVE"
  | "TASK-MISSING-ARCHIVE"
  | "TASK-DUPLICATE-SECTION"
  | "TASK-SECTION-ORDER"
  | "TASK-UNEXPECTED-HEADING"
  | "TASK-INVALID-CONTENT"
  | "TASK-ARCHIVE-INCOMPLETE";

export interface TaskSourceDiagnostic {
  readonly code: TaskSourceDiagnosticCode;
  readonly line: number;
  readonly details: string;
}

export type TaskSection = "active" | "archive";

export interface TaskTarget {
  readonly section: TaskSection;
  readonly rawLine: string;
  readonly previousTaskLine: string | null;
  readonly nextTaskLine: string | null;
}

export interface HomepageTaskRecord {
  readonly section: TaskSection;
  readonly line: number;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly rawLine: string;
  readonly text: string;
  readonly completed: boolean;
  readonly target: TaskTarget;
}

export interface TaskSourceDocument {
  readonly source: string;
  readonly bom: "" | "\uFEFF";
  readonly newline: "\n" | "\r\n";
  readonly hasTerminalNewline: boolean;
  readonly regionStart: number;
  readonly regionEnd: number;
  readonly activeContentStart: number;
  readonly archiveContentStart: number;
  readonly tasks: readonly HomepageTaskRecord[];
}

export type TaskSourceParseResult =
  | { readonly type: "valid"; readonly taskSource: TaskSourceDocument }
  | { readonly type: "missing-region" }
  | {
    readonly type: "invalid";
    readonly diagnostics: readonly TaskSourceDiagnostic[];
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

interface OpenFence {
  readonly marker: "`" | "~";
  readonly length: number;
}

interface StructuralHeading {
  readonly level: 1 | 2 | 3;
  readonly kind: "region" | "active" | "archive" | "other";
  readonly line: SourceLine;
}

const STRUCTURAL_HEADING = /^(#{1,3})(?!#)(?:[ \t]+(.*?))?[ \t]*$/u;
const TASK_LINE = /^- \[([ xX])\] (.+)$/u;
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

const parseFenceOpen = (line: string): OpenFence | null => {
  const token = FENCE_OPEN.exec(line)?.[1];
  const marker = token?.[0];
  if (
    token === undefined
    || (marker !== "`" && marker !== "~")
    || (marker === "`" && line.slice(token.length).includes("`"))
  ) {
    return null;
  }
  return { marker, length: token.length };
};

const closesFence = (line: string, fence: OpenFence): boolean => {
  const trimmed = line.replace(/^ {0,3}/u, "");
  const run = trimmed.match(fence.marker === "`" ? /^`+/u : /^~+/u)?.[0];
  return run !== undefined
    && run.length >= fence.length
    && trimmed.slice(run.length).trim() === "";
};

const detectNewline = (source: string): "\n" | "\r\n" => {
  const index = source.indexOf("\n");
  return index > 0 && source[index - 1] === "\r" ? "\r\n" : "\n";
};

const classifyHeading = (line: SourceLine): StructuralHeading | null => {
  const match = STRUCTURAL_HEADING.exec(line.structuralText);
  const hashes = match?.[1];
  if (hashes === undefined) {
    return null;
  }
  const level = hashes.length as 1 | 2 | 3;
  const label = match?.[2]?.trim() ?? "";
  const kind = label === "Homepage tasks" && level === 1
    ? "region"
    : label === "Active" && level === 2
      ? "active"
      : label === "Archive" && level === 2
        ? "archive"
        : "other";
  return { level, kind, line };
};

const scanHeadings = (lines: readonly SourceLine[]): StructuralHeading[] => {
  const headings: StructuralHeading[] = [];
  let fence: OpenFence | null = null;
  for (const line of lines) {
    if (fence !== null) {
      if (closesFence(line.structuralText, fence)) {
        fence = null;
      }
      continue;
    }
    const opening = parseFenceOpen(line.structuralText);
    if (opening !== null) {
      fence = opening;
      continue;
    }
    const heading = classifyHeading(line);
    if (heading !== null) {
      headings.push(heading);
    }
  }
  return headings;
};

const parseSectionTasks = (
  lines: readonly SourceLine[],
  section: TaskSection,
  start: number,
  end: number,
  diagnostics: TaskSourceDiagnostic[]
): Omit<HomepageTaskRecord, "target">[] => {
  const tasks: Omit<HomepageTaskRecord, "target">[] = [];
  for (const line of lines) {
    if (line.start < start || line.start >= end || line.text.trim() === "") {
      continue;
    }
    const match = TASK_LINE.exec(line.structuralText);
    const marker = match?.[1];
    const text = match?.[2];
    if (marker === undefined || text === undefined) {
      diagnostics.push({
        code: "TASK-INVALID-CONTENT",
        line: line.number,
        details: "Managed task sections may contain only single-line checkboxes."
      });
      continue;
    }
    const completed = marker.toLowerCase() === "x";
    if (section === "archive" && !completed) {
      diagnostics.push({
        code: "TASK-ARCHIVE-INCOMPLETE",
        line: line.number,
        details: "Archive may contain only completed tasks."
      });
    }
    tasks.push({
      section,
      line: line.number,
      lineStart: line.structuralStart,
      lineEnd: line.end,
      rawLine: line.structuralText,
      text,
      completed
    });
  }
  return tasks;
};

export const parseHomepageTaskSource = (
  source: string
): TaskSourceParseResult => {
  const lines = scanLines(source);
  const headings = scanHeadings(lines);
  const regions = headings.filter((heading) => heading.kind === "region");
  if (regions.length === 0) {
    return { type: "missing-region" };
  }
  if (regions.length > 1) {
    return {
      type: "invalid",
      diagnostics: regions.slice(1).map((heading) => ({
        code: "TASK-DUPLICATE-REGION",
        line: heading.line.number,
        details: "Homepage tasks heading must be unique."
      }))
    };
  }

  const region = regions[0];
  if (region === undefined) {
    return { type: "missing-region" };
  }
  const nextRegionBoundary = headings.find(
    (heading) =>
      heading.level <= region.level
      && heading.line.start > region.line.start
  );
  const regionEnd = nextRegionBoundary?.line.structuralStart ?? source.length;
  const childLevel = region.level + 1;
  const children = headings.filter(
    (heading) =>
      heading.level === childLevel
      && heading.line.start > region.line.start
      && heading.line.start < regionEnd
  );
  const active = children.filter((heading) => heading.kind === "active");
  const archive = children.filter((heading) => heading.kind === "archive");
  const diagnostics: TaskSourceDiagnostic[] = [];
  if (active.length === 0) {
    diagnostics.push({
      code: "TASK-MISSING-ACTIVE",
      line: region.line.number,
      details: `Managed region requires one ${"#".repeat(childLevel)} Active heading.`
    });
  }
  if (archive.length === 0) {
    diagnostics.push({
      code: "TASK-MISSING-ARCHIVE",
      line: region.line.number,
      details: `Managed region requires one ${"#".repeat(childLevel)} Archive heading.`
    });
  }
  for (const duplicate of [...active.slice(1), ...archive.slice(1)]) {
    diagnostics.push({
      code: "TASK-DUPLICATE-SECTION",
      line: duplicate.line.number,
      details: "Active and Archive headings must each be unique."
    });
  }
  for (const unexpected of children.filter((heading) => heading.kind === "other")) {
    diagnostics.push({
      code: "TASK-UNEXPECTED-HEADING",
      line: unexpected.line.number,
      details: "Unexpected direct child heading inside managed task region."
    });
  }
  const activeHeading = active[0];
  const archiveHeading = archive[0];
  if (
    activeHeading !== undefined
    && archiveHeading !== undefined
    && activeHeading.line.start > archiveHeading.line.start
  ) {
    diagnostics.push({
      code: "TASK-SECTION-ORDER",
      line: activeHeading.line.number,
      details: "Active must appear before Archive."
    });
  }
  if (diagnostics.length > 0 || activeHeading === undefined || archiveHeading === undefined) {
    return { type: "invalid", diagnostics };
  }

  const activeTasks = parseSectionTasks(
    lines,
    "active",
    activeHeading.line.end,
    archiveHeading.line.structuralStart,
    diagnostics
  );
  const archiveTasks = parseSectionTasks(
    lines,
    "archive",
    archiveHeading.line.end,
    regionEnd,
    diagnostics
  );
  if (diagnostics.length > 0) {
    return { type: "invalid", diagnostics };
  }
  const rawTasks = [...activeTasks, ...archiveTasks];
  const tasks = rawTasks.map((task): HomepageTaskRecord => {
    const sectionTasks = rawTasks.filter(
      (candidate) => candidate.section === task.section
    );
    const sectionIndex = sectionTasks.indexOf(task);
    return {
      ...task,
      target: {
        section: task.section,
        rawLine: task.rawLine,
        previousTaskLine: sectionTasks[sectionIndex - 1]?.rawLine ?? null,
        nextTaskLine: sectionTasks[sectionIndex + 1]?.rawLine ?? null
      }
    };
  });

  return {
    type: "valid",
    taskSource: {
      source,
      bom: source.startsWith("\uFEFF") ? "\uFEFF" : "",
      newline: detectNewline(source),
      hasTerminalNewline: source.endsWith("\n"),
      regionStart: region.line.structuralStart,
      regionEnd,
      activeContentStart: activeHeading.line.end,
      archiveContentStart: archiveHeading.line.end,
      tasks
    }
  };
};

export const createMinimalTaskSource = (
  newline: "\n" | "\r\n" = "\n"
): string => [
  "# Homepage tasks",
  "",
  "## Active",
  "",
  "## Archive",
  ""
].join(newline);
