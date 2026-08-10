import type {
  DayStats,
  PluginData
} from "../data/types";

export interface SelectedHeatmapDay {
  readonly total: number;
  readonly files: Readonly<Record<string, number>>;
  readonly detailsState: "available" | "archived";
}

const normalizeFolder = (path: string): string =>
  path.replace(/^\/+|\/+$/gu, "");

const isExcluded = (
  path: string,
  excludedFolders: readonly string[]
): boolean => {
  const normalizedPath = normalizeFolder(path);
  return excludedFolders.some((folder) => {
    const normalizedFolder = normalizeFolder(folder);
    return (
      normalizedPath === normalizedFolder
      || normalizedPath.startsWith(`${normalizedFolder}/`)
    );
  });
};

export const selectHeatmapDay = (
  day: DayStats | undefined,
  excludedFolders: readonly string[]
): SelectedHeatmapDay => {
  if (day === undefined) {
    return {
      total: 0,
      files: {},
      detailsState: "available"
    };
  }

  const entries = Object.entries(day.files);
  if (entries.length === 0 && day.totalWords > 0) {
    return {
      total: day.totalWords,
      files: {},
      detailsState: "archived"
    };
  }

  const files = Object.fromEntries(
    entries.filter(([path, contribution]) =>
      contribution > 0 && !isExcluded(path, excludedFolders)
    )
  );
  return {
    total: Object.values(files).reduce(
      (total, contribution) => total + contribution,
      0
    ),
    files,
    detailsState: "available"
  };
};

const DAY_IN_MILLISECONDS = 86_400_000;

const dateKeyToTimestamp = (dateKey: string): number => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
};

export const archiveExpiredHeatmapDetails = (
  heatmap: PluginData["heatmap"],
  todayKey: string
): PluginData["heatmap"] => {
  if (heatmap.historyRetentionDays <= 0) {
    return heatmap;
  }

  const cutoff = dateKeyToTimestamp(todayKey)
    - heatmap.historyRetentionDays * DAY_IN_MILLISECONDS;
  let changed = false;
  const history = Object.fromEntries(
    Object.entries(heatmap.history).map(([dateKey, day]) => {
      if (
        dateKeyToTimestamp(dateKey) < cutoff
        && Object.keys(day.files).length > 0
      ) {
        changed = true;
        return [
          dateKey,
          {
            ...day,
            files: {}
          }
        ];
      }
      return [dateKey, day];
    })
  );

  return changed
    ? {
      ...heatmap,
      history
    }
    : heatmap;
};
