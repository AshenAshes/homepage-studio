import type { AppStore, TransactionResult } from "../AppStore";
import type { Clock } from "../ports/Clock";
import type { PluginData } from "../../domain/data/types";
import {
  changeHeatmapCountType,
  applyHeatmapRetention,
  recordFileContent,
  rolloverHeatmapDate
} from "../../domain/heatmap/history";
import { isHeatmapPathExcluded } from "../../domain/heatmap/selection";
import { countWritingUnits } from "../../domain/heatmap/count";

export type HeatmapCountType = PluginData["heatmap"]["countType"];
export type HeatmapDateRange =
  PluginData["heatmap"]["preferences"]["dateRange"];
export type HeatmapStartOfWeek =
  PluginData["heatmap"]["preferences"]["startOfWeek"];
export type HeatmapThresholds =
  PluginData["heatmap"]["preferences"]["thresholds"];

export class HeatmapTrackingService {
  private readonly pendingBaselines = new Map<string, number>();
  private baselineContext = "";

  public constructor(
    private readonly store: AppStore,
    private readonly clock: Clock
  ) {}

  public shouldTrackPath(path: string): boolean {
    return this.store.selectReadyScalar((data) =>
      !isHeatmapPathExcluded(
        path,
        data.heatmap.preferences.excludeFolders
      )
    ) ?? false;
  }

  public shouldEstablishBaseline(path: string): boolean {
    this.syncBaselineContext();
    if (this.pendingBaselines.has(path)) {
      return false;
    }
    return this.store.selectReadyScalar((data) =>
      !isHeatmapPathExcluded(
        path,
        data.heatmap.preferences.excludeFolders
      )
      && (
        data.heatmap.sessionDate !== this.clock.localDateKey()
        || data.heatmap.todaySession[path] === undefined
      )
    ) ?? false;
  }

  public establishBaseline(
    path: string,
    content: string
  ): TransactionResult | null {
    if (!this.shouldEstablishBaseline(path)) {
      return null;
    }

    const countType = this.store.selectReadyScalar(
      (data) => data.heatmap.countType
    );
    if (countType !== null) {
      // Opening a note must not clone, validate, persist or render plugin data.
      // Commit its baseline together with the first actual count change.
      this.pendingBaselines.set(path, countWritingUnits(content, countType));
    }
    return null;
  }

  public recordEditorContent(
    path: string,
    content: string
  ): TransactionResult | null {
    this.syncBaselineContext();
    if (!this.shouldTrackPath(path)) {
      return null;
    }
    const dateKey = this.clock.localDateKey();
    const pendingBaseline = this.pendingBaselines.get(path);
    const unchanged = this.store.selectReadyScalar((data) => {
      const session = data.heatmap.sessionDate === dateKey
        ? data.heatmap.todaySession[path]
        : undefined;
      return (session?.current ?? pendingBaseline)
        === countWritingUnits(content, data.heatmap.countType);
    });
    if (unchanged) {
      return null;
    }
    const result = this.updateHeatmap("record heatmap editor change", (heatmap) => {
      const current = rolloverHeatmapDate(
        heatmap, dateKey, this.clock.now().getTime()
      );
      return recordFileContent(
        pendingBaseline === undefined || current.todaySession[path] !== undefined
          ? current
          : {
            ...current,
            todaySession: {
              ...current.todaySession,
              [path]: { initial: pendingBaseline, current: pendingBaseline }
            }
          },
        path,
        content,
        dateKey,
        this.clock.now().getTime()
      );
    });
    if (result.type === "applied") {
      this.pendingBaselines.delete(path);
    }
    return result;
  }

  private syncBaselineContext(): void {
    const countType = this.store.selectReadyScalar((data) => data.heatmap.countType);
    const context = `${this.store.getDataGeneration()}:${this.clock.localDateKey()}:${countType}`;
    if (context !== this.baselineContext) {
      this.pendingBaselines.clear();
      this.baselineContext = context;
    }
  }

  public refreshDate(): TransactionResult | null {
    const dateKey = this.clock.localDateKey();
    const savedAt = this.clock.now().getTime();
    const updateRequired = this.store.selectReadyScalar(
      (data) => applyHeatmapRetention(
        rolloverHeatmapDate(data.heatmap, dateKey, savedAt),
        dateKey,
        savedAt
      ) !== data.heatmap
    );
    if (!updateRequired) {
      return null;
    }

    return this.updateHeatmap("roll over heatmap date", (heatmap) =>
      applyHeatmapRetention(
        rolloverHeatmapDate(heatmap, dateKey, savedAt),
        dateKey,
        savedAt
      )
    );
  }

  public setCountType(countType: HeatmapCountType): TransactionResult | null {
    const currentCountType = this.store.selectReadyScalar(
      (data) => data.heatmap.countType
    );
    if (currentCountType === null || currentCountType === countType) {
      return null;
    }

    const result = this.store.transact("change heatmap count type", "immediate", (data) => ({
      ...data,
      heatmap: changeHeatmapCountType(
        data.heatmap,
        countType,
        this.clock.localDateKey(),
        this.clock.now().getTime()
      )
    }));
    this.syncBaselineContext();
    return result;
  }

  public setDateRange(dateRange: HeatmapDateRange): TransactionResult | null {
    if (
      (dateRange.type === "latestDays"
        && (
          !Number.isInteger(dateRange.days)
          || dateRange.days < 1
          || dateRange.days > 3650
        ))
      || (dateRange.type === "fixedYear"
        && (
          !Number.isInteger(dateRange.year)
          || dateRange.year < 1970
          || dateRange.year > 9999
        ))
    ) {
      return null;
    }

    return this.updatePreferences("change heatmap date range", (preferences) => ({
      ...preferences,
      dateRange
    }));
  }

  public setStartOfWeek(
    startOfWeek: HeatmapStartOfWeek
  ): TransactionResult | null {
    return this.updatePreferences("change heatmap week start", (preferences) => ({
      ...preferences,
      startOfWeek
    }));
  }

  public setThresholds(
    thresholds: HeatmapThresholds
  ): TransactionResult | null {
    const [low, medium, high] = thresholds;
    if (
      !thresholds.every((value) => Number.isInteger(value) && value > 0)
      || !(low < medium && medium < high)
    ) {
      return null;
    }

    return this.updatePreferences("change heatmap thresholds", (preferences) => ({
      ...preferences,
      thresholds
    }));
  }

  public setExcludeFolders(
    excludeFolders: readonly string[]
  ): TransactionResult | null {
    const normalized = [...new Set(
      excludeFolders
        .map((path) => path.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/gu, ""))
        .filter((path) => path !== "")
    )];
    return this.updatePreferences("change heatmap exclusions", (preferences) => ({
      ...preferences,
      excludeFolders: normalized
    }));
  }

  public setHistoryRetentionDays(
    historyRetentionDays: number
  ): TransactionResult | null {
    if (!Number.isInteger(historyRetentionDays) || historyRetentionDays < 0) {
      return null;
    }

    const dateKey = this.clock.localDateKey();
    const savedAt = this.clock.now().getTime();
    return this.updateHeatmap("change heatmap detail retention", (heatmap) =>
      applyHeatmapRetention(
        {
          ...rolloverHeatmapDate(heatmap, dateKey, savedAt),
          historyRetentionDays,
          lastSaveTime: savedAt
        },
        dateKey,
        savedAt
      )
    );
  }

  private updateHeatmap(
    name: string,
    update: (heatmap: PluginData["heatmap"]) => PluginData["heatmap"]
  ): TransactionResult {
    return this.store.transact(name, "normal", (data) => ({
      ...data,
      heatmap: update(data.heatmap)
    }));
  }

  private updatePreferences(
    name: string,
    update: (
      preferences: PluginData["heatmap"]["preferences"]
    ) => PluginData["heatmap"]["preferences"]
  ): TransactionResult | null {
    if (!this.store.isReady()) {
      return null;
    }
    const dateKey = this.clock.localDateKey();
    const savedAt = this.clock.now().getTime();
    return this.updateHeatmap(name, (heatmap) => ({
      ...rolloverHeatmapDate(heatmap, dateKey, savedAt),
      preferences: update(heatmap.preferences),
      lastSaveTime: savedAt
    }));
  }
}
