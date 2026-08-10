import type {
  FileEntry,
  FileGroup
} from "../data/types";

export type FileGroupMutationIssue =
  | "invalid-name"
  | "duplicate-path";

export type FileGroupMoveOffset = -1 | 1;

export type ReplaceFileGroupEntryPathResult =
  | {
    readonly type: "applied";
    readonly groups: readonly FileGroup[];
  }
  | { readonly type: "duplicate-path" }
  | { readonly type: "not-found" };

export interface FileEntryLabel {
  readonly id: string;
  readonly path: string;
  readonly fileName: string;
  readonly parentLabel: string | null;
}

export const normalizeFileGroupName = (name: string): string => name.trim();

export const validateFileGroupName = (
  name: string
): FileGroupMutationIssue | null => {
  const normalized = normalizeFileGroupName(name);
  return normalized.length === 0 || normalized.length > 100
    ? "invalid-name"
    : null;
};

export const hasFileGroupPath = (
  group: FileGroup,
  path: string
): boolean => group.entries.some((entry) => entry.path === path);

const moveItem = <Item extends { readonly id: string }>(
  items: readonly Item[],
  id: string,
  offset: FileGroupMoveOffset
): readonly Item[] => {
  const sourceIndex = items.findIndex((item) => item.id === id);
  const targetIndex = sourceIndex + offset;
  if (
    sourceIndex < 0
    || targetIndex < 0
    || targetIndex >= items.length
  ) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(sourceIndex, 1);
  if (item === undefined) {
    return items;
  }
  next.splice(targetIndex, 0, item);
  return next;
};

export const moveFileGroup = (
  groups: readonly FileGroup[],
  groupId: string,
  offset: FileGroupMoveOffset
): readonly FileGroup[] => moveItem(groups, groupId, offset);

export const moveFileGroupEntry = (
  groups: readonly FileGroup[],
  groupId: string,
  entryId: string,
  offset: FileGroupMoveOffset
): readonly FileGroup[] => {
  const groupIndex = groups.findIndex((group) => group.id === groupId);
  const group = groups[groupIndex];
  if (group === undefined) {
    return groups;
  }
  const entries = moveItem(group.entries, entryId, offset);
  if (entries === group.entries) {
    return groups;
  }
  const next = [...groups];
  next[groupIndex] = {
    ...group,
    entries
  };
  return next;
};

export const replaceFileGroupEntryPath = (
  groups: readonly FileGroup[],
  groupId: string,
  entryId: string,
  path: string
): ReplaceFileGroupEntryPathResult => {
  const groupIndex = groups.findIndex((group) => group.id === groupId);
  const group = groups[groupIndex];
  if (group === undefined) {
    return { type: "not-found" };
  }
  const entryIndex = group.entries.findIndex((entry) => entry.id === entryId);
  const entry = group.entries[entryIndex];
  if (entry === undefined) {
    return { type: "not-found" };
  }
  if (group.entries.some((candidate) =>
    candidate.id !== entryId && candidate.path === path
  )) {
    return { type: "duplicate-path" };
  }
  const entries = [...group.entries];
  entries[entryIndex] = {
    ...entry,
    path
  };
  const next = [...groups];
  next[groupIndex] = {
    ...group,
    entries
  };
  return {
    type: "applied",
    groups: next
  };
};

const remapPath = (
  path: string,
  oldPath: string,
  newPath: string,
  directory: boolean
): string | null => {
  if (path === oldPath) {
    return newPath;
  }
  const prefix = `${oldPath}/`;
  return directory && path.startsWith(prefix)
    ? `${newPath}/${path.slice(prefix.length)}`
    : null;
};

export const remapFileEntryPaths = (
  groups: readonly FileGroup[],
  oldPath: string,
  newPath: string,
  directory: boolean
): readonly FileGroup[] => {
  let changed = false;
  const next = groups.map((group) => {
    const candidates = group.entries.map((entry) => {
      const path = remapPath(entry.path, oldPath, newPath, directory);
      return path === null
        ? { entry, remapped: false }
        : {
          entry: {
            ...entry,
            path
          },
          remapped: true
        };
    });
    const remappedPaths = new Set(
      candidates
        .filter((candidate) => candidate.remapped)
        .map((candidate) => candidate.entry.path)
    );
    const entries = candidates
      .filter((candidate) =>
        candidate.remapped || !remappedPaths.has(candidate.entry.path)
      )
      .map((candidate) => candidate.entry);
    if (
      entries.length === group.entries.length
      && candidates.every((candidate) => !candidate.remapped)
    ) {
      return group;
    }
    changed = true;
    return {
      ...group,
      entries
    };
  });
  return changed ? next : groups;
};

const splitPath = (path: string): readonly string[] =>
  path.split("/").filter((part) => part !== "");

const stripFileExtension = (fileName: string): string => {
  const extensionSeparator = fileName.lastIndexOf(".");
  return extensionSeparator > 0
    ? fileName.slice(0, extensionSeparator)
    : fileName;
};

const getFileName = (entry: FileEntry): string => {
  const parts = splitPath(entry.path);
  return stripFileExtension(parts[parts.length - 1] ?? entry.path);
};

const getParentParts = (entry: FileEntry): readonly string[] => {
  const parts = splitPath(entry.path);
  return parts.slice(0, -1);
};

const shortestUniqueParent = (
  entry: FileEntry,
  duplicates: readonly FileEntry[]
): string | null => {
  const parents = getParentParts(entry);
  for (let depth = 1; depth <= parents.length; depth += 1) {
    const suffix = parents.slice(-depth).join("/");
    const unique = duplicates.every((candidate) =>
      candidate.id === entry.id
      || getParentParts(candidate).slice(-depth).join("/") !== suffix
    );
    if (unique) {
      return suffix;
    }
  }
  return parents.join("/") || null;
};

export const buildFileEntryLabels = (
  entries: readonly FileEntry[]
): readonly FileEntryLabel[] => {
  const entriesByName = new Map<string, FileEntry[]>();
  for (const entry of entries) {
    const fileName = getFileName(entry);
    const duplicates = entriesByName.get(fileName) ?? [];
    duplicates.push(entry);
    entriesByName.set(fileName, duplicates);
  }
  return entries.map((entry) => {
    const fileName = getFileName(entry);
    const duplicates = entriesByName.get(fileName) ?? [];
    return {
      id: entry.id,
      path: entry.path,
      fileName,
      parentLabel: duplicates.length > 1
        ? shortestUniqueParent(entry, duplicates)
        : null
    };
  });
};
