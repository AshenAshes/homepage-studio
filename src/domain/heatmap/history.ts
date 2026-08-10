import type {
  DayStats,
  PluginData,
  SessionFileStats
} from "../data/types";
import { countWritingUnits } from "./count";
import { archiveExpiredHeatmapDetails } from "./selection";

type HeatmapData = PluginData["heatmap"];

const sumPositiveContributions = (
  files: Readonly<Record<string, number>>
): number => Object.values(files).reduce(
  (total, contribution) => contribution > 0 ? total + contribution : total,
  0
);

const withSaveMetadata = (
  heatmap: HeatmapData,
  dateKey: string,
  savedAt: number
): HeatmapData => ({
  ...heatmap,
  lastSaveTime: savedAt,
  sessionDate: dateKey
});

export const rolloverHeatmapDate = (
  heatmap: HeatmapData,
  dateKey: string,
  savedAt: number
): HeatmapData => {
  if (heatmap.sessionDate === dateKey) {
    return heatmap;
  }

  const retainsUndatedLegacySession =
    heatmap.sessionDate === ""
    && (
      heatmap.history[dateKey] !== undefined
      || Object.keys(heatmap.todaySession).length > 0
    );

  return withSaveMetadata(
    {
      ...heatmap,
      todaySession: retainsUndatedLegacySession ? heatmap.todaySession : {}
    },
    dateKey,
    savedAt
  );
};

export const establishFileBaseline = (
  heatmap: HeatmapData,
  path: string,
  content: string,
  dateKey: string,
  savedAt: number
): HeatmapData => {
  const currentHeatmap = rolloverHeatmapDate(heatmap, dateKey, savedAt);
  if (currentHeatmap.todaySession[path] !== undefined) {
    return currentHeatmap;
  }

  const count = countWritingUnits(content, currentHeatmap.countType);
  const baseline: SessionFileStats = {
    initial: count,
    current: count
  };
  return withSaveMetadata(
    {
      ...currentHeatmap,
      todaySession: {
        ...currentHeatmap.todaySession,
        [path]: baseline
      }
    },
    dateKey,
    savedAt
  );
};

export const recordFileContent = (
  heatmap: HeatmapData,
  path: string,
  content: string,
  dateKey: string,
  savedAt: number
): HeatmapData => {
  const currentHeatmap = rolloverHeatmapDate(heatmap, dateKey, savedAt);
  const currentCount = countWritingUnits(content, currentHeatmap.countType);
  const previousSession = currentHeatmap.todaySession[path];
  const nextSession: SessionFileStats = previousSession === undefined
    ? { initial: currentCount, current: currentCount }
    : { ...previousSession, current: currentCount };
  const contribution = nextSession.current - nextSession.initial;
  const previousDay: DayStats = currentHeatmap.history[dateKey] ?? {
    totalWords: 0,
    files: {}
  };
  const files = { ...previousDay.files };
  if (contribution > 0) {
    files[path] = contribution;
  } else {
    delete files[path];
  }

  return withSaveMetadata(
    {
      ...currentHeatmap,
      todaySession: {
        ...currentHeatmap.todaySession,
        [path]: nextSession
      },
      history: {
        ...currentHeatmap.history,
        [dateKey]: {
          totalWords: sumPositiveContributions(files),
          files
        }
      }
    },
    dateKey,
    savedAt
  );
};

export const changeHeatmapCountType = (
  heatmap: HeatmapData,
  countType: HeatmapData["countType"],
  dateKey: string,
  savedAt: number
): HeatmapData => {
  const currentHeatmap = rolloverHeatmapDate(heatmap, dateKey, savedAt);
  if (currentHeatmap.countType === countType) {
    return currentHeatmap;
  }

  const history = { ...currentHeatmap.history };
  delete history[dateKey];
  return withSaveMetadata(
    {
      ...currentHeatmap,
      countType,
      todaySession: {},
      history
    },
    dateKey,
    savedAt
  );
};

export const applyHeatmapRetention = (
  heatmap: HeatmapData,
  dateKey: string,
  savedAt: number
): HeatmapData => {
  const archived = archiveExpiredHeatmapDetails(heatmap, dateKey);
  return archived === heatmap
    ? heatmap
    : withSaveMetadata(archived, dateKey, savedAt);
};
