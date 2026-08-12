import type {
  AppStore,
  TransactionResult
} from "./AppStore";
import type { LocalTimeSnapshot } from "./ports/Clock";
import type {
  HomepageSettingsSection,
  SettingsNavigationPort
} from "./ports/SettingsNavigation";
import { LocalizationService } from "./services/LocalizationService";
import type { ResetResult } from "./services/DataLifecycleService";
import {
  createHomepageShellViewModel,
  type HomepageShellViewModel
} from "./view-models/HomepageShellViewModel";
import type {
  BannerSource,
  BannerTheme,
  DailyTemplate,
  FileEntry,
  Layout,
  LocalePreference,
  ModuleId,
  ModuleSize,
  PlanPeriod,
  PluginData,
  ThemeId,
  Weekday,
  WeeklyTemplate
} from "../domain/data/types";
import type {
  HeatmapCountType,
  HeatmapDateRange,
  HeatmapStartOfWeek,
  HeatmapThresholds
} from "./services/HeatmapTrackingService";
import type { FileNavigationPort } from "./ports/FileNavigation";
import type {
  MarkdownFileCreateResult,
  MarkdownFileEvent
} from "./ports/MarkdownFile";
import type {
  DateSectionJournalLoadResult,
  DateSectionJournalMutationResult
} from "./services/DateSectionJournalService";
import type { DateSectionMutation } from
  "../domain/journal/dateSectionOperations";
import type {
  DateSectionDiagnostic,
  DateSectionDocument
} from "../domain/journal/dateSections";
import type {
  JournalDraftState,
  JournalDraftTarget
} from "./services/DateSectionJournalDraftService";
import type {
  TaskSourceCreationResult,
  TaskSourceLoadResult,
  TaskSourceMutationResult
} from "./services/TaskSourceService";
import type { TaskMutation } from "../domain/tasks/taskOperations";
import type {
  TaskRecurrence,
  TaskSourceDiagnostic,
  TaskSourceDocument,
  TaskTarget
} from "../domain/tasks/taskSource";
import {
  taskPeriodKeyFor,
  taskPeriodKeysForDate,
  type TaskPeriodKeys
} from "../domain/tasks/taskRecurrence";
import {
  normalizeDailyTemplate,
  normalizePlanLabel,
  normalizePlanName,
  validateDailyPeriods,
  validateDailyPlanName,
  type DailyPlanMutationIssue
} from "../domain/plans/dailyPlan";
import {
  validateWeeklyTemplate
} from "../domain/plans/weeklyPlan";
import {
  hasFileGroupPath,
  moveFileGroup as moveFileGroupInOrder,
  moveFileGroupEntry as moveFileGroupEntryInOrder,
  normalizeFileGroupName,
  remapFileEntryPaths,
  replaceFileGroupEntryPath,
  validateFileGroupName,
  type FileGroupMoveOffset,
  type FileGroupMutationIssue
} from "../domain/files/fileGroups";
import {
  BANNER_THEME_IDS,
  getBannerTheme,
  parseRemoteBannerSource,
  remapBannerVaultPaths
} from "../domain/banner/banner";
import {
  getLayout,
  moveModule,
  setModuleSize,
  setModuleVisibility
} from "../domain/layout/layout";

const shiftDateKey = (dateKey: string, offsetDays: number): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(
    year ?? 1970,
    (month ?? 1) - 1,
    day ?? 1
  ));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return [
    date.getUTCFullYear(),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0")
  ].join("-");
};

export interface HomepageWorkspacePort {
  openHomepage(): Promise<void>;
  hasHomepage(): boolean;
  hasCentralContentPage(): boolean;
  onLayoutReady(callback: () => void): void;
  subscribeLayoutChange(callback: () => void): () => void;
}

export interface HomepageDataRecoveryPort {
  reload(): Promise<void>;
  reset(): Promise<ResetResult>;
}

export interface ResetConfirmationPort {
  confirmReset(): Promise<boolean>;
}

export interface RecoveryFailurePort {
  notifyBackupFailure(error: unknown): void;
}

export type ResetPluginDataResult =
  | "cancelled"
  | "reset"
  | "backup-failed";

export interface HomepageSnapshot {
  readonly title: string;
  readonly description: string;
  readonly status: "loading" | "ready" | "safe-mode";
  readonly localTime: LocalTimeSnapshot | null;
  readonly shell: HomepageShellViewModel | null;
  readonly diagnostics: readonly {
    readonly code: string;
    readonly message: string;
    readonly details?: string;
    readonly relatedPaths: readonly string[];
    readonly suggestedAction: string;
  }[];
  readonly recoveryActions: {
    readonly reloadLabel: string;
    readonly resetLabel: string;
    readonly openDataManagementLabel: string;
  } | null;
}

export interface InterfaceAndStartupSettings {
  readonly editable: boolean;
  readonly locale: LocalePreference;
  readonly openOnStartup: boolean;
  readonly openWhenWorkspaceEmpty: boolean;
  readonly bannerTitle: string;
  readonly bannerSubtitle: string;
}

export interface LayoutSettings {
  readonly editable: boolean;
  readonly theme: ThemeId;
  readonly appearanceMode: PluginData["appearanceMode"];
  readonly layout: Layout;
  readonly hasOverride: boolean;
}

export type LayoutMutationResult =
  | { readonly type: "applied" }
  | { readonly type: "cancelled" }
  | { readonly type: "not-found" }
  | { readonly type: "blocked" };

export interface LayoutResetConfirmationPort {
  confirm(theme: ThemeId): Promise<boolean>;
}

export interface HeatmapSettings {
  readonly editable: boolean;
  readonly countType: HeatmapCountType;
  readonly dateRange: HeatmapDateRange;
  readonly startOfWeek: HeatmapStartOfWeek;
  readonly thresholds: HeatmapThresholds;
  readonly excludeFolders: readonly string[];
  readonly historyRetentionDays: number;
}

export interface HeatmapTrackingPort {
  establishBaseline(path: string, content: string): void;
  recordEditorContent(path: string, content: string): void;
  refreshDate(): void;
  setCountType(countType: HeatmapCountType): void;
  setDateRange(dateRange: HeatmapDateRange): void;
  setStartOfWeek(startOfWeek: HeatmapStartOfWeek): void;
  setThresholds(thresholds: HeatmapThresholds): void;
  setExcludeFolders(excludeFolders: readonly string[]): void;
  setHistoryRetentionDays(historyRetentionDays: number): void;
}

export interface DateSectionJournalPort {
  load(path: string): Promise<DateSectionJournalLoadResult>;
  createEmpty(path: string): Promise<MarkdownFileCreateResult>;
  mutate(
    path: string,
    mutation: DateSectionMutation
  ): Promise<DateSectionJournalMutationResult>;
  watch(
    path: string,
    listener: (event: MarkdownFileEvent) => void
  ): () => void;
}

export interface JournalSettings {
  readonly editable: boolean;
  readonly filePath: string | null;
  readonly viewMode: "edit" | "preview";
}

export type JournalSourceActivationResult =
  | { readonly type: "activated"; readonly path: string }
  | Exclude<DateSectionJournalLoadResult, { readonly type: "loaded" }>
  | { readonly type: "configuration-unavailable" };

export type JournalSourceCreationResult =
  | JournalSourceActivationResult
  | Exclude<MarkdownFileCreateResult, { readonly type: "created" }>;

export type DateSectionJournalRuntimeState =
  | { readonly type: "unconfigured" }
  | { readonly type: "loading"; readonly path: string }
  | {
    readonly type: "ready";
    readonly path: string;
    readonly journal: DateSectionDocument;
  }
  | { readonly type: "missing-source"; readonly path: string }
  | {
    readonly type: "invalid-source";
    readonly path: string;
    readonly diagnostics: readonly DateSectionDiagnostic[];
  }
  | { readonly type: "io-error"; readonly path: string };

export interface DateSectionJournalDraftPort {
  getState(): JournalDraftState;
  begin(target: JournalDraftTarget): void;
  update(content: string): void;
  flush(): Promise<JournalDraftState>;
  hasUnsavedDraft(): boolean;
  discardAndBegin(target: JournalDraftTarget): void;
  dispose(): Promise<void>;
  subscribe(listener: (state: JournalDraftState) => void): () => void;
}

export interface JournalWriteFailurePort {
  notify(
    reason: Extract<JournalDraftState, {
      readonly type: "failed";
    }>["reason"],
    path: string
  ): void;
}

export interface JournalDeleteConfirmationPort {
  confirm(dateKey: string, path: string): Promise<boolean>;
}

export interface TaskSourcePort {
  load(path: string): Promise<TaskSourceLoadResult>;
  create(path: string): Promise<TaskSourceCreationResult>;
  mutate(path: string, mutation: TaskMutation): Promise<TaskSourceMutationResult>;
  watch(
    path: string,
    listener: (event: MarkdownFileEvent) => void
  ): () => void;
}

export interface TaskSourceAppendConfirmationPort {
  confirm(path: string): Promise<boolean>;
}

export interface TaskDeleteConfirmationPort {
  confirm(text: string, path: string): Promise<boolean>;
}

export interface TaskWriteFailurePort {
  notify(reason: TaskSourceMutationResult["type"], path: string): void;
}

export interface TaskSettings {
  readonly editable: boolean;
  readonly filePath: string | null;
  readonly showCompleted: boolean;
  readonly recurringEditable: boolean;
  readonly recurringState: TaskRuntimeState["type"];
  readonly recurringTasks: readonly {
    readonly target: TaskTarget;
    readonly text: string;
    readonly recurrence: TaskRecurrence;
  }[];
  readonly diagnostics: readonly TaskSourceDiagnostic[];
}

export interface DailyPlanSettings {
  readonly editable: boolean;
  readonly selectedTemplateId: string | null;
  readonly templates: readonly DailyTemplate[];
}

export interface PlanSettings {
  readonly editable: boolean;
  readonly activeMode: "daily" | "weekly";
  readonly selectedDailyTemplateId: string | null;
  readonly selectedWeeklyTemplateId: string | null;
  readonly dailyTemplates: readonly DailyTemplate[];
  readonly weeklyTemplates: readonly WeeklyTemplate[];
}

export type FileEntryStatus = "ready" | "missing" | "invalid";

export interface FileEntryRuntimePort {
  getStatus(path: string): FileEntryStatus;
  now(): number;
}

export interface BannerResourcePort {
  getVaultResourceUrl(path: string): string | null;
}

export interface BannerSettings {
  readonly editable: boolean;
  readonly globalSource: BannerSource | null;
  readonly themes: readonly {
    readonly theme: ThemeId;
    readonly settings: BannerTheme;
  }[];
}

export interface FileGroupSettings {
  readonly editable: boolean;
  readonly groups: readonly {
    readonly id: string;
    readonly name: string;
    readonly entries: readonly {
      readonly id: string;
      readonly path: string;
      readonly state: FileEntryStatus;
    }[];
  }[];
  readonly undo: {
    readonly path: string;
    readonly expiresAt: number;
  } | null;
}

export type DailyPlanMutationResult =
  | { readonly type: "applied"; readonly id?: string }
  | { readonly type: "cancelled" }
  | { readonly type: "not-found" }
  | { readonly type: "blocked" }
  | { readonly type: DailyPlanMutationIssue };

export type FileGroupMutationResult =
  | { readonly type: "applied"; readonly id?: string }
  | { readonly type: "cancelled" }
  | { readonly type: "not-found" }
  | { readonly type: "blocked" }
  | { readonly type: "invalid-file" }
  | { readonly type: "undo-expired" }
  | { readonly type: FileGroupMutationIssue };

export type BannerMutationResult =
  | { readonly type: "applied" }
  | { readonly type: "blocked" }
  | { readonly type: "invalid-file" }
  | { readonly type: "invalid-url" }
  | { readonly type: "invalid-protocol" }
  | { readonly type: "invalid-position" };

export interface DailyPlanTemplateDeleteConfirmationPort {
  confirm(name: string, selected: boolean): Promise<boolean>;
}

export interface FileGroupDeleteConfirmationPort {
  confirm(name: string, entryCount: number): Promise<boolean>;
}

export type TaskRuntimeState =
  | { readonly type: "unconfigured" }
  | { readonly type: "loading"; readonly path: string }
  | {
    readonly type: "ready";
    readonly path: string;
    readonly taskSource: TaskSourceDocument;
  }
  | { readonly type: "missing-source"; readonly path: string }
  | { readonly type: "missing-region"; readonly path: string }
  | {
    readonly type: "invalid-source";
    readonly path: string;
    readonly diagnostics: readonly TaskSourceDiagnostic[];
  }
  | { readonly type: "io-error"; readonly path: string };

export type TaskInteractionState =
  | { readonly type: "idle" }
  | {
    readonly type: "editing";
    readonly path: string;
    readonly target: TaskTarget;
    readonly text: string;
  }
  | {
    readonly type: "conflict";
    readonly path: string;
    readonly draftText: string | null;
  };

export type TaskSourceActivationResult =
  | { readonly type: "activated"; readonly path: string }
  | Exclude<TaskSourceLoadResult, { readonly type: "loaded" }>
  | Exclude<
    TaskSourceMutationResult,
    { readonly type: "applied" } | { readonly type: "noop" }
  >
  | { readonly type: "append-cancelled"; readonly path: string }
  | { readonly type: "configuration-unavailable" };

export type HomepageTaskCreationResult =
  | TaskSourceActivationResult
  | Exclude<TaskSourceCreationResult, { readonly type: "created" }>;

const NOOP_SETTINGS_NAVIGATION: SettingsNavigationPort = {
  open: () => undefined
};

const NOOP_HEATMAP_TRACKING: HeatmapTrackingPort = {
  establishBaseline: () => undefined,
  recordEditorContent: () => undefined,
  refreshDate: () => undefined,
  setCountType: () => undefined,
  setDateRange: () => undefined,
  setStartOfWeek: () => undefined,
  setThresholds: () => undefined,
  setExcludeFolders: () => undefined,
  setHistoryRetentionDays: () => undefined
};

const NOOP_FILE_NAVIGATION: FileNavigationPort = {
  open: () => Promise.resolve()
};

const NOOP_DATE_SECTION_JOURNAL: DateSectionJournalPort = {
  load: (path) => Promise.resolve({ type: "missing-source", path }),
  createEmpty: (path) => Promise.resolve({ type: "invalid-path", path }),
  mutate: (path) => Promise.resolve({ type: "missing-source", path }),
  watch: () => () => undefined
};

const NOOP_JOURNAL_DRAFTS: DateSectionJournalDraftPort = {
  getState: () => ({ type: "idle" }),
  begin: () => undefined,
  update: () => undefined,
  flush: () => Promise.resolve({ type: "idle" }),
  hasUnsavedDraft: () => false,
  discardAndBegin: () => undefined,
  dispose: () => Promise.resolve(),
  subscribe: () => () => undefined
};

const NOOP_JOURNAL_WRITE_FAILURE: JournalWriteFailurePort = {
  notify: () => undefined
};

const NOOP_JOURNAL_DELETE_CONFIRMATION: JournalDeleteConfirmationPort = {
  confirm: () => Promise.resolve(false)
};

const NOOP_TASK_SOURCE: TaskSourcePort = {
  load: (path) => Promise.resolve({ type: "missing-source", path }),
  create: (path) => Promise.resolve({ type: "invalid-path", path }),
  mutate: (path) => Promise.resolve({ type: "missing-source", path }),
  watch: () => () => undefined
};

const NOOP_TASK_APPEND_CONFIRMATION: TaskSourceAppendConfirmationPort = {
  confirm: () => Promise.resolve(false)
};

const NOOP_TASK_DELETE_CONFIRMATION: TaskDeleteConfirmationPort = {
  confirm: () => Promise.resolve(false)
};

const NOOP_TASK_WRITE_FAILURE: TaskWriteFailurePort = {
  notify: () => undefined
};

const NOOP_DAILY_PLAN_DELETE_CONFIRMATION:
  DailyPlanTemplateDeleteConfirmationPort = {
  confirm: () => Promise.resolve(false)
};

const NOOP_FILE_GROUP_DELETE_CONFIRMATION:
  FileGroupDeleteConfirmationPort = {
  confirm: () => Promise.resolve(false)
};

const NOOP_LAYOUT_RESET_CONFIRMATION: LayoutResetConfirmationPort = {
  confirm: () => Promise.resolve(false)
};

const NOOP_FILE_ENTRY_RUNTIME: FileEntryRuntimePort = {
  getStatus: () => "ready",
  now: () => Date.now()
};

const NOOP_BANNER_RESOURCE: BannerResourcePort = {
  getVaultResourceUrl: () => null
};

const TASK_PAGE_SIZE = 50;
const FILE_ENTRY_PAGE_SIZE = 60;

let generatedStableIdSequence = 0;

const createStableId = (
  prefix: "daily" | "weekly" | "period" | "file-group" | "file-entry"
): string => {
  generatedStableIdSequence += 1;
  return [
    prefix,
    Date.now().toString(36),
    generatedStableIdSequence.toString(36)
  ].join("_");
};

const mapWeeklyDays = (
  mapper: (day: Weekday) => readonly PlanPeriod[]
): Record<Weekday, readonly PlanPeriod[]> => ({
  monday: mapper("monday"),
  tuesday: mapper("tuesday"),
  wednesday: mapper("wednesday"),
  thursday: mapper("thursday"),
  friday: mapper("friday"),
  saturday: mapper("saturday"),
  sunday: mapper("sunday")
});

export class HomepageApplicationFacade {
  private journalRuntimeState: DateSectionJournalRuntimeState = {
    type: "unconfigured"
  };
  private readonly journalRuntimeListeners = new Set<() => void>();
  private selectedJournalDateKey = "";
  private taskRuntimeState: TaskRuntimeState = { type: "unconfigured" };
  private taskInteractionState: TaskInteractionState = { type: "idle" };
  private taskArchiveVisible = false;
  private taskVisibleLimit = TASK_PAGE_SIZE;
  private archivedTaskVisibleLimit = TASK_PAGE_SIZE;
  private fileEntryVisibleLimit = FILE_ENTRY_PAGE_SIZE;
  private readonly taskRuntimeListeners = new Set<() => void>();
  private requestRecurringTaskRefresh = (): void => undefined;
  private readonly fileEntryRuntimeListeners = new Set<() => void>();
  private readonly bannerRuntimeListeners = new Set<() => void>();
  private removedFileEntry: {
    readonly groupId: string;
    readonly entry: FileEntry;
    readonly index: number;
    readonly expiresAt: number;
  } | null = null;

  public constructor(
    private readonly workspace: HomepageWorkspacePort,
    private readonly localization: LocalizationService,
    private readonly store: AppStore,
    private readonly recovery: HomepageDataRecoveryPort,
    private readonly resetConfirmation: ResetConfirmationPort,
    private readonly recoveryFailure: RecoveryFailurePort,
    private readonly settingsNavigation: SettingsNavigationPort =
      NOOP_SETTINGS_NAVIGATION,
    private readonly heatmapTracking: HeatmapTrackingPort =
      NOOP_HEATMAP_TRACKING,
    private readonly fileNavigation: FileNavigationPort =
      NOOP_FILE_NAVIGATION,
    private readonly dateSectionJournal: DateSectionJournalPort =
      NOOP_DATE_SECTION_JOURNAL,
    private readonly journalDrafts: DateSectionJournalDraftPort =
      NOOP_JOURNAL_DRAFTS,
    private readonly journalWriteFailure: JournalWriteFailurePort =
      NOOP_JOURNAL_WRITE_FAILURE,
    private readonly journalDeleteConfirmation: JournalDeleteConfirmationPort =
      NOOP_JOURNAL_DELETE_CONFIRMATION,
    private readonly taskSource: TaskSourcePort = NOOP_TASK_SOURCE,
    private readonly taskAppendConfirmation: TaskSourceAppendConfirmationPort =
      NOOP_TASK_APPEND_CONFIRMATION,
    private readonly taskDeleteConfirmation: TaskDeleteConfirmationPort =
      NOOP_TASK_DELETE_CONFIRMATION,
    private readonly taskWriteFailure: TaskWriteFailurePort =
      NOOP_TASK_WRITE_FAILURE,
    private readonly dailyPlanDeleteConfirmation:
      DailyPlanTemplateDeleteConfirmationPort =
      NOOP_DAILY_PLAN_DELETE_CONFIRMATION,
    private readonly fileGroupDeleteConfirmation:
      FileGroupDeleteConfirmationPort =
      NOOP_FILE_GROUP_DELETE_CONFIRMATION,
    private readonly fileEntryRuntime: FileEntryRuntimePort =
      NOOP_FILE_ENTRY_RUNTIME,
    private readonly bannerResource: BannerResourcePort =
      NOOP_BANNER_RESOURCE,
    private readonly layoutResetConfirmation: LayoutResetConfirmationPort =
      NOOP_LAYOUT_RESET_CONFIRMATION
  ) {}

  public getSnapshot(): HomepageSnapshot {
    const state = this.store.getState();
    const localTime = this.store.getLocalTime();
    const messages = this.localization.getMessages();
    if (state.mode === "loading") {
      return {
        title: messages.homepageTitle,
        description: messages.homepageLoadingDescription,
        status: "loading",
        localTime,
        shell: null,
        diagnostics: [],
        recoveryActions: null
      };
    }
    if (state.mode === "safe") {
      return {
        title: messages.homepageTitle,
        description: messages.homepageSafeModeDescription,
        status: "safe-mode",
        localTime,
        shell: null,
        diagnostics: state.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          message: messages[diagnostic.messageKey],
          ...(diagnostic.details === undefined ? {} : { details: diagnostic.details }),
          relatedPaths: diagnostic.relatedPaths,
          suggestedAction: messages[diagnostic.suggestedActionKey]
        })),
        recoveryActions: {
          reloadLabel: messages.reloadPluginData,
          resetLabel: messages.resetPluginData,
          openDataManagementLabel: messages.openDataManagement
        }
      };
    }

    return {
      title: messages.homepageTitle,
      description: messages.homepageDescription,
      status: "ready",
      localTime,
      shell: createHomepageShellViewModel(
        state.data,
        localTime,
        messages,
        this.localization.getResolvedLocale(),
        {
          runtime: this.journalRuntimeState,
          selectedDateKey: this.getSelectedJournalDateKey(),
          draft: this.journalDrafts.getState()
        },
        this.taskRuntimeState,
        {
          state: this.taskInteractionState,
          archiveVisible: this.taskArchiveVisible,
          visibleLimit: this.taskVisibleLimit,
          archivedVisibleLimit: this.archivedTaskVisibleLimit
        },
        {
          getStatus: (path) => this.fileEntryRuntime.getStatus(path),
          visibleLimit: this.fileEntryVisibleLimit
        },
        {
          getVaultResourceUrl: (path) =>
            this.bannerResource.getVaultResourceUrl(path)
        }
      ),
      diagnostics: [],
      recoveryActions: null
    };
  }

  public openHomepage(): Promise<void> {
    return this.workspace.openHomepage();
  }

  public startWorkspaceLifecycle(): () => void {
    let disposed = false;
    let layoutReady = false;
    let opening: Promise<void> | null = null;

    const evaluate = (startup: boolean): void => {
      if (disposed || !layoutReady || opening !== null) {
        return;
      }

      const state = this.store.getState();
      if (state.mode !== "ready") {
        return;
      }

      const shouldOpenForStartup = startup && state.data.startup.openOnStartup;
      const shouldOpenForEmptyWorkspace =
        state.data.startup.openWhenWorkspaceEmpty
        && !this.workspace.hasCentralContentPage();
      if (!shouldOpenForStartup && !shouldOpenForEmptyWorkspace) {
        return;
      }
      if (!startup && this.workspace.hasHomepage()) {
        return;
      }

      const operation = this.workspace.openHomepage();
      opening = operation;
      void operation
        .catch(() => undefined)
        .finally(() => {
          if (opening === operation) {
            opening = null;
          }
        });
    };

    const unsubscribeLayout = this.workspace.subscribeLayoutChange(() => {
      evaluate(false);
    });
    const unsubscribeStore = this.store.subscribeState(() => {
      evaluate(false);
    });
    this.workspace.onLayoutReady(() => {
      if (disposed) {
        return;
      }
      layoutReady = true;
      evaluate(true);
    });

    return () => {
      disposed = true;
      unsubscribeLayout();
      unsubscribeStore();
    };
  }

  public subscribeHomepageState(listener: () => void): () => void {
    const unsubscribeStore = this.store.subscribeState(listener);
    const unsubscribeLocale = this.localization.subscribe(listener);
    const unsubscribeJournal = this.subscribeJournalRuntime(listener);
    const unsubscribeTasks = this.subscribeTaskRuntime(listener);
    const unsubscribeFileEntries = this.subscribeFileEntryRuntime(listener);
    const unsubscribeBanner = this.subscribeBannerRuntime(listener);
    return () => {
      unsubscribeStore();
      unsubscribeLocale();
      unsubscribeJournal();
      unsubscribeTasks();
      unsubscribeFileEntries();
      unsubscribeBanner();
    };
  }

  public getDateSectionJournalRuntimeState():
  DateSectionJournalRuntimeState {
    return structuredClone(this.journalRuntimeState);
  }

  public startDateSectionJournalLifecycle(): () => void {
    let disposed = false;
    let configuredSignature = "";
    let watchedPath = "";
    let loadGeneration = 0;
    let stopWatching = (): void => undefined;
    const stopDraftListening = this.journalDrafts.subscribe((state) => {
      if (state.type === "failed") {
        this.journalWriteFailure.notify(state.reason, state.target.path);
      }
      if (state.type === "conflict" || state.type === "failed") {
        this.notifyJournalRuntime();
      }
    });

    const loadPath = (path: string, announceLoading: boolean): void => {
      const generation = ++loadGeneration;
      if (announceLoading) {
        this.setJournalRuntimeState({ type: "loading", path });
      }
      void this.dateSectionJournal.load(path).then((result) => {
        if (
          disposed
          || generation !== loadGeneration
          || path !== watchedPath
        ) {
          return;
        }
        switch (result.type) {
          case "loaded": {
            const previousState = this.journalRuntimeState;
            const selectedDateKey = this.getSelectedJournalDateKey();
            const previousSection = previousState.type === "ready"
              ? previousState.journal.sections.find(
                (section) => section.dateKey === selectedDateKey
              )
              : undefined;
            const nextSection = result.journal.sections.find(
              (section) => section.dateKey === selectedDateKey
            );
            const hadUnsavedDraft = this.journalDrafts.hasUnsavedDraft();
            const draft = this.journalDrafts.getState();
            const loadedSectionMatchesDraft = nextSection !== undefined
              && draft.type !== "idle"
              && draft.target.path === result.path
              && draft.target.dateKey === selectedDateKey
              && draft.target.content === nextSection.content;
            const selectedSectionPresenceChanged = (
              previousSection === undefined
            ) !== (nextSection === undefined);
            this.journalRuntimeState = {
              type: "ready",
              path: result.path,
              journal: result.journal
            };
            this.syncJournalDraft();
            if (
              announceLoading
              || previousState.type !== "ready"
              || previousState.path !== result.path
              || (
                !hadUnsavedDraft
                && previousSection?.revision !== nextSection?.revision
                && (
                  !loadedSectionMatchesDraft
                  || selectedSectionPresenceChanged
                )
              )
            ) {
              this.notifyJournalRuntime();
            }
            break;
          }
          case "invalid-source":
            this.setJournalRuntimeState(result);
            break;
          case "missing-source":
            this.setJournalRuntimeState(result);
            break;
          case "io-error":
            this.setJournalRuntimeState({
              type: "io-error",
              path: result.path
            });
            break;
        }
      });
    };

    const bindConfiguration = (): void => {
      if (disposed) {
        return;
      }
      const state = this.store.getState();
      const path = state.mode === "ready"
        && this.isModuleVisible(state.data, "journal")
        ? state.data.journal.filePath
        : null;
      const signature = path === null ? "unconfigured" : `path:${path}`;
      if (signature === configuredSignature) {
        return;
      }
      configuredSignature = signature;
      loadGeneration += 1;
      stopWatching();
      stopWatching = () => undefined;
      watchedPath = path ?? "";
      if (path === null) {
        this.setJournalRuntimeState({ type: "unconfigured" });
        return;
      }
      stopWatching = this.dateSectionJournal.watch(path, (event) => {
        if (disposed || event.path !== watchedPath) {
          return;
        }
        if (event.type === "missing") {
          loadGeneration += 1;
          this.setJournalRuntimeState({
            type: "missing-source",
            path: event.path
          });
          return;
        }
        loadPath(event.path, event.type === "restored");
      });
      loadPath(path, true);
    };

    const unsubscribeStore = this.store.subscribeState(bindConfiguration);
    bindConfiguration();
    return () => {
      disposed = true;
      loadGeneration += 1;
      unsubscribeStore();
      stopWatching();
      stopDraftListening();
    };
  }

  public startTaskSourceLifecycle(): () => void {
    let disposed = false;
    let configuredPath = "";
    let generation = 0;
    let periodSignature = "";
    let refreshFailureEpisode = "";
    let stopWatching = (): void => undefined;

    const setRefreshFailure = (
      result: TaskSourceMutationResult,
      path: string
    ): void => {
      const episode = `${path}:${result.type}`;
      if (episode !== refreshFailureEpisode) {
        refreshFailureEpisode = episode;
        this.taskWriteFailure.notify(result.type, path);
      }
      if (result.type === "missing-source") {
        this.setTaskRuntimeState(result);
      } else if (result.type === "missing-region") {
        this.setTaskRuntimeState({ type: "missing-region", path });
      } else if (result.type === "invalid-source") {
        this.setTaskRuntimeState({
          type: "invalid-source",
          path,
          diagnostics: result.diagnostics
        });
      } else if (result.type === "io-error") {
        this.setTaskRuntimeState({ type: "io-error", path });
      }
    };

    const loadPath = (path: string, announceLoading: boolean): void => {
      const currentGeneration = ++generation;
      if (announceLoading) {
        this.setTaskRuntimeState({ type: "loading", path });
      }
      void this.taskSource.load(path).then(async (result) => {
        if (
          disposed
          || currentGeneration !== generation
          || configuredPath !== path
        ) {
          return;
        }
        if (result.type !== "loaded") {
          this.setTaskRuntimeState(result);
          const episode = `${path}:${result.type}`;
          if (episode !== refreshFailureEpisode) {
            refreshFailureEpisode = episode;
            this.taskWriteFailure.notify(result.type, path);
          }
          return;
        }
        const periodKeys = this.getCurrentTaskPeriodKeys();
        if (periodKeys === null) {
          this.setTaskRuntimeState({
            type: "ready",
            path: result.path,
            taskSource: result.taskSource
          });
          return;
        }
        const refreshed = await this.taskSource.mutate(path, {
          type: "refresh-recurring",
          periodKeys
        });
        if (
          disposed
          || currentGeneration !== generation
          || configuredPath !== path
        ) {
          return;
        }
        if (refreshed.type !== "applied" && refreshed.type !== "noop") {
          setRefreshFailure(refreshed, path);
          return;
        }
        const latest = refreshed.type === "applied"
          ? await this.taskSource.load(path)
          : result;
        if (
          disposed
          || currentGeneration !== generation
          || configuredPath !== path
        ) {
          return;
        }
        refreshFailureEpisode = "";
        this.setTaskRuntimeState(latest.type === "loaded"
          ? {
            type: "ready",
            path: latest.path,
            taskSource: latest.taskSource
          }
          : latest);
      });
    };

    const bindConfiguration = (): void => {
      const state = this.store.getState();
      const path = state.mode === "ready"
        ? state.data.tasks.filePath
        : null;
      const nextPath = path ?? "";
      if (nextPath === configuredPath) {
        const periodKeys = this.getCurrentTaskPeriodKeys();
        const nextSignature = periodKeys === null
          ? ""
          : `${periodKeys.daily}|${periodKeys.weekly}`;
        if (path !== null && nextSignature !== periodSignature) {
          periodSignature = nextSignature;
          loadPath(path, false);
        }
        return;
      }
      configuredPath = nextPath;
      const periodKeys = this.getCurrentTaskPeriodKeys();
      periodSignature = periodKeys === null
        ? ""
        : `${periodKeys.daily}|${periodKeys.weekly}`;
      refreshFailureEpisode = "";
      this.taskInteractionState = { type: "idle" };
      this.taskArchiveVisible = false;
      this.taskVisibleLimit = TASK_PAGE_SIZE;
      this.archivedTaskVisibleLimit = TASK_PAGE_SIZE;
      generation += 1;
      stopWatching();
      stopWatching = () => undefined;
      if (path === null) {
        this.setTaskRuntimeState({ type: "unconfigured" });
        return;
      }
      stopWatching = this.taskSource.watch(path, (event) => {
        if (disposed || event.path !== configuredPath) {
          return;
        }
        if (event.type === "missing") {
          generation += 1;
          this.setTaskRuntimeState({
            type: "missing-source",
            path: event.path
          });
          return;
        }
        loadPath(event.path, event.type === "restored");
      });
      loadPath(path, true);
    };

    const unsubscribe = this.store.subscribeState(bindConfiguration);
    const requestRefresh = (): void => {
      if (!disposed && configuredPath !== "") {
        loadPath(configuredPath, false);
      }
    };
    this.requestRecurringTaskRefresh = requestRefresh;
    bindConfiguration();
    return () => {
      disposed = true;
      generation += 1;
      unsubscribe();
      stopWatching();
      if (this.requestRecurringTaskRefresh === requestRefresh) {
        this.requestRecurringTaskRefresh = () => undefined;
      }
    };
  }

  public refreshRecurringTasks(): void {
    this.requestRecurringTaskRefresh();
  }

  public getTaskSettings(): TaskSettings {
    const state = this.store.getState();
    const recurringTasks = this.taskRuntimeState.type === "ready"
      ? this.taskRuntimeState.taskSource.tasks.flatMap((task) =>
        task.section === "active" && task.recurrence !== null
          ? [{
            target: task.target,
            text: task.text,
            recurrence: task.recurrence
          }]
          : []
      )
      : [];
    const diagnostics = this.taskRuntimeState.type === "invalid-source"
      ? this.taskRuntimeState.diagnostics
      : [];
    return state.mode === "ready"
      ? {
        editable: true,
        filePath: state.data.tasks.filePath,
        showCompleted: state.data.tasks.showCompleted,
        recurringEditable: this.taskRuntimeState.type === "ready",
        recurringState: this.taskRuntimeState.type,
        recurringTasks,
        diagnostics
      }
      : {
        editable: false,
        filePath: null,
        showCompleted: true,
        recurringEditable: false,
        recurringState: "unconfigured",
        recurringTasks: [],
        diagnostics: []
      };
  }

  public subscribeTaskSettings(listener: () => void): () => void {
    return this.subscribeTaskRuntime(listener);
  }

  public setShowCompletedTasks(showCompleted: boolean): void {
    this.store.transact("change completed task visibility", "normal", (data) => ({
      ...data,
      tasks: {
        ...data.tasks,
        showCompleted
      }
    }));
  }

  public async activateTaskSource(
    path: string
  ): Promise<TaskSourceActivationResult> {
    if (this.store.getState().mode !== "ready") {
      return { type: "configuration-unavailable" };
    }
    let loaded = await this.taskSource.load(path);
    if (loaded.type === "missing-region") {
      if (!await this.taskAppendConfirmation.confirm(loaded.path)) {
        return { type: "append-cancelled", path: loaded.path };
      }
      const appended = await this.taskSource.mutate(loaded.path, {
        type: "append-region"
      });
      if (appended.type !== "applied" && appended.type !== "noop") {
        return appended;
      }
      loaded = await this.taskSource.load(loaded.path);
    }
    if (loaded.type !== "loaded") {
      return loaded;
    }
    const result = this.store.transact(
      "activate task source",
      "immediate",
      (data) => ({
        ...data,
        tasks: {
          ...data.tasks,
          filePath: loaded.path
        }
      })
    );
    return result.type === "applied"
      ? { type: "activated", path: loaded.path }
      : { type: "configuration-unavailable" };
  }

  public async createTaskSource(
    path: string
  ): Promise<HomepageTaskCreationResult> {
    if (this.store.getState().mode !== "ready") {
      return { type: "configuration-unavailable" };
    }
    const created = await this.taskSource.create(path);
    return created.type === "created"
      ? this.activateTaskSource(created.path)
      : created;
  }

  public addTask(text: string): Promise<TaskSourceMutationResult> {
    return this.mutateTask({ type: "add", text });
  }

  public addRecurringTask(
    text: string,
    recurrence: TaskRecurrence
  ): Promise<TaskSourceMutationResult> {
    const periodKeys = this.getCurrentTaskPeriodKeys();
    return periodKeys === null
      ? Promise.resolve({ type: "invalid-task", reason: "invalid-period" })
      : this.mutateTask({
        type: "add-recurring",
        text,
        recurrence,
        period: taskPeriodKeyFor(recurrence, periodKeys)
      });
  }

  public editTask(
    target: TaskTarget,
    text: string
  ): Promise<TaskSourceMutationResult> {
    return this.mutateTask({ type: "edit", target, text }, text);
  }

  public setTaskCompleted(
    target: TaskTarget,
    completed: boolean
  ): Promise<TaskSourceMutationResult> {
    return this.mutateTask({
      type: "set-completed",
      target,
      completed
    });
  }

  public setRecurringTaskType(
    target: TaskTarget,
    recurrence: TaskRecurrence
  ): Promise<TaskSourceMutationResult> {
    const periodKeys = this.getCurrentTaskPeriodKeys();
    return periodKeys === null
      ? Promise.resolve({ type: "invalid-task", reason: "invalid-period" })
      : this.mutateTask({
        type: "set-recurrence",
        target,
        recurrence,
        period: taskPeriodKeyFor(recurrence, periodKeys)
      });
  }

  public updateRecurringTask(
    target: TaskTarget,
    text: string,
    recurrence: TaskRecurrence
  ): Promise<TaskSourceMutationResult> {
    const periodKeys = this.getCurrentTaskPeriodKeys();
    return periodKeys === null
      ? Promise.resolve({ type: "invalid-task", reason: "invalid-period" })
      : this.mutateTask({
        type: "update-recurring",
        target,
        text,
        recurrence,
        period: taskPeriodKeyFor(recurrence, periodKeys)
      }, text);
  }

  public async deleteTask(
    target: TaskTarget,
    text: string
  ): Promise<TaskSourceMutationResult> {
    const runtime = this.taskRuntimeState;
    if (
      runtime.type !== "ready"
      || !await this.taskDeleteConfirmation.confirm(text, runtime.path)
    ) {
      return { type: "noop" };
    }
    return this.mutateTask({ type: "delete", target });
  }

  public beginTaskEdit(target: TaskTarget, text: string): void {
    const runtime = this.taskRuntimeState;
    if (runtime.type !== "ready") {
      return;
    }
    this.taskInteractionState = {
      type: "editing",
      path: runtime.path,
      target,
      text
    };
    this.notifyTaskRuntime();
  }

  public updateTaskEditDraft(text: string): void {
    const state = this.taskInteractionState;
    if (state.type !== "editing") {
      return;
    }
    this.taskInteractionState = {
      ...state,
      text
    };
  }

  public cancelTaskEdit(): void {
    if (this.taskInteractionState.type === "idle") {
      return;
    }
    this.taskInteractionState = { type: "idle" };
    this.notifyTaskRuntime();
  }

  public saveTaskEdit(): Promise<TaskSourceMutationResult> {
    const state = this.taskInteractionState;
    return state.type === "editing"
      ? this.mutateTask({
        type: "edit",
        target: state.target,
        text: state.text
      }, state.text)
      : Promise.resolve({ type: "noop" });
  }

  public archiveTask(target: TaskTarget): Promise<TaskSourceMutationResult> {
    return this.mutateTask({ type: "archive", target }, null);
  }

  public archiveCompletedTasks(): Promise<TaskSourceMutationResult> {
    const runtime = this.taskRuntimeState;
    if (runtime.type !== "ready") {
      return Promise.resolve(runtime.type === "missing-source"
        ? runtime
        : { type: "missing-region" });
    }
    const targets = runtime.taskSource.tasks
      .filter(
        (task) =>
          task.section === "active"
          && task.completed
          && task.recurrence === null
      )
      .map((task) => task.target);
    return this.mutateTask({
      type: "archive-completed",
      targets
    }, null);
  }

  public unarchiveTask(target: TaskTarget): Promise<TaskSourceMutationResult> {
    return this.mutateTask({ type: "unarchive", target }, null);
  }

  public setTaskArchiveVisible(visible: boolean): void {
    if (this.taskArchiveVisible === visible) {
      return;
    }
    this.taskArchiveVisible = visible;
    this.notifyTaskRuntime();
  }

  public showMoreTasks(): void {
    this.taskVisibleLimit += TASK_PAGE_SIZE;
    this.notifyTaskRuntime();
  }

  public showMoreArchivedTasks(): void {
    this.archivedTaskVisibleLimit += TASK_PAGE_SIZE;
    this.notifyTaskRuntime();
  }

  public async reloadTaskSource(): Promise<void> {
    const runtime = this.taskRuntimeState;
    if (runtime.type === "unconfigured") {
      return;
    }
    const path = runtime.path;
    this.taskInteractionState = { type: "idle" };
    const loaded = await this.taskSource.load(path);
    this.setTaskRuntimeState(loaded.type === "loaded"
      ? {
        type: "ready",
        path: loaded.path,
        taskSource: loaded.taskSource
      }
      : loaded);
  }

  public getDailyPlanSettings(): DailyPlanSettings {
    const state = this.store.getState();
    return state.mode === "ready"
      ? {
        editable: true,
        selectedTemplateId: state.data.plans.selectedDailyTemplateId,
        templates: state.data.plans.dailyTemplates
      }
      : {
        editable: false,
        selectedTemplateId: null,
        templates: []
      };
  }

  public getPlanSettings(): PlanSettings {
    const state = this.store.getState();
    return state.mode === "ready"
      ? {
        editable: true,
        activeMode: state.data.plans.activeMode,
        selectedDailyTemplateId:
          state.data.plans.selectedDailyTemplateId,
        selectedWeeklyTemplateId:
          state.data.plans.selectedWeeklyTemplateId,
        dailyTemplates: state.data.plans.dailyTemplates,
        weeklyTemplates: state.data.plans.weeklyTemplates
      }
      : {
        editable: false,
        activeMode: "daily",
        selectedDailyTemplateId: null,
        selectedWeeklyTemplateId: null,
        dailyTemplates: [],
        weeklyTemplates: []
      };
  }

  public setPlanMode(mode: "daily" | "weekly"): DailyPlanMutationResult {
    const result = this.store.transact(
      "change plan mode",
      "immediate",
      (data) => ({
        ...data,
        plans: {
          ...data.plans,
          activeMode: mode
        }
      })
    );
    return result.type === "applied"
      ? { type: "applied" }
      : { type: "blocked" };
  }

  public createWeeklyPlanTemplate(name: string): DailyPlanMutationResult {
    const issue = validateDailyPlanName(name);
    if (issue !== null) {
      return { type: issue };
    }
    const id = createStableId("weekly");
    const days = mapWeeklyDays(() => []);
    const result = this.store.transact(
      "create weekly plan template",
      "immediate",
      (data) => ({
        ...data,
        plans: {
          ...data.plans,
          weeklyTemplates: [
            ...data.plans.weeklyTemplates,
            {
              id,
              name: normalizePlanName(name),
              days
            }
          ]
        }
      })
    );
    return result.type === "applied"
      ? { type: "applied", id }
      : { type: "blocked" };
  }

  public copyWeeklyPlanTemplate(
    templateId: string,
    name: string
  ): DailyPlanMutationResult {
    const state = this.store.getState();
    if (state.mode !== "ready") {
      return { type: "blocked" };
    }
    const template = state.data.plans.weeklyTemplates.find(
      (candidate) => candidate.id === templateId
    );
    const issue = validateDailyPlanName(name);
    if (template === undefined) {
      return { type: "not-found" };
    }
    if (issue !== null) {
      return { type: issue };
    }
    const id = createStableId("weekly");
    const copy: WeeklyTemplate = {
      id,
      name: normalizePlanName(name),
      days: mapWeeklyDays((day) =>
        template.days[day].map((period) => ({
          ...period,
          id: createStableId("period")
        }))
      )
    };
    const result = this.store.transact(
      "copy weekly plan template",
      "immediate",
      (data) => ({
        ...data,
        plans: {
          ...data.plans,
          weeklyTemplates: [...data.plans.weeklyTemplates, copy]
        }
      })
    );
    return result.type === "applied"
      ? { type: "applied", id }
      : { type: "blocked" };
  }

  public renameWeeklyPlanTemplate(
    templateId: string,
    name: string
  ): DailyPlanMutationResult {
    const issue = validateDailyPlanName(name);
    if (issue !== null) {
      return { type: issue };
    }
    const state = this.store.getState();
    if (
      state.mode !== "ready"
      || !state.data.plans.weeklyTemplates.some(
        (template) => template.id === templateId
      )
    ) {
      return state.mode === "ready"
        ? { type: "not-found" }
        : { type: "blocked" };
    }
    const result = this.store.transact(
      "rename weekly plan template",
      "normal",
      (data) => ({
        ...data,
        plans: {
          ...data.plans,
          weeklyTemplates: data.plans.weeklyTemplates.map((template) =>
            template.id === templateId
              ? {
                ...template,
                name: normalizePlanName(name)
              }
              : template
          )
        }
      })
    );
    return result.type === "applied"
      ? { type: "applied", id: templateId }
      : { type: "blocked" };
  }

  public selectWeeklyPlanTemplate(
    templateId: string | null
  ): DailyPlanMutationResult {
    const state = this.store.getState();
    if (state.mode !== "ready") {
      return { type: "blocked" };
    }
    if (
      templateId !== null
      && !state.data.plans.weeklyTemplates.some(
        (template) => template.id === templateId
      )
    ) {
      return { type: "not-found" };
    }
    const result = this.store.transact(
      "select weekly plan template",
      "immediate",
      (data) => ({
        ...data,
        plans: {
          ...data.plans,
          activeMode: "weekly",
          selectedWeeklyTemplateId: templateId
        }
      })
    );
    return result.type === "applied"
      ? {
        type: "applied",
        ...(templateId === null ? {} : { id: templateId })
      }
      : { type: "blocked" };
  }

  public async deleteWeeklyPlanTemplate(
    templateId: string
  ): Promise<DailyPlanMutationResult> {
    const state = this.store.getState();
    if (state.mode !== "ready") {
      return { type: "blocked" };
    }
    const template = state.data.plans.weeklyTemplates.find(
      (candidate) => candidate.id === templateId
    );
    if (template === undefined) {
      return { type: "not-found" };
    }
    const selected = state.data.plans.selectedWeeklyTemplateId === templateId;
    if (!await this.dailyPlanDeleteConfirmation.confirm(
      template.name,
      selected
    )) {
      return { type: "cancelled" };
    }
    const result = this.store.transact(
      "delete weekly plan template",
      "immediate",
      (data) => ({
        ...data,
        plans: {
          ...data.plans,
          selectedWeeklyTemplateId:
            data.plans.selectedWeeklyTemplateId === templateId
              ? null
              : data.plans.selectedWeeklyTemplateId,
          weeklyTemplates: data.plans.weeklyTemplates.filter(
            (candidate) => candidate.id !== templateId
          )
        }
      })
    );
    return result.type === "applied"
      ? { type: "applied", id: templateId }
      : { type: "blocked" };
  }

  public addWeeklyPlanPeriod(
    templateId: string,
    day: Weekday,
    period: Omit<PlanPeriod, "id">
  ): DailyPlanMutationResult {
    return this.changeWeeklyPlanPeriods(
      templateId,
      day,
      (periods) => [...periods, {
        ...period,
        id: createStableId("period")
      }],
      "add weekly plan period"
    );
  }

  public updateWeeklyPlanPeriod(
    templateId: string,
    day: Weekday,
    periodId: string,
    update: Omit<PlanPeriod, "id">
  ): DailyPlanMutationResult {
    return this.changeWeeklyPlanPeriods(
      templateId,
      day,
      (periods) => periods.map((period) =>
        period.id === periodId ? { ...update, id: period.id } : period
      ),
      "update weekly plan period",
      periodId
    );
  }

  public deleteWeeklyPlanPeriod(
    templateId: string,
    day: Weekday,
    periodId: string
  ): DailyPlanMutationResult {
    return this.changeWeeklyPlanPeriods(
      templateId,
      day,
      (periods) => periods.filter((period) => period.id !== periodId),
      "delete weekly plan period",
      periodId
    );
  }

  public moveWeeklyPlanPeriod(
    templateId: string,
    day: Weekday,
    periodId: string,
    offset: -1 | 1
  ): DailyPlanMutationResult {
    return this.changeWeeklyPlanPeriods(
      templateId,
      day,
      (periods) => {
        const next = [...periods];
        const index = next.findIndex((period) => period.id === periodId);
        const target = index + offset;
        if (index < 0 || target < 0 || target >= next.length) {
          return next;
        }
        const current = next[index];
        const adjacent = next[target];
        if (current !== undefined && adjacent !== undefined) {
          next[index] = adjacent;
          next[target] = current;
        }
        return next;
      },
      "reorder weekly plan period",
      periodId
    );
  }

  public createDailyPlanTemplate(
    name: string
  ): DailyPlanMutationResult {
    const issue = validateDailyPlanName(name);
    if (issue !== null) {
      return { type: issue };
    }
    const id = createStableId("daily");
    const result = this.store.transact(
      "create daily plan template",
      "immediate",
      (data) => ({
        ...data,
        plans: {
          ...data.plans,
          dailyTemplates: [
            ...data.plans.dailyTemplates,
            {
              id,
              name: normalizePlanName(name),
              periods: []
            }
          ]
        }
      })
    );
    return result.type === "applied"
      ? { type: "applied", id }
      : { type: "blocked" };
  }

  public copyDailyPlanTemplate(
    templateId: string,
    name: string
  ): DailyPlanMutationResult {
    const state = this.store.getState();
    if (state.mode !== "ready") {
      return { type: "blocked" };
    }
    const template = state.data.plans.dailyTemplates.find(
      (candidate) => candidate.id === templateId
    );
    if (template === undefined) {
      return { type: "not-found" };
    }
    const issue = validateDailyPlanName(name);
    if (issue !== null) {
      return { type: issue };
    }
    const id = createStableId("daily");
    const copy: DailyTemplate = {
      id,
      name: normalizePlanName(name),
      periods: template.periods.map((period) => ({
        ...period,
        id: createStableId("period")
      }))
    };
    const result = this.store.transact(
      "copy daily plan template",
      "immediate",
      (data) => ({
        ...data,
        plans: {
          ...data.plans,
          dailyTemplates: [...data.plans.dailyTemplates, copy]
        }
      })
    );
    return result.type === "applied"
      ? { type: "applied", id }
      : { type: "blocked" };
  }

  public renameDailyPlanTemplate(
    templateId: string,
    name: string
  ): DailyPlanMutationResult {
    const issue = validateDailyPlanName(name);
    if (issue !== null) {
      return { type: issue };
    }
    const state = this.store.getState();
    if (
      state.mode !== "ready"
      || !state.data.plans.dailyTemplates.some(
        (template) => template.id === templateId
      )
    ) {
      return state.mode === "ready"
        ? { type: "not-found" }
        : { type: "blocked" };
    }
    const result = this.store.transact(
      "rename daily plan template",
      "normal",
      (data) => ({
        ...data,
        plans: {
          ...data.plans,
          dailyTemplates: data.plans.dailyTemplates.map((template) =>
            template.id === templateId
              ? normalizeDailyTemplate({
                ...template,
                name
              })
              : template
          )
        }
      })
    );
    return result.type === "applied"
      ? { type: "applied", id: templateId }
      : { type: "blocked" };
  }

  public selectDailyPlanTemplate(
    templateId: string | null
  ): DailyPlanMutationResult {
    const state = this.store.getState();
    if (state.mode !== "ready") {
      return { type: "blocked" };
    }
    if (
      templateId !== null
      && !state.data.plans.dailyTemplates.some(
        (template) => template.id === templateId
      )
    ) {
      return { type: "not-found" };
    }
    const result = this.store.transact(
      "select daily plan template",
      "immediate",
      (data) => ({
        ...data,
        plans: {
          ...data.plans,
          activeMode: "daily",
          selectedDailyTemplateId: templateId
        }
      })
    );
    return result.type === "applied"
      ? {
        type: "applied",
        ...(templateId === null ? {} : { id: templateId })
      }
      : { type: "blocked" };
  }

  public async deleteDailyPlanTemplate(
    templateId: string
  ): Promise<DailyPlanMutationResult> {
    const state = this.store.getState();
    if (state.mode !== "ready") {
      return { type: "blocked" };
    }
    const template = state.data.plans.dailyTemplates.find(
      (candidate) => candidate.id === templateId
    );
    if (template === undefined) {
      return { type: "not-found" };
    }
    const selected = state.data.plans.selectedDailyTemplateId === templateId;
    if (!await this.dailyPlanDeleteConfirmation.confirm(
      template.name,
      selected
    )) {
      return { type: "cancelled" };
    }
    const result = this.store.transact(
      "delete daily plan template",
      "immediate",
      (data) => ({
        ...data,
        plans: {
          ...data.plans,
          selectedDailyTemplateId:
            data.plans.selectedDailyTemplateId === templateId
              ? null
              : data.plans.selectedDailyTemplateId,
          dailyTemplates: data.plans.dailyTemplates.filter(
            (candidate) => candidate.id !== templateId
          )
        }
      })
    );
    return result.type === "applied"
      ? { type: "applied", id: templateId }
      : { type: "blocked" };
  }

  public addDailyPlanPeriod(
    templateId: string,
    period: Omit<PlanPeriod, "id">
  ): DailyPlanMutationResult {
    return this.changeDailyPlanPeriods(
      templateId,
      (periods) => [
        ...periods,
        {
          ...period,
          id: createStableId("period")
        }
      ],
      "add daily plan period"
    );
  }

  public updateDailyPlanPeriod(
    templateId: string,
    periodId: string,
    update: Omit<PlanPeriod, "id">
  ): DailyPlanMutationResult {
    return this.changeDailyPlanPeriods(
      templateId,
      (periods) => periods.map((period) =>
        period.id === periodId
          ? {
            ...update,
            id: period.id
          }
          : period
      ),
      "update daily plan period",
      periodId
    );
  }

  public deleteDailyPlanPeriod(
    templateId: string,
    periodId: string
  ): DailyPlanMutationResult {
    return this.changeDailyPlanPeriods(
      templateId,
      (periods) => periods.filter((period) => period.id !== periodId),
      "delete daily plan period",
      periodId
    );
  }

  public moveDailyPlanPeriod(
    templateId: string,
    periodId: string,
    offset: -1 | 1
  ): DailyPlanMutationResult {
    return this.changeDailyPlanPeriods(
      templateId,
      (periods) => {
        const next = [...periods];
        const index = next.findIndex((period) => period.id === periodId);
        const target = index + offset;
        if (index < 0 || target < 0 || target >= next.length) {
          return next;
        }
        const current = next[index];
        const adjacent = next[target];
        if (current === undefined || adjacent === undefined) {
          return next;
        }
        next[index] = adjacent;
        next[target] = current;
        return next;
      },
      "reorder daily plan period",
      periodId
    );
  }

  public getInterfaceAndStartupSettings(): InterfaceAndStartupSettings {
    const state = this.store.getState();
    const messages = this.localization.getMessages();
    if (state.mode !== "ready") {
      return {
        editable: false,
        locale: "auto",
        openOnStartup: false,
        openWhenWorkspaceEmpty: true,
        bannerTitle: messages.homepageBannerTitle,
        bannerSubtitle: messages.homepageBannerSubtitle
      };
    }

    return {
      editable: true,
      locale: state.data.locale,
      openOnStartup: state.data.startup.openOnStartup,
      openWhenWorkspaceEmpty: state.data.startup.openWhenWorkspaceEmpty,
      bannerTitle: state.data.banner.title
        ?? messages.homepageBannerTitle,
      bannerSubtitle: state.data.banner.subtitle
        ?? messages.homepageBannerSubtitle
    };
  }

  public setInterfaceLocale(locale: LocalePreference): void {
    const result = this.store.transact("change interface locale", "normal", (data) => ({
      ...data,
      locale
    }));
    if (result.type === "applied") {
      this.localization.setPreference(locale);
    }
  }

  public setOpenOnStartup(openOnStartup: boolean): void {
    this.store.transact("change startup opening", "normal", (data) => ({
      ...data,
      startup: {
        ...data.startup,
        openOnStartup
      }
    }));
  }

  public setOpenWhenWorkspaceEmpty(openWhenWorkspaceEmpty: boolean): void {
    this.store.transact("change empty workspace opening", "normal", (data) => ({
      ...data,
      startup: {
        ...data.startup,
        openWhenWorkspaceEmpty
      }
    }));
  }

  public setBannerTitle(title: string): void {
    this.store.transact("change banner title", "normal", (data) => ({
      ...data,
      banner: {
        ...data.banner,
        title: title.slice(0, 200)
      }
    }));
  }

  public setBannerSubtitle(subtitle: string): void {
    this.store.transact("change banner subtitle", "normal", (data) => ({
      ...data,
      banner: {
        ...data.banner,
        subtitle: subtitle.slice(0, 300)
      }
    }));
  }

  public getLayoutSettings(): LayoutSettings {
    const state = this.store.getState();
    if (state.mode !== "ready") {
      return {
        editable: false,
        theme: "klein-blue",
        appearanceMode: "auto",
        layout: getLayout({}, "klein-blue"),
        hasOverride: false
      };
    }
    return {
      editable: true,
      theme: state.data.theme,
      appearanceMode: state.data.appearanceMode,
      layout: getLayout(state.data.layouts, state.data.theme),
      hasOverride: state.data.layouts[state.data.theme] !== undefined
    };
  }

  public setHomepageTheme(theme: ThemeId): LayoutMutationResult {
    const result = this.store.transact(
      "change homepage theme",
      "normal",
      (data) => ({
        ...data,
        theme
      })
    );
    return this.toLayoutMutationResult(result.type);
  }

  public setHomepageAppearanceMode(
    appearanceMode: PluginData["appearanceMode"]
  ): LayoutMutationResult {
    const result = this.store.transact(
      "change homepage appearance",
      "normal",
      (data) => ({
        ...data,
        appearanceMode
      })
    );
    return this.toLayoutMutationResult(result.type);
  }

  public setLayoutModuleVisibility(
    module: ModuleId,
    visible: boolean
  ): LayoutMutationResult {
    return this.changeCurrentLayout(
      (layout) => setModuleVisibility(layout, module, visible),
      "change layout module visibility"
    );
  }

  public setLayoutModuleSize(
    module: ModuleId,
    size: ModuleSize
  ): LayoutMutationResult {
    return this.changeCurrentLayout(
      (layout) => setModuleSize(layout, module, size),
      "change layout module size"
    );
  }

  public moveLayoutModule(
    module: ModuleId,
    offset: -1 | 1
  ): LayoutMutationResult {
    const settings = this.getLayoutSettings();
    if (!settings.editable) {
      return { type: "blocked" };
    }
    const next = moveModule(settings.layout, module, offset);
    return next === null
      ? { type: "not-found" }
      : this.changeCurrentLayout(
        () => next,
        "reorder layout module"
      );
  }

  public setLayoutBannerVisible(visible: boolean): LayoutMutationResult {
    const state = this.store.getState();
    if (state.mode !== "ready" || state.data.theme === "minimal-paper") {
      return { type: "blocked" };
    }
    const result = this.store.transact(
      "change layout banner visibility",
      "normal",
      (data) => {
        const theme = data.theme;
        const layout = getLayout(data.layouts, theme);
        return {
          ...data,
          layouts: {
            ...data.layouts,
            [theme]: {
              ...layout,
              bannerVisible: visible
            }
          }
        };
      }
    );
    return this.toLayoutMutationResult(result.type);
  }

  public async resetCurrentThemeLayout(): Promise<LayoutMutationResult> {
    const state = this.store.getState();
    if (state.mode !== "ready") {
      return { type: "blocked" };
    }
    const theme = state.data.theme;
    if (state.data.layouts[theme] === undefined) {
      return { type: "not-found" };
    }
    if (!await this.layoutResetConfirmation.confirm(theme)) {
      return { type: "cancelled" };
    }
    const result = this.store.transact(
      "restore default theme layout",
      "immediate",
      (data) => {
        const layouts = { ...data.layouts };
        delete layouts[theme];
        return {
          ...data,
          layouts
        };
      }
    );
    return this.toLayoutMutationResult(result.type);
  }

  public getBannerSettings(): BannerSettings {
    const state = this.store.getState();
    return state.mode === "ready"
      ? {
        editable: true,
        globalSource: state.data.banner.globalSource,
        themes: BANNER_THEME_IDS.map((theme) => ({
          theme,
          settings: getBannerTheme(state.data.banner, theme)
        }))
      }
      : {
        editable: false,
        globalSource: null,
        themes: BANNER_THEME_IDS.map((theme) => ({
          theme,
          settings: getBannerTheme({
            title: null,
            subtitle: null,
            globalSource: null,
            themes: {}
          }, theme)
        }))
      };
  }

  public setGlobalBannerVaultSource(path: string): BannerMutationResult {
    const normalizedPath = path.trim();
    if (
      normalizedPath === ""
      || this.bannerResource.getVaultResourceUrl(normalizedPath) === null
    ) {
      return { type: "invalid-file" };
    }
    return this.changeGlobalBannerSource({
      type: "vault",
      value: normalizedPath
    });
  }

  public setGlobalBannerRemoteSource(value: string): BannerMutationResult {
    const parsed = parseRemoteBannerSource(value);
    return parsed.type === "valid"
      ? this.changeGlobalBannerSource(parsed.source)
      : parsed;
  }

  public clearGlobalBannerSource(): BannerMutationResult {
    return this.changeGlobalBannerSource(null);
  }

  public setThemeBannerVaultSource(
    theme: ThemeId,
    path: string
  ): BannerMutationResult {
    const normalizedPath = path.trim();
    if (
      normalizedPath === ""
      || this.bannerResource.getVaultResourceUrl(normalizedPath) === null
    ) {
      return { type: "invalid-file" };
    }
    return this.changeThemeBannerSource(theme, {
      type: "vault",
      value: normalizedPath
    });
  }

  public setThemeBannerRemoteSource(
    theme: ThemeId,
    value: string
  ): BannerMutationResult {
    const parsed = parseRemoteBannerSource(value);
    return parsed.type === "valid"
      ? this.changeThemeBannerSource(theme, parsed.source)
      : parsed;
  }

  public inheritThemeBannerSource(theme: ThemeId): BannerMutationResult {
    return this.changeBannerTheme(
      theme,
      (settings) => ({
        ...settings,
        sourceMode: "inherit",
        source: null
      }),
      "restore banner source inheritance"
    );
  }

  public setThemeBannerHeight(
    theme: ThemeId,
    height: BannerTheme["height"]
  ): BannerMutationResult {
    return this.changeBannerTheme(
      theme,
      (settings) => ({
        ...settings,
        height
      }),
      "change banner height"
    );
  }

  public setThemeBannerFocalPoint(
    theme: ThemeId,
    x: number,
    y: number
  ): BannerMutationResult {
    if (
      !Number.isFinite(x)
      || !Number.isFinite(y)
      || x < 0
      || x > 100
      || y < 0
      || y > 100
    ) {
      return { type: "invalid-position" };
    }
    return this.changeBannerTheme(
      theme,
      (settings) => ({
        ...settings,
        focalPoint: {
          x,
          y
        }
      }),
      "change banner focal point"
    );
  }

  public handleBannerResourceRename(
    oldPath: string,
    newPath: string,
    directory: boolean
  ): void {
    const state = this.store.getState();
    if (state.mode !== "ready") {
      return;
    }
    const banner = remapBannerVaultPaths(
      state.data.banner,
      oldPath,
      newPath,
      directory
    );
    if (banner === state.data.banner) {
      return;
    }
    this.store.transact(
      "remap banner vault source",
      "immediate",
      (data) => ({
        ...data,
        banner: remapBannerVaultPaths(
          data.banner,
          oldPath,
          newPath,
          directory
        )
      })
    );
  }

  public refreshBannerResources(): void {
    this.notifyBannerRuntime();
  }

  public getFileGroupSettings(): FileGroupSettings {
    const state = this.store.getState();
    return state.mode === "ready"
      ? {
        editable: true,
        groups: state.data.fileGroups.map((group) => ({
          ...group,
          entries: group.entries.map((entry) => ({
            ...entry,
            state: this.fileEntryRuntime.getStatus(entry.path)
          }))
        })),
        undo: this.getFileEntryUndoState()
      }
      : {
        editable: false,
        groups: [],
        undo: null
      };
  }

  public moveFileGroup(
    groupId: string,
    offset: FileGroupMoveOffset
  ): FileGroupMutationResult {
    const state = this.store.getState();
    if (
      state.mode !== "ready"
      || !state.data.fileGroups.some((group) => group.id === groupId)
    ) {
      return {
        type: state.mode === "ready" ? "not-found" : "blocked"
      };
    }
    const result = this.store.transact(
      "move file group",
      "immediate",
      (data) => ({
        ...data,
        fileGroups: moveFileGroupInOrder(data.fileGroups, groupId, offset)
      })
    );
    return result.type === "applied"
      ? { type: "applied", id: groupId }
      : { type: "blocked" };
  }

  public moveFileGroupEntry(
    groupId: string,
    entryId: string,
    offset: FileGroupMoveOffset
  ): FileGroupMutationResult {
    const state = this.store.getState();
    const group = state.mode === "ready"
      ? state.data.fileGroups.find((candidate) => candidate.id === groupId)
      : undefined;
    if (state.mode !== "ready" || group === undefined) {
      return {
        type: state.mode === "ready" ? "not-found" : "blocked"
      };
    }
    if (!group.entries.some((entry) => entry.id === entryId)) {
      return { type: "not-found" };
    }
    const result = this.store.transact(
      "move file group entry",
      "immediate",
      (data) => ({
        ...data,
        fileGroups: moveFileGroupEntryInOrder(
          data.fileGroups,
          groupId,
          entryId,
          offset
        )
      })
    );
    return result.type === "applied"
      ? { type: "applied", id: entryId }
      : { type: "blocked" };
  }

  public handleFileEntryRename(
    oldPath: string,
    newPath: string,
    directory: boolean
  ): void {
    this.store.transact(
      "update renamed file entries",
      "immediate",
      (data) => {
        const fileGroups = remapFileEntryPaths(
          data.fileGroups,
          oldPath,
          newPath,
          directory
        );
        return fileGroups === data.fileGroups
          ? data
          : {
            ...data,
            fileGroups
          };
      }
    );
    this.notifyFileEntryRuntime();
  }

  public refreshFileEntryStates(): void {
    this.notifyFileEntryRuntime();
  }

  public showMoreFileGroupEntries(): void {
    this.fileEntryVisibleLimit += FILE_ENTRY_PAGE_SIZE;
    this.notifyFileEntryRuntime();
  }

  public subscribeFileEntryStates(listener: () => void): () => void {
    return this.subscribeFileEntryRuntime(listener);
  }

  public createFileGroup(name: string): FileGroupMutationResult {
    const issue = validateFileGroupName(name);
    if (issue !== null) {
      return { type: issue };
    }
    const id = createStableId("file-group");
    const result = this.store.transact(
      "create file group",
      "immediate",
      (data) => ({
        ...data,
        fileGroups: [
          ...data.fileGroups,
          {
            id,
            name: normalizeFileGroupName(name),
            entries: []
          }
        ]
      })
    );
    return result.type === "applied"
      ? { type: "applied", id }
      : { type: "blocked" };
  }

  public renameFileGroup(
    groupId: string,
    name: string
  ): FileGroupMutationResult {
    const issue = validateFileGroupName(name);
    if (issue !== null) {
      return { type: issue };
    }
    const state = this.store.getState();
    if (state.mode !== "ready") {
      return { type: "blocked" };
    }
    if (!state.data.fileGroups.some((group) => group.id === groupId)) {
      return { type: "not-found" };
    }
    const result = this.store.transact(
      "rename file group",
      "normal",
      (data) => ({
        ...data,
        fileGroups: data.fileGroups.map((group) =>
          group.id === groupId
            ? {
              ...group,
              name: normalizeFileGroupName(name)
            }
            : group
        )
      })
    );
    return result.type === "applied"
      ? { type: "applied", id: groupId }
      : { type: "blocked" };
  }

  public addFileGroupEntry(
    groupId: string,
    path: string
  ): FileGroupMutationResult {
    const normalizedPath = path.trim();
    if (normalizedPath === "" || normalizedPath.endsWith("/")) {
      return { type: "invalid-file" };
    }
    const state = this.store.getState();
    if (state.mode !== "ready") {
      return { type: "blocked" };
    }
    const group = state.data.fileGroups.find(
      (candidate) => candidate.id === groupId
    );
    if (group === undefined) {
      return { type: "not-found" };
    }
    if (hasFileGroupPath(group, normalizedPath)) {
      return { type: "duplicate-path" };
    }
    const id = createStableId("file-entry");
    const result = this.store.transact(
      "add file group entry",
      "immediate",
      (data) => ({
        ...data,
        fileGroups: data.fileGroups.map((candidate) =>
          candidate.id === groupId
            ? {
              ...candidate,
              entries: [
                ...candidate.entries,
                {
                  id,
                  path: normalizedPath
                }
              ]
            }
            : candidate
        )
      })
    );
    return result.type === "applied"
      ? { type: "applied", id }
      : { type: "blocked" };
  }

  public removeFileGroupEntry(
    groupId: string,
    entryId: string
  ): FileGroupMutationResult {
    const state = this.store.getState();
    if (state.mode !== "ready") {
      return { type: "blocked" };
    }
    const group = state.data.fileGroups.find(
      (candidate) => candidate.id === groupId
    );
    if (
      group === undefined
      || !group.entries.some((entry) => entry.id === entryId)
    ) {
      return { type: "not-found" };
    }
    const entryIndex = group.entries.findIndex((entry) => entry.id === entryId);
    const entry = group.entries[entryIndex];
    if (entry === undefined) {
      return { type: "not-found" };
    }
    const result = this.store.transact(
      "remove file group entry",
      "immediate",
      (data) => ({
        ...data,
        fileGroups: data.fileGroups.map((candidate) =>
          candidate.id === groupId
            ? {
              ...candidate,
              entries: candidate.entries.filter(
                (entry) => entry.id !== entryId
              )
            }
            : candidate
        )
      })
    );
    if (result.type === "applied") {
      this.removedFileEntry = {
        groupId,
        entry,
        index: entryIndex,
        expiresAt: this.fileEntryRuntime.now() + 10_000
      };
      this.notifyFileEntryRuntime();
    }
    return result.type === "applied"
      ? { type: "applied", id: entryId }
      : { type: "blocked" };
  }

  public undoRemovedFileGroupEntry(): FileGroupMutationResult {
    const removed = this.removedFileEntry;
    if (
      removed === null
      || this.fileEntryRuntime.now() > removed.expiresAt
    ) {
      this.removedFileEntry = null;
      return { type: "undo-expired" };
    }
    const state = this.store.getState();
    if (state.mode !== "ready") {
      return { type: "blocked" };
    }
    const group = state.data.fileGroups.find(
      (candidate) => candidate.id === removed.groupId
    );
    if (group === undefined) {
      this.removedFileEntry = null;
      return { type: "not-found" };
    }
    if (hasFileGroupPath(group, removed.entry.path)) {
      this.removedFileEntry = null;
      return { type: "duplicate-path" };
    }
    const result = this.store.transact(
      "undo file group entry removal",
      "immediate",
      (data) => ({
        ...data,
        fileGroups: data.fileGroups.map((candidate) => {
          if (candidate.id !== removed.groupId) {
            return candidate;
          }
          const entries = [...candidate.entries];
          entries.splice(
            Math.min(removed.index, entries.length),
            0,
            removed.entry
          );
          return {
            ...candidate,
            entries
          };
        })
      })
    );
    if (result.type !== "applied") {
      return { type: "blocked" };
    }
    this.removedFileEntry = null;
    this.notifyFileEntryRuntime();
    return {
      type: "applied",
      id: removed.entry.id
    };
  }

  public replaceFileGroupEntry(
    groupId: string,
    entryId: string,
    path: string
  ): FileGroupMutationResult {
    const normalizedPath = path.trim();
    if (
      normalizedPath === ""
      || normalizedPath.endsWith("/")
      || this.fileEntryRuntime.getStatus(normalizedPath) !== "ready"
    ) {
      return { type: "invalid-file" };
    }
    const state = this.store.getState();
    if (state.mode !== "ready") {
      return { type: "blocked" };
    }
    const replacement = replaceFileGroupEntryPath(
      state.data.fileGroups,
      groupId,
      entryId,
      normalizedPath
    );
    if (replacement.type !== "applied") {
      return { type: replacement.type };
    }
    const result = this.store.transact(
      "replace file group entry",
      "immediate",
      (data) => {
        const current = replaceFileGroupEntryPath(
          data.fileGroups,
          groupId,
          entryId,
          normalizedPath
        );
        return current.type === "applied"
          ? {
            ...data,
            fileGroups: current.groups
          }
          : data;
      }
    );
    return result.type === "applied"
      ? { type: "applied", id: entryId }
      : { type: "blocked" };
  }

  public async deleteFileGroup(
    groupId: string
  ): Promise<FileGroupMutationResult> {
    const state = this.store.getState();
    if (state.mode !== "ready") {
      return { type: "blocked" };
    }
    const group = state.data.fileGroups.find(
      (candidate) => candidate.id === groupId
    );
    if (group === undefined) {
      return { type: "not-found" };
    }
    if (
      group.entries.length > 0
      && !await this.fileGroupDeleteConfirmation.confirm(
        group.name,
        group.entries.length
      )
    ) {
      return { type: "cancelled" };
    }
    const current = this.store.getState();
    if (current.mode !== "ready") {
      return { type: "blocked" };
    }
    if (!current.data.fileGroups.some((candidate) => candidate.id === groupId)) {
      return { type: "not-found" };
    }
    const result = this.store.transact(
      "delete file group",
      "immediate",
      (data) => ({
        ...data,
        fileGroups: data.fileGroups.filter(
          (candidate) => candidate.id !== groupId
        )
      })
    );
    if (
      result.type === "applied"
      && this.removedFileEntry?.groupId === groupId
    ) {
      this.removedFileEntry = null;
      this.notifyFileEntryRuntime();
    }
    return result.type === "applied"
      ? { type: "applied", id: groupId }
      : { type: "blocked" };
  }

  public getJournalSettings(): JournalSettings {
    const state = this.store.getState();
    return state.mode === "ready"
      ? {
        editable: true,
        filePath: state.data.journal.filePath,
        viewMode: state.data.journal.viewMode
      }
      : {
        editable: false,
        filePath: null,
        viewMode: "edit"
      };
  }

  public setJournalViewMode(viewMode: JournalSettings["viewMode"]): void {
    this.store.transact("change journal view mode", "normal", (data) => ({
      ...data,
      journal: {
        ...data.journal,
        viewMode
      }
    }));
  }

  public async activateDateSectionJournal(
    path: string
  ): Promise<JournalSourceActivationResult> {
    if (this.store.getState().mode !== "ready") {
      return { type: "configuration-unavailable" };
    }
    const loaded = await this.dateSectionJournal.load(path);
    if (loaded.type !== "loaded") {
      return loaded;
    }
    const result = this.store.transact(
      "activate date-section journal",
      "immediate",
      (data) => ({
        ...data,
        journal: {
          ...data.journal,
          filePath: loaded.path
        }
      })
    );
    return result.type === "applied"
      ? { type: "activated", path: loaded.path }
      : { type: "configuration-unavailable" };
  }

  public async createDateSectionJournal(
    path: string
  ): Promise<JournalSourceCreationResult> {
    if (this.store.getState().mode !== "ready") {
      return { type: "configuration-unavailable" };
    }
    const created = await this.dateSectionJournal.createEmpty(path);
    return created.type === "created"
      ? this.activateDateSectionJournal(created.path)
      : created;
  }

  public updateJournalDraft(content: string): void {
    this.journalDrafts.update(content);
  }

  public async flushJournalDraft(): Promise<void> {
    const result = await this.journalDrafts.flush();
    if (result.type === "conflict" || result.type === "failed") {
      this.notifyJournalRuntime();
    }
  }

  public async moveJournalDate(offsetDays: number): Promise<void> {
    const todayKey = this.store.getLocalTime()?.dateKey ?? "";
    const currentKey = this.getSelectedJournalDateKey();
    if (todayKey === "" || currentKey === "") {
      return;
    }
    const nextKey = shiftDateKey(currentKey, offsetDays);
    if (nextKey > todayKey) {
      return;
    }
    await this.flushJournalDraft();
    if (this.journalDrafts.hasUnsavedDraft()) {
      return;
    }
    this.selectedJournalDateKey = nextKey;
    this.syncJournalDraft();
    this.notifyJournalRuntime();
  }

  public reloadJournalDraft(): void {
    this.journalDrafts.discardAndBegin(this.createJournalDraftTarget());
    this.notifyJournalRuntime();
  }

  public disposeJournalDrafts(): Promise<void> {
    return this.journalDrafts.dispose();
  }

  public async deleteCurrentJournalEntry(): Promise<void> {
    await this.flushJournalDraft();
    const draft = this.journalDrafts.getState();
    if (
      draft.type !== "editing"
      || draft.dirty
      || draft.target.revision === null
      || !await this.journalDeleteConfirmation.confirm(
        draft.target.dateKey,
        draft.target.path
      )
    ) {
      return;
    }
    const result = await this.dateSectionJournal.mutate(draft.target.path, {
      type: "delete",
      dateKey: draft.target.dateKey,
      expectedRevision: draft.target.revision
    });
    if (result.type === "applied") {
      this.journalDrafts.discardAndBegin({
        ...draft.target,
        content: "",
        revision: null
      });
      const loaded = await this.dateSectionJournal.load(draft.target.path);
      if (loaded.type === "loaded") {
        this.setJournalRuntimeState({
          type: "ready",
          path: loaded.path,
          journal: loaded.journal
        });
      }
      return;
    }
    if (
      result.type === "missing-source"
      || result.type === "invalid-source"
      || result.type === "io-error"
      || result.type === "future-date"
    ) {
      this.journalWriteFailure.notify(
        result.type === "future-date" ? "future-date" : result.type,
        draft.target.path
      );
    }
  }

  private changeDailyPlanPeriods(
    templateId: string,
    change: (periods: readonly PlanPeriod[]) => readonly PlanPeriod[],
    transactionName: string,
    requiredPeriodId?: string
  ): DailyPlanMutationResult {
    const state = this.store.getState();
    if (state.mode !== "ready") {
      return { type: "blocked" };
    }
    const template = state.data.plans.dailyTemplates.find(
      (candidate) => candidate.id === templateId
    );
    if (
      template === undefined
      || (
        requiredPeriodId !== undefined
        && !template.periods.some((period) => period.id === requiredPeriodId)
      )
    ) {
      return { type: "not-found" };
    }
    const periods = change(template.periods).map((period) => ({
      ...period,
      label: normalizePlanLabel(period.label)
    }));
    const issue = validateDailyPeriods(periods);
    if (issue !== null) {
      return { type: issue };
    }
    const result = this.store.transact(
      transactionName,
      "normal",
      (data) => ({
        ...data,
        plans: {
          ...data.plans,
          dailyTemplates: data.plans.dailyTemplates.map((candidate) =>
            candidate.id === templateId
              ? {
                ...candidate,
                periods
              }
              : candidate
          )
        }
      })
    );
    return result.type === "applied"
      ? {
        type: "applied",
        ...(requiredPeriodId === undefined ? {} : { id: requiredPeriodId })
      }
      : { type: "blocked" };
  }

  private isModuleVisible(data: PluginData, moduleId: ModuleId): boolean {
    return !getLayout(data.layouts, data.theme).hiddenModules.includes(
      moduleId
    );
  }

  private changeWeeklyPlanPeriods(
    templateId: string,
    day: Weekday,
    change: (periods: readonly PlanPeriod[]) => readonly PlanPeriod[],
    transactionName: string,
    requiredPeriodId?: string
  ): DailyPlanMutationResult {
    const state = this.store.getState();
    if (state.mode !== "ready") {
      return { type: "blocked" };
    }
    const template = state.data.plans.weeklyTemplates.find(
      (candidate) => candidate.id === templateId
    );
    if (
      template === undefined
      || (
        requiredPeriodId !== undefined
        && !template.days[day].some(
          (period) => period.id === requiredPeriodId
        )
      )
    ) {
      return { type: "not-found" };
    }
    const periods = change(template.days[day]).map((period) => ({
      ...period,
      label: normalizePlanLabel(period.label)
    }));
    const nextTemplate: WeeklyTemplate = {
      ...template,
      days: {
        ...template.days,
        [day]: periods
      }
    };
    const issue = validateWeeklyTemplate(nextTemplate);
    if (issue !== null) {
      return { type: issue };
    }
    const result = this.store.transact(
      transactionName,
      "normal",
      (data) => ({
        ...data,
        plans: {
          ...data.plans,
          weeklyTemplates: data.plans.weeklyTemplates.map((candidate) =>
            candidate.id === templateId ? nextTemplate : candidate
          )
        }
      })
    );
    return result.type === "applied"
      ? {
        type: "applied",
        ...(requiredPeriodId === undefined ? {} : { id: requiredPeriodId })
      }
      : { type: "blocked" };
  }

  private changeGlobalBannerSource(
    source: BannerSource | null
  ): BannerMutationResult {
    const result = this.store.transact(
      "change global banner source",
      "normal",
      (data) => ({
        ...data,
        banner: {
          ...data.banner,
          globalSource: source
        }
      })
    );
    return result.type === "applied"
      ? { type: "applied" }
      : { type: "blocked" };
  }

  private changeCurrentLayout(
    update: (layout: Layout) => Layout,
    transactionName: string
  ): LayoutMutationResult {
    const result = this.store.transact(
      transactionName,
      "normal",
      (data) => {
        const theme = data.theme;
        return {
          ...data,
          layouts: {
            ...data.layouts,
            [theme]: update(getLayout(data.layouts, theme))
          }
        };
      }
    );
    return this.toLayoutMutationResult(result.type);
  }

  private toLayoutMutationResult(
    type: TransactionResult["type"]
  ): LayoutMutationResult {
    return type === "applied"
      ? { type: "applied" }
      : { type: "blocked" };
  }

  private changeThemeBannerSource(
    theme: ThemeId,
    source: BannerSource
  ): BannerMutationResult {
    return this.changeBannerTheme(
      theme,
      (settings) => ({
        ...settings,
        sourceMode: "override",
        source
      }),
      "change theme banner source"
    );
  }

  private changeBannerTheme(
    theme: ThemeId,
    update: (settings: BannerTheme) => BannerTheme,
    transactionName: string
  ): BannerMutationResult {
    if (theme === "minimal-paper") {
      return { type: "blocked" };
    }
    const result = this.store.transact(
      transactionName,
      "normal",
      (data) => ({
        ...data,
        banner: {
          ...data.banner,
          themes: {
            ...data.banner.themes,
            [theme]: update(getBannerTheme(data.banner, theme))
          }
        }
      })
    );
    return result.type === "applied"
      ? { type: "applied" }
      : { type: "blocked" };
  }

  private subscribeJournalRuntime(listener: () => void): () => void {
    this.journalRuntimeListeners.add(listener);
    return () => {
      this.journalRuntimeListeners.delete(listener);
    };
  }

  private subscribeTaskRuntime(listener: () => void): () => void {
    this.taskRuntimeListeners.add(listener);
    return () => {
      this.taskRuntimeListeners.delete(listener);
    };
  }

  private subscribeFileEntryRuntime(listener: () => void): () => void {
    this.fileEntryRuntimeListeners.add(listener);
    return () => {
      this.fileEntryRuntimeListeners.delete(listener);
    };
  }

  private notifyFileEntryRuntime(): void {
    for (const listener of [...this.fileEntryRuntimeListeners]) {
      listener();
    }
  }

  private subscribeBannerRuntime(listener: () => void): () => void {
    this.bannerRuntimeListeners.add(listener);
    return () => {
      this.bannerRuntimeListeners.delete(listener);
    };
  }

  private notifyBannerRuntime(): void {
    for (const listener of [...this.bannerRuntimeListeners]) {
      listener();
    }
  }

  private getFileEntryUndoState(): FileGroupSettings["undo"] {
    const removed = this.removedFileEntry;
    if (
      removed === null
      || this.fileEntryRuntime.now() > removed.expiresAt
    ) {
      this.removedFileEntry = null;
      return null;
    }
    return {
      path: removed.entry.path,
      expiresAt: removed.expiresAt
    };
  }

  private setJournalRuntimeState(
    state: DateSectionJournalRuntimeState
  ): void {
    this.journalRuntimeState = state;
    this.notifyJournalRuntime();
  }

  private notifyJournalRuntime(): void {
    for (const listener of this.journalRuntimeListeners) {
      listener();
    }
  }

  private setTaskRuntimeState(state: TaskRuntimeState): void {
    this.taskRuntimeState = state;
    this.notifyTaskRuntime();
  }

  private notifyTaskRuntime(): void {
    for (const listener of [...this.taskRuntimeListeners]) {
      listener();
    }
  }

  private async mutateTask(
    mutation: TaskMutation,
    conflictDraft?: string | null
  ): Promise<TaskSourceMutationResult> {
    const runtime = this.taskRuntimeState;
    if (runtime.type !== "ready") {
      return runtime.type === "missing-source"
        ? runtime
        : { type: "missing-region" };
    }
    const result = await this.taskSource.mutate(runtime.path, mutation);
    if (result.type === "applied") {
      if (conflictDraft !== undefined) {
        this.taskInteractionState = { type: "idle" };
      }
      const loaded = await this.taskSource.load(runtime.path);
      this.setTaskRuntimeState(loaded.type === "loaded"
        ? {
          type: "ready",
          path: loaded.path,
          taskSource: loaded.taskSource
        }
        : loaded);
    } else if (result.type !== "noop") {
      if (result.type === "conflict" && conflictDraft !== undefined) {
        this.taskInteractionState = {
          type: "conflict",
          path: runtime.path,
          draftText: conflictDraft
        };
        this.notifyTaskRuntime();
      } else if (result.type === "missing-source") {
        this.setTaskRuntimeState(result);
      } else if (result.type === "missing-region") {
        this.setTaskRuntimeState({
          type: "missing-region",
          path: runtime.path
        });
      } else if (result.type === "invalid-source") {
        this.setTaskRuntimeState({
          type: "invalid-source",
          path: runtime.path,
          diagnostics: result.diagnostics
        });
      } else if (result.type === "io-error") {
        this.setTaskRuntimeState({
          type: "io-error",
          path: runtime.path
        });
      }
      this.taskWriteFailure.notify(result.type, runtime.path);
    }
    return result;
  }

  private getSelectedJournalDateKey(): string {
    const todayKey = this.store.getLocalTime()?.dateKey ?? "";
    if (
      this.selectedJournalDateKey === ""
      || this.selectedJournalDateKey > todayKey
    ) {
      this.selectedJournalDateKey = todayKey;
    }
    return this.selectedJournalDateKey;
  }

  private getCurrentTaskPeriodKeys(): TaskPeriodKeys | null {
    const dateKey = this.store.getLocalTime()?.dateKey;
    if (dateKey === undefined) {
      return null;
    }
    try {
      return taskPeriodKeysForDate(dateKey);
    } catch {
      return null;
    }
  }

  private syncJournalDraft(): void {
    if (
      this.journalRuntimeState.type !== "ready"
      || this.journalDrafts.hasUnsavedDraft()
    ) {
      return;
    }
    this.journalDrafts.begin(this.createJournalDraftTarget());
  }

  private createJournalDraftTarget(): JournalDraftTarget {
    if (this.journalRuntimeState.type !== "ready") {
      return {
        path: "",
        dateKey: "",
        todayKey: "",
        content: "",
        revision: null
      };
    }
    const dateKey = this.getSelectedJournalDateKey();
    const section = this.journalRuntimeState.journal.sections.find(
      (candidate) => candidate.dateKey === dateKey
    );
    return {
      path: this.journalRuntimeState.path,
      dateKey,
      todayKey: this.store.getLocalTime()?.dateKey ?? dateKey,
      content: section?.content ?? "",
      revision: section?.revision ?? null
    };
  }

  public getHeatmapSettings(): HeatmapSettings {
    const state = this.store.getState();
    return state.mode === "ready"
      ? {
        editable: true,
        countType: state.data.heatmap.countType,
        dateRange: state.data.heatmap.preferences.dateRange,
        startOfWeek: state.data.heatmap.preferences.startOfWeek,
        thresholds: state.data.heatmap.preferences.thresholds,
        excludeFolders: state.data.heatmap.preferences.excludeFolders,
        historyRetentionDays: state.data.heatmap.historyRetentionDays
      }
      : {
        editable: false,
        countType: "char",
        dateRange: {
          type: "latestDays",
          days: 365
        },
        startOfWeek: 0,
        thresholds: [200, 1000, 3000],
        excludeFolders: [],
        historyRetentionDays: 0
      };
  }

  public establishHeatmapBaseline(path: string, content: string): void {
    this.heatmapTracking.establishBaseline(path, content);
  }

  public recordHeatmapEditorContent(path: string, content: string): void {
    this.heatmapTracking.recordEditorContent(path, content);
  }

  public refreshHeatmapDate(): void {
    this.heatmapTracking.refreshDate();
  }

  public setHeatmapCountType(countType: HeatmapCountType): void {
    this.heatmapTracking.setCountType(countType);
  }

  public setHeatmapDateRange(dateRange: HeatmapDateRange): void {
    this.heatmapTracking.setDateRange(dateRange);
  }

  public setHeatmapStartOfWeek(startOfWeek: HeatmapStartOfWeek): void {
    this.heatmapTracking.setStartOfWeek(startOfWeek);
  }

  public setHeatmapThresholds(thresholds: HeatmapThresholds): void {
    this.heatmapTracking.setThresholds(thresholds);
  }

  public setHeatmapExcludeFolders(excludeFolders: readonly string[]): void {
    this.heatmapTracking.setExcludeFolders(excludeFolders);
  }

  public setHeatmapHistoryRetentionDays(historyRetentionDays: number): void {
    this.heatmapTracking.setHistoryRetentionDays(historyRetentionDays);
  }

  public openFile(path: string, newPane: boolean): Promise<void> {
    return this.fileNavigation.open(path, newPane);
  }

  public openSettings(section?: HomepageSettingsSection): void {
    this.settingsNavigation.open(section);
  }

  public getDiagnosticReport(): string {
    const snapshot = this.getSnapshot();
    const messages = this.localization.getMessages();
    const lines = [
      messages.diagnosticReportTitle,
      `${messages.diagnosticReportMode}: ${
        snapshot.status === "safe-mode"
          ? messages.dataManagementSafeMode
          : messages.dataManagementReady
      }`
    ];
    if (snapshot.diagnostics.length === 0) {
      lines.push(messages.diagnosticReportNoIssues);
      return lines.join("\n");
    }
    for (const diagnostic of snapshot.diagnostics) {
      lines.push("", `[${diagnostic.code}] ${diagnostic.message}`);
      if (diagnostic.details !== undefined) {
        lines.push(
          `${messages.diagnosticReportDetails}: ${diagnostic.details}`
        );
      }
      lines.push(
        `${messages.diagnosticReportPaths}: ${
          diagnostic.relatedPaths.join(", ")
        }`,
        `${messages.diagnosticReportSuggestedAction}: ${
          diagnostic.suggestedAction
        }`
      );
    }
    return lines.join("\n");
  }

  public reloadPluginData(): Promise<void> {
    return this.recovery.reload();
  }

  public async resetPluginData(): Promise<ResetPluginDataResult> {
    if (!await this.resetConfirmation.confirmReset()) {
      return "cancelled";
    }
    const result = await this.recovery.reset();
    if (result.type === "backup-failed") {
      this.recoveryFailure.notifyBackupFailure(result.error);
      return "backup-failed";
    }
    return "reset";
  }
}
