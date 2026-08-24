export type LocalePreference = "auto" | "zh-cn" | "en";
export type ThemeId =
  | "klein-blue"
  | "watercolor-journal"
  | "celestial-orbit"
  | "minimal-paper"
  | "archive-observatory"
  | "cosmic-cartography";
export type ModuleId =
  | "heatmap"
  | "journal"
  | "tasks"
  | "current-plan"
  | "file-groups";
export type ModuleSize = "compact" | "standard" | "expanded";

export interface Layout {
  readonly moduleOrder: readonly ModuleId[];
  readonly hiddenModules: readonly ModuleId[];
  readonly sizes: Readonly<Partial<Record<ModuleId, ModuleSize>>>;
  readonly bannerVisible: boolean;
}

export interface PlanPeriod {
  readonly id: string;
  readonly label: string;
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface DailyTemplate {
  readonly id: string;
  readonly name: string;
  readonly periods: readonly PlanPeriod[];
}

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface WeeklyTemplate {
  readonly id: string;
  readonly name: string;
  readonly days: Readonly<Record<Weekday, readonly PlanPeriod[]>>;
}

export type BannerSource =
  | { readonly type: "vault"; readonly value: string }
  | { readonly type: "remote"; readonly value: string };

export interface BannerTheme {
  readonly sourceMode: "inherit" | "override";
  readonly source: BannerSource | null;
  readonly height: "compact" | "standard" | "tall";
  readonly focalPoint: {
    readonly x: number;
    readonly y: number;
  };
}

export interface FileEntry {
  readonly id: string;
  readonly path: string;
}

export interface FileGroup {
  readonly id: string;
  readonly name: string;
  readonly entries: readonly FileEntry[];
}

export interface DayStats {
  readonly totalWords: number;
  readonly files: Readonly<Record<string, number>>;
}

export interface SessionFileStats {
  readonly initial: number;
  readonly current: number;
}

export interface PluginData {
  readonly schemaVersion: 1;
  readonly locale: LocalePreference;
  readonly theme: ThemeId;
  readonly appearanceMode: "auto" | "light" | "dark";
  readonly startup: {
    readonly openOnStartup: boolean;
    readonly openWhenWorkspaceEmpty: boolean;
  };
  readonly layouts: Readonly<Partial<Record<ThemeId, Layout>>>;
  readonly journal: {
    readonly filePath: string | null;
    readonly viewMode: "edit" | "preview";
  };
  readonly tasks: {
    readonly filePath: string | null;
    readonly showCompleted: boolean;
    readonly showArchiveToggle: boolean;
  };
  readonly plans: {
    readonly activeMode: "daily" | "weekly";
    readonly selectedDailyTemplateId: string | null;
    readonly selectedWeeklyTemplateId: string | null;
    readonly dailyTemplates: readonly DailyTemplate[];
    readonly weeklyTemplates: readonly WeeklyTemplate[];
  };
  readonly banner: {
    readonly title: string | null;
    readonly subtitle: string | null;
    readonly globalSource: BannerSource | null;
    readonly themes: Readonly<Partial<Record<ThemeId, BannerTheme>>>;
  };
  readonly fileGroups: readonly FileGroup[];
  readonly heatmap: {
    readonly history: Readonly<Record<string, DayStats>>;
    readonly todaySession: Readonly<Record<string, SessionFileStats>>;
    readonly lastSaveTime: number;
    readonly sessionDate: string;
    readonly countType: "char" | "word";
    readonly historyRetentionDays: number;
    readonly language: "auto" | "zh" | "en";
    readonly preferences: {
      readonly excludeFolders: readonly string[];
      readonly dateRange:
        | { readonly type: "latestDays"; readonly days: number }
        | { readonly type: "fixedYear"; readonly year: number };
      readonly startOfWeek: 0 | 1 | 6;
      readonly thresholds: readonly [number, number, number];
    };
  };
}
