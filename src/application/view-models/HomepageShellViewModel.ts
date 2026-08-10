import type { LocalTimeSnapshot } from "../ports/Clock";
import type { HomepageSettingsSection } from "../ports/SettingsNavigation";
import type {
  ModuleId,
  ModuleSize,
  PlanPeriod,
  PluginData
} from "../../domain/data/types";
import type { Messages } from "../../localization/messages";
import { buildHeatmapCalendar } from "../../domain/heatmap/calendar";
import { selectHeatmapDay } from "../../domain/heatmap/selection";
import type {
  DateSectionDiagnostic,
  DateSectionDocument
} from "../../domain/journal/dateSections";
import type { JournalDraftState } from
  "../services/DateSectionJournalDraftService";
import type {
  TaskSourceDiagnostic,
  TaskSourceDocument,
  TaskTarget
} from "../../domain/tasks/taskSource";
import {
  evaluateDailyPlan,
  formatPlanMinute
} from "../../domain/plans/dailyPlan";
import { evaluateWeeklyPlan } from "../../domain/plans/weeklyPlan";
import { buildFileEntryLabels } from "../../domain/files/fileGroups";
import { resolveBanner } from "../../domain/banner/banner";
import { getLayout } from "../../domain/layout/layout";

export interface JournalShellInput {
  readonly runtime:
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
  readonly selectedDateKey: string;
  readonly draft: JournalDraftState;
}

export interface FileEntryShellInput {
  getStatus(path: string): "ready" | "missing" | "invalid";
  readonly visibleLimit?: number;
}

export interface BannerShellInput {
  getVaultResourceUrl(path: string): string | null;
}

export type TaskShellInput =
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

export interface TaskInteractionInput {
  readonly state:
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
  readonly archiveVisible: boolean;
  readonly visibleLimit?: number;
  readonly archivedVisibleLimit?: number;
}

export interface HeatmapCellViewModel {
  readonly dateKey: string;
  readonly value: number;
  readonly level: 0 | 1 | 2 | 3 | 4;
  readonly isToday: boolean;
  readonly weekIndex: number;
  readonly weekdayIndex: number;
  readonly weekStartKey: string;
  readonly accessibleLabel: string;
  readonly details: {
    readonly dateLabel: string;
    readonly totalLabel: string;
    readonly fileCountLabel: string;
    readonly state: "files" | "empty" | "archived";
    readonly statusMessage: string;
    readonly files: readonly {
      readonly path: string;
      readonly title: string;
      readonly contributionLabel: string;
      readonly accessibleLabel: string;
    }[];
  };
}

export interface HeatmapWeekViewModel {
  readonly monthLabel: string;
  readonly cells: readonly (HeatmapCellViewModel | null)[];
}

export interface HomepageModuleViewModel {
  readonly id: ModuleId;
  readonly size: ModuleSize;
  readonly title: string;
  readonly icon: string;
  readonly state: "empty" | "unconfigured" | "ready";
  readonly emptyState: {
    readonly icon: string;
    readonly title: string;
    readonly description: string;
    readonly actionLabel: string;
    readonly settingsSection: HomepageSettingsSection;
  };
  readonly heatmap?: {
    readonly rangeLabel: string;
    readonly todayLabel: string;
    readonly todayValue: string;
    readonly gridLabel: string;
    readonly weekdayLabels: readonly string[];
    readonly weeks: readonly HeatmapWeekViewModel[];
    readonly cells: readonly HeatmapCellViewModel[];
  };
  readonly journal?: {
    readonly path: string;
    readonly dateKey: string;
    readonly dateLabel: string;
    readonly weekdayLabel: string;
    readonly content: string;
    readonly viewMode: "edit" | "preview";
    readonly canMoveNext: boolean;
    readonly previousLabel: string;
    readonly nextLabel: string;
    readonly editorLabel: string;
    readonly editLabel: string;
    readonly previewLabel: string;
    readonly deleteLabel: string;
    readonly canDelete: boolean;
    readonly emptyPreviewLabel: string;
    readonly conflict: {
      readonly title: string;
      readonly description: string;
      readonly copyLabel: string;
      readonly reloadLabel: string;
      readonly openSourceLabel: string;
    } | null;
  };
  readonly tasks?: {
    readonly path: string;
    readonly listLabel: string;
    readonly progressLabel: string;
    readonly archiveAllLabel: string | null;
    readonly archiveToggleLabel: string | null;
    readonly archiveVisible: boolean;
    readonly archiveListLabel: string;
    readonly archiveEmptyLabel: string;
    readonly addPlaceholder: string;
    readonly addLabel: string;
    readonly emptyLabel: string;
    readonly showMoreLabel: string;
    readonly showMoreArchiveLabel: string;
    readonly hasMoreItems: boolean;
    readonly hasMoreArchivedItems: boolean;
    readonly conflict: {
      readonly title: string;
      readonly description: string;
      readonly copyLabel: string | null;
      readonly reloadLabel: string;
      readonly openSourceLabel: string;
    } | null;
    readonly items: readonly {
      readonly target: TaskTarget;
      readonly text: string;
      readonly completed: boolean;
      readonly editingText: string | null;
      readonly checkboxLabel: string;
      readonly editLabel: string;
      readonly archiveLabel: string | null;
      readonly deleteLabel: string;
      readonly saveLabel: string;
      readonly cancelLabel: string;
    }[];
    readonly archivedItems: readonly {
      readonly target: TaskTarget;
      readonly text: string;
      readonly unarchiveLabel: string;
    }[];
  };
  readonly plan?: {
    readonly templateLabel: string;
    readonly state: "active" | "idle";
    readonly primaryLabel: string;
    readonly timeRangeLabel: string;
    readonly statusLabel: string;
    readonly remainingLabel: string | null;
    readonly progress: number | null;
    readonly nextTitle: string;
    readonly nextLabel: string;
    readonly nextTimeLabel: string;
    readonly nextDayLabel: string | null;
    readonly scheduleLabel: string;
    readonly emptyScheduleLabel: string;
    readonly schedule: readonly {
      readonly id: string;
      readonly label: string;
      readonly timeRangeLabel: string;
      readonly state: "past" | "current" | "upcoming";
      readonly stateLabel: string;
    }[];
  };
  readonly fileGroups?: {
    readonly manageLabel: string;
    readonly listLabel: string;
    readonly emptyGroupLabel: string;
    readonly showMoreLabel: string;
    readonly hasMoreEntries: boolean;
    readonly groups: readonly {
      readonly id: string;
      readonly name: string;
      readonly entries: readonly {
        readonly id: string;
        readonly path: string;
        readonly fileName: string;
        readonly parentLabel: string | null;
        readonly accessibleLabel: string;
        readonly state: "ready" | "missing" | "invalid";
        readonly statusLabel: string | null;
      }[];
    }[];
  };
}

export interface HomepageShellViewModel {
  readonly theme: PluginData["theme"];
  readonly appearanceMode: PluginData["appearanceMode"];
  readonly title: string;
  readonly controlLabel: string;
  readonly settingsLabel: string;
  readonly modulesLabel: string;
  readonly archiveBannerMetaLabel?: string;
  readonly archiveBannerStatusLabel?: string;
  readonly archiveFooterLabel?: string;
  readonly archiveFooterCoordinate?: string;
  readonly banner: {
    readonly visible: boolean;
    readonly title: string;
    readonly subtitle: string;
    readonly height: "compact" | "standard" | "tall";
    readonly focalPoint: {
      readonly x: number;
      readonly y: number;
    };
    readonly image: {
      readonly sourceType: "vault" | "remote";
      readonly url: string;
    } | null;
    readonly temporal: {
      readonly dateKey: string;
      readonly dateLabel: string;
      readonly weekdayLabel: string;
      readonly timeLabel: string;
      readonly coordinateLabel: string;
    } | null;
  };
  readonly modules: readonly HomepageModuleViewModel[];
}

const createTemporalViewModel = (
  localTime: LocalTimeSnapshot,
  locale: string
): NonNullable<HomepageShellViewModel["banner"]["temporal"]> => {
  const [year, month, day] = localTime.dateKey
    .split("-")
    .map((part) => Number(part));
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  const clock = new Date(Date.UTC(
    1970,
    0,
    1,
    Math.floor(localTime.minuteOfDay / 60),
    localTime.minuteOfDay % 60
  ));
  return {
    dateKey: localTime.dateKey,
    dateLabel: new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC"
    }).format(date),
    weekdayLabel: new Intl.DateTimeFormat(locale, {
      weekday: "long",
      timeZone: "UTC"
    }).format(date),
    timeLabel: new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "UTC"
    }).format(clock),
    coordinateLabel: localTime.dateKey.replaceAll("-", ".")
  };
};

const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
};

const formatPlanDuration = (
  minutes: number,
  messages: Messages,
  locale: string
): string => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) {
    return messages.planDurationMinutes.replace(
      "{minutes}",
      remainder.toLocaleString(locale)
    );
  }
  return messages.planDurationHours
    .replace("{hours}", hours.toLocaleString(locale))
    .replace("{minutes}", remainder.toLocaleString(locale));
};

const formatPlanRange = (
  startMinute: number,
  endMinute: number
): string => `${formatPlanMinute(startMinute)} — ${formatPlanMinute(endMinute)}`;

const getArchiveModuleTitle = (
  moduleId: ModuleId,
  index: number,
  messages: Messages
): string => {
  const title = (() => {
    switch (moduleId) {
      case "heatmap":
        return messages.archiveModuleHeatmapTitle;
      case "journal":
        return messages.archiveModuleJournalTitle;
      case "current-plan":
        return messages.archiveModuleCurrentPlanTitle;
      case "tasks":
        return messages.archiveModuleTasksTitle;
      case "file-groups":
        return messages.archiveModuleFileGroupsTitle;
    }
  })();
  return messages.archiveModuleTitleFormat
    .replace("{index}", String(index).padStart(3, "0"))
    .replace("{title}", title);
};

const getCosmicModuleCopy = (
  moduleId: ModuleId,
  messages: Messages
): { readonly title: string } => {
  switch (moduleId) {
    case "heatmap":
      return {
        title: messages.cosmicModuleHeatmapTitle
      };
    case "journal":
      return {
        title: messages.cosmicModuleJournalTitle
      };
    case "current-plan":
      return {
        title: messages.cosmicModuleCurrentPlanTitle
      };
    case "tasks":
      return {
        title: messages.cosmicModuleTasksTitle
      };
    case "file-groups":
      return {
        title: messages.cosmicModuleFileGroupsTitle
      };
  }
};

const formatNextPlanDay = (
  dateKey: string,
  dayOffset: number,
  locale: string,
  tomorrowLabel: string
): string | null => {
  if (dayOffset <= 0) {
    return null;
  }
  if (dayOffset === 1) {
    return tomorrowLabel;
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(
    year ?? 1970,
    (month ?? 1) - 1,
    (day ?? 1) + dayOffset
  ));
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC"
  }).format(date);
};

const createWeekdayLabels = (
  startOfWeek: PluginData["heatmap"]["preferences"]["startOfWeek"],
  locale: string
): readonly string[] => {
  const baseLabels = locale.toLowerCase().startsWith("zh")
    ? ["日", "一", "二", "三", "四", "五", "六"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const ordered = [
    ...baseLabels.slice(startOfWeek),
    ...baseLabels.slice(0, startOfWeek)
  ];
  return ordered.map((label, index) =>
    index === 1 || index === 3 || index === 5 ? label : ""
  );
};

const createHeatmapWeeks = (
  cells: readonly HeatmapCellViewModel[],
  locale: string
): readonly HeatmapWeekViewModel[] => {
  const lastCell = cells[cells.length - 1];
  if (lastCell === undefined) {
    return [];
  }
  const weeks = Array.from(
    { length: lastCell.weekIndex + 1 },
    () => ({
      monthLabel: "",
      cells: Array<HeatmapCellViewModel | null>(7).fill(null)
    })
  );
  for (const cell of cells) {
    const week = weeks[cell.weekIndex];
    if (week !== undefined) {
      week.cells[cell.weekdayIndex] = cell;
    }
  }

  const weekMonthKeys = weeks.map((_, index) => {
    const cell = cells.find((candidate) => candidate.weekIndex === index);
    const weekStart = parseDateKey(cell?.weekStartKey ?? "1970-01-01");
    return [
      weekStart.getUTCFullYear(),
      weekStart.getUTCMonth().toString().padStart(2, "0")
    ].join("-");
  });
  const shouldLabel = Array<boolean>(weeks.length).fill(false);
  let lastLabelIndex = Number.NEGATIVE_INFINITY;
  let previousMonthKey = "";
  for (let index = 0; index < weeks.length; index += 1) {
    const monthKey = weekMonthKeys[index];
    if (monthKey === previousMonthKey) {
      continue;
    }
    previousMonthKey = monthKey ?? "";
    let weeksInMonth = 0;
    for (
      let candidate = index;
      candidate < weeks.length && weekMonthKeys[candidate] === monthKey;
      candidate += 1
    ) {
      weeksInMonth += 1;
    }
    if (weeksInMonth >= 2 && index - lastLabelIndex >= 2) {
      shouldLabel[index] = true;
      lastLabelIndex = index;
    }
  }
  if (!shouldLabel.includes(true)) {
    const counts = new Map<string, { firstIndex: number; count: number }>();
    weekMonthKeys.forEach((monthKey, index) => {
      const current = counts.get(monthKey);
      counts.set(monthKey, {
        firstIndex: current?.firstIndex ?? index,
        count: (current?.count ?? 0) + 1
      });
    });
    const fallback = [...counts.values()].sort(
      (left, right) => right.count - left.count
    )[0];
    if (fallback !== undefined) {
      shouldLabel[fallback.firstIndex] = true;
    }
  }

  const monthFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC"
  });
  return weeks.map((week, index) => {
    const firstCell = cells.find((candidate) => candidate.weekIndex === index);
    return {
      ...week,
      monthLabel: shouldLabel[index] && firstCell !== undefined
        ? monthFormatter.format(parseDateKey(firstCell.weekStartKey))
        : ""
    };
  });
};

export const createHomepageShellViewModel = (
  data: PluginData,
  localTime: LocalTimeSnapshot | null,
  messages: Messages,
  locale: string,
  journalInput?: JournalShellInput,
  taskInput?: TaskShellInput,
  taskInteraction?: TaskInteractionInput,
  fileEntryInput?: FileEntryShellInput,
  bannerInput?: BannerShellInput
): HomepageShellViewModel => {
  const layout = getLayout(data.layouts, data.theme);
  const visibleModules = new Set(
    layout.moduleOrder.filter(
      (moduleId) => !layout.hiddenModules.includes(moduleId)
    )
  );
  const heatmapVisible = visibleModules.has("heatmap");
  const journalVisible = visibleModules.has("journal");
  const tasksVisible = visibleModules.has("tasks");
  const planVisible = visibleModules.has("current-plan");
  const fileGroupsVisible = visibleModules.has("file-groups");
  const todayKey = localTime?.dateKey ?? "";
  const calendar = !heatmapVisible || todayKey === ""
    ? []
    : buildHeatmapCalendar(data.heatmap, todayKey);
  const countUnit = data.heatmap.countType === "char"
    ? messages.heatmapCharacterUnit
    : messages.heatmapWordUnit;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
  const formatCalendarDate = (dateKey: string): string => {
    const [year, month, day] = dateKey.split("-").map(Number);
    return dateFormatter.format(new Date(Date.UTC(
      year ?? 1970,
      (month ?? 1) - 1,
      day ?? 1
    )));
  };
  const formatJournalDate = (dateKey: string): string =>
    data.theme === "archive-observatory"
      || data.theme === "cosmic-cartography"
      ? dateKey
      : formatCalendarDate(dateKey);
  const hasHeatmapActivity = calendar.some((day) => day.value > 0);
  const firstCell = calendar[0];
  const lastCell = calendar[calendar.length - 1];
  const todayTotal = heatmapVisible
    ? selectHeatmapDay(
      data.heatmap.history[todayKey],
      data.heatmap.preferences.excludeFolders
    ).total
    : 0;
  const heatmapReady =
    hasHeatmapActivity
    && firstCell !== undefined
    && lastCell !== undefined;
  const heatmapCells: readonly HeatmapCellViewModel[] = calendar.map((day) => {
    const selected = selectHeatmapDay(
      data.heatmap.history[day.dateKey],
      data.heatmap.preferences.excludeFolders
    );
    const dateLabel = formatCalendarDate(day.dateKey);
    const formattedTotal = selected.total.toLocaleString(locale);
    const totalLabel =
      `${selected.total > 0 ? "+" : ""}${formattedTotal} ${countUnit}`;
    const files = Object.entries(selected.files)
      .sort((left, right) => right[1] - left[1])
      .map(([path, contribution]) => {
        const pathParts = path.split("/");
        const fileName = pathParts[pathParts.length - 1] ?? path;
        const title = fileName.replace(/\.md$/iu, "");
        const contributionLabel =
          `+${contribution.toLocaleString(locale)} ${countUnit}`;
        return {
          path,
          title,
          contributionLabel,
          accessibleLabel: `${title}, ${contributionLabel}, ${path}`
        };
      });
    const detailState = selected.detailsState === "archived"
      ? "archived"
      : files.length > 0
        ? "files"
        : "empty";
    const statusMessage = detailState === "archived"
      ? messages.heatmapDayArchived
      : detailState === "empty"
        ? messages.heatmapDayNoActivity
        : "";
    return {
      ...day,
      accessibleLabel: [
        `${dateLabel}: ${formattedTotal} ${countUnit}`,
        selected.detailsState === "archived"
          ? messages.heatmapDayArchived
          : ""
      ].filter(Boolean).join(". "),
      details: {
        dateLabel,
        totalLabel,
        fileCountLabel: (
          files.length === 1
            ? messages.heatmapChangedFile
            : messages.heatmapChangedFiles
        ).replace(
          "{count}",
          files.length.toLocaleString(locale)
        ),
        state: detailState,
        statusMessage,
        files
      }
    };
  });
  const journalRuntime = journalVisible ? journalInput?.runtime : undefined;
  const journalReady = journalRuntime?.type === "ready";
  const selectedJournalDate = journalInput?.selectedDateKey ?? todayKey;
  const selectedJournalSection = journalReady
    ? journalRuntime.journal.sections.find(
      (section) => section.dateKey === selectedJournalDate
    )
    : undefined;
  const journalDraft = journalInput?.draft;
  const journalDraftMatches = journalDraft !== undefined
    && journalDraft.type !== "idle"
    && journalDraft.target.path === (
      journalReady ? journalRuntime.path : ""
    )
    && journalDraft.target.dateKey === selectedJournalDate;
  const journalContent = journalDraftMatches
    ? journalDraft.target.content
    : selectedJournalSection?.content ?? "";
  const journalConflict = journalDraftMatches
    && journalDraft !== undefined
    && (journalDraft.type === "conflict" || journalDraft.type === "failed");
  const journalEmptyState = journalRuntime?.type === "missing-source"
    ? {
      title: messages.journalMissingTitle,
      description: messages.journalMissingDescription
        .replace("{path}", journalRuntime.path)
    }
    : journalRuntime?.type === "invalid-source"
      ? {
        title: messages.journalInvalidTitle,
        description: messages.journalInvalidDescription
      }
      : journalRuntime?.type === "io-error"
        ? {
          title: messages.journalIoTitle,
          description: messages.journalIoDescription
        }
        : journalRuntime?.type === "loading"
          ? {
            title: messages.journalLoadingTitle,
            description: messages.journalLoadingDescription
          }
          : {
            title: messages.journalEmptyTitle,
            description: messages.journalEmptyDescription
          };
  const taskReady = tasksVisible && taskInput?.type === "ready";
  const activeTaskRecords = taskReady
    ? taskInput.taskSource.tasks.filter((task) => task.section === "active")
    : [];
  const archivedTaskRecords = taskReady
    ? taskInput.taskSource.tasks.filter((task) => task.section === "archive")
    : [];
  const completedTaskRecords = activeTaskRecords.filter(
    (task) => task.completed
  );
  const interactionState = taskInteraction?.state ?? { type: "idle" };
  const editingRecord = interactionState.type === "editing" && taskReady
    ? (() => {
      const candidates = taskInput.taskSource.tasks.filter(
        (task) =>
          task.section === interactionState.target.section
          && task.rawLine === interactionState.target.rawLine
      );
      if (candidates.length === 1) {
        return candidates[0];
      }
      const contextual = candidates.filter(
        (task) =>
          task.target.previousTaskLine
            === interactionState.target.previousTaskLine
          && task.target.nextTaskLine === interactionState.target.nextTaskLine
      );
      return contextual.length === 1 ? contextual[0] : undefined;
    })()
    : undefined;
  const taskConflict = interactionState.type === "conflict"
    || (
      interactionState.type === "editing"
      && taskReady
      && editingRecord === undefined
    );
  const taskItems = taskReady
    ? activeTaskRecords
      .filter((task) => data.tasks.showCompleted || !task.completed)
      .sort((left, right) =>
        Number(left.completed) - Number(right.completed)
        || left.line - right.line
      )
    : [];
  const taskEmptyState = taskInput?.type === "missing-source"
    ? {
      title: messages.tasksMissingTitle,
      description: messages.tasksMissingDescription.replace(
        "{path}",
        taskInput.path
      )
    }
    : taskInput?.type === "missing-region"
      ? {
        title: messages.tasksInvalidTitle,
        description: messages.tasksMissingRegionDescription
      }
      : taskInput?.type === "invalid-source"
        ? {
          title: messages.tasksInvalidTitle,
          description: messages.tasksInvalidDescription
        }
        : taskInput?.type === "io-error"
          ? {
            title: messages.tasksIoTitle,
            description: messages.tasksIoDescription
          }
          : taskInput?.type === "loading"
            ? {
              title: messages.tasksLoadingTitle,
              description: messages.tasksLoadingDescription
            }
            : {
              title: messages.tasksEmptyTitle,
              description: messages.tasksEmptyDescription
            };
  const selectedDailyTemplate = planVisible && data.plans.activeMode === "daily"
    ? data.plans.dailyTemplates.find(
      (template) => template.id === data.plans.selectedDailyTemplateId
    )
    : undefined;
  const selectedWeeklyTemplate = planVisible && data.plans.activeMode === "weekly"
    ? data.plans.weeklyTemplates.find(
      (template) => template.id === data.plans.selectedWeeklyTemplateId
    )
    : undefined;
  const selectedPlanTemplate =
    selectedDailyTemplate ?? selectedWeeklyTemplate;
  const planEvaluation = selectedPlanTemplate === undefined
      || localTime === null
    ? null
    : selectedDailyTemplate !== undefined
      ? evaluateDailyPlan(selectedDailyTemplate, localTime.minuteOfDay)
      : selectedWeeklyTemplate === undefined
        ? null
        : evaluateWeeklyPlan(
          selectedWeeklyTemplate,
          localTime.weekday,
          localTime.minuteOfDay
        );
  const currentPlan = planEvaluation?.current ?? null;
  const nextPlan = planEvaluation?.next ?? null;
  const planProgress = planEvaluation?.progress ?? null;
  const planSchedule = planEvaluation?.periods.map((period) => {
    const state: "past" | "current" | "upcoming" = localTime === null
      ? "upcoming"
      : currentPlan?.id === period.id
        && planEvaluation?.currentDayOffset === 0
        ? "current"
        : period.endMinute <= 1440
          && localTime.minuteOfDay >= period.endMinute
        ? "past"
          : "upcoming";
    return {
      id: period.id,
      label: period.label,
      timeRangeLabel: formatPlanRange(
        period.startMinute,
        period.endMinute
      ),
      state,
      stateLabel: state === "past"
        ? messages.planSchedulePast
        : state === "current"
          ? messages.planScheduleCurrent
          : messages.planScheduleUpcoming
    };
  }) ?? [];
  const findPreviousPlanPeriod = (): PlanPeriod | null => {
    if (selectedDailyTemplate !== undefined) {
      const periods = [...selectedDailyTemplate.periods].sort(
        (left, right) =>
          left.startMinute - right.startMinute
          || left.endMinute - right.endMinute
      );
      return periods[periods.length - 1] ?? null;
    }
    if (selectedWeeklyTemplate === undefined || localTime === null) {
      return null;
    }
    const weekdays = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday"
    ] as const;
    const weekdayIndex = weekdays.indexOf(localTime.weekday);
    for (let offset = 1; offset <= weekdays.length; offset += 1) {
      const day = weekdays[
        (weekdayIndex - offset + weekdays.length) % weekdays.length
      ];
      if (day === undefined) {
        continue;
      }
      const periods = [...selectedWeeklyTemplate.days[day]].sort(
        (left, right) =>
          left.startMinute - right.startMinute
          || left.endMinute - right.endMinute
      );
      const period = periods[periods.length - 1];
      if (period !== undefined) {
        return period;
      }
    }
    return null;
  };
  const previousPlanPeriod = data.theme === "archive-observatory"
    && planEvaluation?.currentDayOffset === 0
    && currentPlan !== null
    && planSchedule[0]?.state === "current"
    ? findPreviousPlanPeriod()
    : null;
  const archivePlanSchedule = data.theme === "archive-observatory"
    && previousPlanPeriod !== null
    && previousPlanPeriod.id !== currentPlan?.id
    ? [
      {
        id: `${previousPlanPeriod.id}-previous`,
        label: previousPlanPeriod.label,
        timeRangeLabel: formatPlanRange(
          previousPlanPeriod.startMinute,
          previousPlanPeriod.endMinute
        ),
        state: "past" as const,
        stateLabel: messages.planSchedulePast
      },
      ...planSchedule
    ]
    : planSchedule;
  const resolvedBanner = resolveBanner(data.banner, data.theme);
  let bannerImage: HomepageShellViewModel["banner"]["image"] = null;
  if (layout.bannerVisible && resolvedBanner.source?.type === "remote") {
    bannerImage = {
      sourceType: "remote",
      url: resolvedBanner.source.value
    };
  } else if (layout.bannerVisible && resolvedBanner.source?.type === "vault") {
    const resourceUrl = bannerInput?.getVaultResourceUrl(
      resolvedBanner.source.value
    ) ?? null;
    if (resourceUrl !== null) {
      bannerImage = {
        sourceType: "vault",
        url: resourceUrl
      };
    }
  }

  const shell: HomepageShellViewModel = {
    theme: data.theme,
    appearanceMode: data.appearanceMode,
    title: messages.homepageTitle,
    controlLabel: data.theme === "watercolor-journal"
      ? messages.homepageWatercolorControlLabel
      : data.theme === "celestial-orbit"
        ? messages.homepageCelestialControlLabel
      : data.theme === "minimal-paper"
        ? messages.homepageMinimalControlLabel
      : data.theme === "archive-observatory"
          ? messages.homepageArchiveControlLabel
          : data.theme === "cosmic-cartography"
            ? messages.homepageCosmicControlLabel
          : messages.homepageControlLabel,
    settingsLabel: messages.openSettings,
    modulesLabel: messages.homepageModules,
    ...(data.theme === "archive-observatory"
      ? {
        archiveBannerMetaLabel: messages.homepageArchiveBannerMeta.replace(
          "{year}",
          localTime?.dateKey.slice(0, 4) ?? "—"
        ),
        archiveBannerStatusLabel: messages.homepageArchiveBannerStatus,
        archiveFooterLabel: messages.homepageArchiveFooter.replace(
          "{date}",
          localTime?.dateKey.replace(/-/gu, ".") ?? "—"
        ),
        archiveFooterCoordinate: messages.homepageArchiveFooterCoordinate
      }
      : {}),
    banner: {
      visible: true,
      title: data.banner.title
        ?? (data.theme === "archive-observatory"
          ? messages.homepageArchiveBannerTitle
          : data.theme === "cosmic-cartography"
            ? messages.homepageCosmicBannerTitle
            : messages.homepageBannerTitle),
      subtitle: data.banner.subtitle
        ?? (data.theme === "archive-observatory"
          ? messages.homepageArchiveBannerSubtitle
          : data.theme === "cosmic-cartography"
            ? messages.homepageCosmicBannerSubtitle
            : messages.homepageBannerSubtitle),
      height: resolvedBanner.height,
      focalPoint: resolvedBanner.focalPoint,
      image: bannerImage,
      temporal: localTime === null
        ? null
        : createTemporalViewModel(localTime, locale)
    },
    modules: [
      {
        id: "heatmap",
        size: "standard",
        title: messages.heatmapModuleTitle,
        icon: "chart-no-axes-column-increasing",
        state: heatmapReady ? "ready" : "empty",
        emptyState: {
          icon: "calendar-range",
          title: messages.heatmapEmptyTitle,
          description: messages.heatmapEmptyDescription,
          actionLabel: messages.heatmapEmptyAction,
          settingsSection: "heatmap"
        },
        ...(heatmapReady
          ? {
            heatmap: {
              rangeLabel: `${formatCalendarDate(firstCell.dateKey)} — ${formatCalendarDate(lastCell.dateKey)}`,
              todayLabel: messages.heatmapToday,
              todayValue: `${todayTotal.toLocaleString(locale)} ${countUnit}`,
              gridLabel: messages.heatmapGridLabel,
              weekdayLabels: createWeekdayLabels(
                data.heatmap.preferences.startOfWeek,
                locale
              ),
              weeks: createHeatmapWeeks(heatmapCells, locale),
              cells: heatmapCells
            }
          }
          : {})
      },
      {
        id: "current-plan",
        size: "standard",
        title: messages.currentPlanModuleTitle,
        icon: "clock-3",
        state: planEvaluation === null ? "unconfigured" : "ready",
        emptyState: {
          icon: "calendar-clock",
          title: messages.currentPlanEmptyTitle,
          description: messages.currentPlanEmptyDescription,
          actionLabel: messages.currentPlanEmptyAction,
          settingsSection: "plans"
        },
        ...(planEvaluation === null || selectedPlanTemplate === undefined
          ? {}
          : {
            plan: {
              templateLabel: messages.planTemplateLabel.replace(
                "{name}",
                selectedPlanTemplate.name
              ),
              state: currentPlan === null ? "idle" : "active",
              primaryLabel: currentPlan?.label ?? messages.planIdle,
              timeRangeLabel: currentPlan === null
                ? "—"
                : formatPlanRange(
                  currentPlan.startMinute,
                  currentPlan.endMinute
                ),
              statusLabel: currentPlan === null || planProgress === null
                ? messages.planIdle
                : [
                  messages.planInProgress,
                  messages.planProgress.replace(
                    "{percent}",
                    Math.floor(planProgress * 100).toLocaleString(locale)
                  )
                ].join(" · "),
              remainingLabel: currentPlan === null
                || planEvaluation.remainingMinutes === null
                ? null
                : messages.planRemaining.replace(
                  "{duration}",
                  formatPlanDuration(
                    planEvaluation.remainingMinutes,
                    messages,
                    locale
                  )
                ),
              progress: planProgress,
              nextTitle: messages.planNext,
              nextLabel: nextPlan?.period.label ?? messages.planNoNext,
              nextTimeLabel: nextPlan === null
                ? ""
                : formatPlanMinute(nextPlan.period.startMinute),
              nextDayLabel: nextPlan === null || localTime === null
                ? null
                : formatNextPlanDay(
                  localTime.dateKey,
                  nextPlan.dayOffset,
                  locale,
                  messages.planTomorrow
                ),
              scheduleLabel: messages.planFullSchedule,
              emptyScheduleLabel: messages.planNoSchedule,
              schedule: archivePlanSchedule
            }
          })
      },
      {
        id: "journal",
        size: "standard",
        title: messages.journalModuleTitle,
        icon: "notebook-pen",
        state: journalReady ? "ready" : "unconfigured",
        emptyState: {
          icon: "file-pen-line",
          title: journalEmptyState.title,
          description: journalEmptyState.description,
          actionLabel: messages.journalEmptyAction,
          settingsSection: "journal"
        },
        ...(journalReady
          ? {
            journal: {
              path: journalRuntime.path,
              dateKey: selectedJournalDate,
              dateLabel: selectedJournalDate === ""
                ? ""
                : formatJournalDate(selectedJournalDate),
              weekdayLabel: selectedJournalDate === ""
                ? ""
                : new Intl.DateTimeFormat(locale, {
                  weekday: "long",
                  timeZone: "UTC"
                }).format(parseDateKey(selectedJournalDate)),
              content: journalContent,
              viewMode: data.journal.viewMode,
              canMoveNext: selectedJournalDate < todayKey,
              previousLabel: messages.journalPreviousDate,
              nextLabel: messages.journalNextDate,
              editorLabel: messages.journalEditorLabel.replace(
                "{date}",
                selectedJournalDate
              ),
              editLabel: messages.journalViewModeEdit,
              previewLabel: messages.journalViewModePreview,
              deleteLabel: messages.journalDeleteEntry,
              canDelete: selectedJournalSection !== undefined,
              emptyPreviewLabel: messages.journalEmptyPreview,
              conflict: journalConflict
                ? {
                  title: messages.journalConflictTitle,
                  description: messages.journalConflictDescription,
                  copyLabel: messages.journalCopyDraft,
                  reloadLabel: messages.journalReloadExternal,
                  openSourceLabel: messages.journalOpenSource
                }
                : null
            }
          }
          : {})
      },
      {
        id: "tasks",
        size: "standard",
        title: messages.tasksModuleTitle,
        icon: "list-checks",
        state: taskReady ? "ready" : "unconfigured",
        emptyState: {
          icon: "square-check-big",
          title: taskEmptyState.title,
          description: taskEmptyState.description,
          actionLabel: messages.tasksEmptyAction,
          settingsSection: "tasks"
        },
        ...(taskReady
          ? {
            tasks: {
              path: taskInput.path,
              listLabel: messages.tasksListLabel,
              progressLabel: messages.tasksProgress
                .replace(
                  "{completed}",
                  activeTaskRecords
                    .filter((task) => task.completed)
                    .length
                    .toString()
                )
                .replace("{total}", activeTaskRecords.length.toString()),
              archiveAllLabel: completedTaskRecords.length === 0
                ? null
                : messages.tasksArchiveAll,
              archiveToggleLabel: archivedTaskRecords.length === 0
                ? null
                : taskInteraction?.archiveVisible
                  ? messages.tasksHideArchive
                  : messages.tasksShowArchive,
              archiveVisible:
                archivedTaskRecords.length > 0
                && (taskInteraction?.archiveVisible ?? false),
              archiveListLabel: messages.tasksArchiveListLabel,
              archiveEmptyLabel: messages.tasksNoArchived,
              addPlaceholder: messages.tasksAddPlaceholder,
              addLabel: messages.tasksAdd,
              emptyLabel: messages.tasksNoActive,
              conflict: taskConflict
                ? {
                  title: messages.tasksConflictTitle,
                  description: messages.tasksConflictDescription,
                  copyLabel: interactionState.type === "conflict"
                    ? interactionState.draftText === null
                      ? null
                      : messages.tasksCopyDraft
                    : messages.tasksCopyDraft,
                  reloadLabel: messages.tasksReloadExternal,
                  openSourceLabel: messages.tasksOpenSource
                }
                : null,
              showMoreLabel: messages.tasksShowMore,
              showMoreArchiveLabel: messages.tasksShowMoreArchive,
              hasMoreItems: taskItems.length > (
                taskInteraction?.visibleLimit ?? taskItems.length
              ),
              hasMoreArchivedItems: archivedTaskRecords.length > (
                taskInteraction?.archivedVisibleLimit
                  ?? archivedTaskRecords.length
              ),
              items: taskItems.slice(
                0,
                taskInteraction?.visibleLimit ?? taskItems.length
              ).map((task) => ({
                target: task.target,
                text: task.text,
                completed: task.completed,
                editingText:
                  interactionState.type === "editing"
                  && editingRecord?.lineStart === task.lineStart
                    ? interactionState.text
                    : null,
                checkboxLabel: (
                  task.completed
                    ? messages.tasksReopen
                    : messages.tasksComplete
                ).replace("{task}", task.text),
                editLabel: messages.tasksEdit.replace("{task}", task.text),
                archiveLabel: task.completed
                  ? messages.tasksArchive.replace("{task}", task.text)
                  : null,
                deleteLabel: messages.tasksDelete.replace("{task}", task.text),
                saveLabel: messages.tasksSaveEdit,
                cancelLabel: messages.cancel
              })),
              archivedItems: archivedTaskRecords.slice(
                0,
                taskInteraction?.archivedVisibleLimit
                  ?? archivedTaskRecords.length
              ).map((task) => ({
                target: task.target,
                text: task.text,
                unarchiveLabel: messages.tasksUnarchive.replace(
                  "{task}",
                  task.text
                )
              }))
            }
          }
          : {})
      },
      {
        id: "file-groups",
        size: "standard",
        title: messages.fileGroupsModuleTitle,
        icon: "folders",
        state: data.fileGroups.length === 0 ? "unconfigured" : "ready",
        emptyState: {
          icon: "folder-plus",
          title: messages.fileGroupsEmptyTitle,
          description: messages.fileGroupsEmptyDescription,
          actionLabel: messages.fileGroupsEmptyAction,
          settingsSection: "file-groups"
        },
        ...(!fileGroupsVisible || data.fileGroups.length === 0
          ? {}
          : {
            fileGroups: {
              manageLabel: messages.fileGroupsManage,
              listLabel: messages.fileGroupsListLabel,
              emptyGroupLabel: messages.fileGroupsGroupEmpty,
              showMoreLabel: messages.fileGroupsShowMore,
              hasMoreEntries: data.fileGroups.reduce(
                (total, group) => total + group.entries.length,
                0
              ) > (fileEntryInput?.visibleLimit ?? Number.POSITIVE_INFINITY),
              groups: (() => {
                let remaining = fileEntryInput?.visibleLimit
                  ?? Number.POSITIVE_INFINITY;
                return data.fileGroups.flatMap((group) => {
                  if (group.entries.length > 0 && remaining <= 0) {
                    return [];
                  }
                  const visibleEntries = group.entries.slice(0, remaining);
                  remaining -= visibleEntries.length;
                  return [{
                id: group.id,
                name: group.name,
                entries: buildFileEntryLabels(visibleEntries).map((entry) => {
                  const state = fileEntryInput?.getStatus(entry.path)
                    ?? "ready";
                  const statusLabel = state === "missing"
                    ? messages.fileGroupsMissingFile
                    : state === "invalid"
                      ? messages.fileGroupsInvalidTarget
                      : null;
                  return {
                    ...entry,
                    state,
                    statusLabel,
                    accessibleLabel: (
                      state === "ready"
                        ? messages.fileGroupsOpenFile
                        : messages.fileGroupsUnavailableEntry
                    ).replace("{path}", entry.path)
                  };
                })
                  }];
                });
              })()
            }
          })
      }
    ]
  };
  const modulesById = new Map(
    shell.modules.map((module) => [module.id, module])
  );
  let archiveModuleIndex = 0;
  const modules = layout.moduleOrder.flatMap((moduleId) => {
    const module = modulesById.get(moduleId);
    if (module === undefined || layout.hiddenModules.includes(moduleId)) {
      return [];
    }
    const cosmicCopy = data.theme === "cosmic-cartography"
      ? getCosmicModuleCopy(moduleId, messages)
      : null;
    const title = data.theme === "archive-observatory"
      ? getArchiveModuleTitle(moduleId, archiveModuleIndex += 1, messages)
      : cosmicCopy?.title ?? module.title;
    return [{
      ...module,
      title,
      size: layout.sizes[moduleId] ?? "standard"
    }];
  });
  return {
    ...shell,
    banner: {
      ...shell.banner,
      visible: layout.bannerVisible
    },
    modules
  };
};
