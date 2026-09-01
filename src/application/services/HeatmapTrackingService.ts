import type { AppStore, TransactionResult } from "../AppStore";
import type { Clock } from "../ports/Clock";
import type { PluginData } from "../../domain/data/types";
import {
  changeHeatmapCountType,
  applyHeatmapRetention,
  establishFileBaseline,
  recordFileContent,
  rolloverHeatmapDate
} from "../../domain/heatmap/history";

export type HeatmapCountType = PluginData["heatmap"]["countType"];
export type HeatmapDateRange =
  PluginData["heatmap"]["preferences"]["dateRange"];
export type HeatmapStartOfWeek =
  PluginData["heatmap"]["preferences"]["startOfWeek"];
export type HeatmapThresholds =
  PluginData["heatmap"]["preferences"]["thresholds"];

export class HeatmapTrackingService {
  public constructor(
    private readonly store: AppStore,
    private readonly clock: Clock
  ) {}

  public establishBaseline(
    path: string,
    content: string
  ): TransactionResult | null {
    const baselineExists = this.store.selectReadyScalar((data) =>
      data.heatmap.sessionDate === this.clock.localDateKey()
      && data.heatmap.todaySession[path] !== undefined
    );
    if (baselineExists) {
      return null;
    }

    return this.updateHeatmap("establish heatmap baseline", (heatmap) =>
      establishFileBaseline(
        heatmap,
        path,
        content,
        this.clock.localDateKey(),
        this.clock.now().getTime()
      )
    );
  }

  public recordEditorContent(path: string, content: string): TransactionResult {
    return this.updateHeatmap("record heatmap editor change", (heatmap) =>
      recordFileContent(
        heatmap,
        path,
        content,
        this.clock.localDateKey(),
        this.clock.now().getTime()
      )
    );
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

    return this.store.transact("change heatmap count type", "immediate", (data) => ({
      ...data,
      heatmap: changeHeatmapCountType(
        data.heatmap,
        countType,
        this.clock.localDateKey(),
        this.clock.now().getTime()
      )
    }));
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
