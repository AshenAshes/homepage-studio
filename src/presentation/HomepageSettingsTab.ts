import {
  Component,
  Notice,
  normalizePath,
  PluginSettingTab,
  Setting,
  TFile,
  type App,
  type Plugin
} from "obsidian";
import type {
  HomepageApplicationFacade,
  BannerMutationResult,
  BannerSettings,
  DailyPlanMutationResult,
  DailyPlanSettings,
  FileGroupMutationResult,
  FileGroupSettings,
  PlanSettings,
  HeatmapSettings,
  HomepageTaskCreationResult,
  InterfaceAndStartupSettings,
  JournalSettings,
  JournalSourceActivationResult,
  JournalSourceCreationResult,
  LayoutMutationResult,
  LayoutSettings,
  TaskSettings,
  TaskSourceActivationResult
} from "../application/HomepageApplicationFacade";
import type { TaskSourceMutationResult } from
  "../application/services/TaskSourceService";
import type {
  HomepageSettingsSection,
  SettingsSectionRequestPort
} from "../application/ports/SettingsNavigation";
import type { LocalizationService } from "../application/services/LocalizationService";
import type { LocalePreference } from "../domain/data/types";
import type { TaskRecurrence } from "../domain/tasks/taskSource";
import type { HeatmapCountType } from "../application/services/HeatmapTrackingService";
import type { Messages } from "../localization/messages";
import {
  formatPlanMinute,
  normalizePlanLabel,
  parsePlanTime
} from "../domain/plans/dailyPlan";
import type {
  DailyTemplate,
  BannerTheme,
  ModuleId,
  ModuleSize,
  PlanPeriod,
  ThemeId,
  Weekday,
  WeeklyTemplate
} from "../domain/data/types";
import { WEEKDAYS } from "../domain/plans/weeklyPlan";
import { attachAccessibleLabel } from "./accessibility";
import { MarkdownFileSuggest } from "./MarkdownFileSuggest";
import { VaultFileSuggest } from "./VaultFileSuggest";
import {
  BANNER_THEME_IDS,
  isSupportedBannerImagePath
} from "../domain/banner/banner";

const isLocalePreference = (value: string): value is LocalePreference =>
  value === "auto" || value === "zh-cn" || value === "en";

const isHeatmapCountType = (value: string): value is HeatmapCountType =>
  value === "char" || value === "word";

const isThemeId = (value: string): value is ThemeId =>
  value === "klein-blue"
  || value === "watercolor-journal"
  || value === "celestial-orbit"
  || value === "minimal-paper"
  || value === "archive-observatory"
  || value === "cosmic-cartography";

const isBannerHeight = (
  value: string
): value is BannerTheme["height"] =>
  value === "compact"
  || value === "standard"
  || value === "tall";

const isAppearanceMode = (
  value: string
): value is "auto" | "light" | "dark" =>
  value === "auto" || value === "light" || value === "dark";

const isModuleSize = (value: string): value is ModuleSize =>
  value === "compact" || value === "standard" || value === "expanded";

const isTaskRecurrence = (value: string): value is TaskRecurrence =>
  value === "daily" || value === "weekly";

interface PlanPeriodOperations {
  readonly update: (
    update: Omit<PlanPeriod, "id">
  ) => DailyPlanMutationResult;
  readonly move: (offset: -1 | 1) => DailyPlanMutationResult;
  readonly remove: () => DailyPlanMutationResult;
}

type PlanPeriodInputResult =
  | {
    readonly type: "valid";
    readonly period: Omit<PlanPeriod, "id">;
  }
  | { readonly type: "invalid-label" }
  | { readonly type: "invalid-start-time" }
  | { readonly type: "invalid-end-time" };

export class HomepageSettingsTab extends PluginSettingTab {
  private activeSection: HomepageSettingsSection = "interface";
  private selectedBannerTheme: ThemeId = "klein-blue";
  private focusActiveTabAfterRender = false;
  private pendingPlanTemplateFocusId: string | null = null;
  private pendingFileGroupFocusId: string | null = null;
  private pendingLayoutModuleFocusId: ModuleId | null = null;
  private pendingLayoutControlFocus:
    "theme" | "appearance" | "banner" | "reset" | null = null;
  private pendingSettingsSearchFocus: {
    readonly section: HomepageSettingsSection;
    readonly name: string;
  } | null = null;
  private draggedLayoutModuleId: ModuleId | null = null;
  private draggedFileGroupId: string | null = null;
  private draggedFileEntry: {
    readonly groupId: string;
    readonly entryId: string;
  } | null = null;
  private fileGroupUndoTimer: number | null = null;
  private settingsScope: Component | null = null;
  private suggestionFileCache: readonly TFile[] | null = null;
  private fileEntryStateUnsubscribe: (() => void) | null = null;
  private taskStateUnsubscribe: (() => void) | null = null;

  public constructor(
    app: App,
    plugin: Plugin,
    private readonly application: HomepageApplicationFacade,
    private readonly localization: LocalizationService,
    private readonly settingsNavigation?: SettingsSectionRequestPort
  ) {
    super(app, plugin);
    this.selectedBannerTheme = this.application.getLayoutSettings().theme;
  }

  public getSettingDefinitions(): [] {
    // Obsidian 1.13 prefers declarative definitions, but an empty definition
    // list intentionally selects its supported fallback to this custom tab UI.
    return [];
  }

  public override display(): void {
    this.fileEntryStateUnsubscribe?.();
    this.fileEntryStateUnsubscribe = null;
    this.taskStateUnsubscribe?.();
    this.taskStateUnsubscribe = null;
    this.settingsScope?.unload();
    this.settingsScope = new Component();
    this.suggestionFileCache = null;
    this.settingsScope.registerEvent(this.app.vault.on(
      "create",
      () => this.invalidateSuggestionFileCache()
    ));
    this.settingsScope.registerEvent(this.app.vault.on(
      "delete",
      () => this.invalidateSuggestionFileCache()
    ));
    this.settingsScope.registerEvent(this.app.vault.on(
      "rename",
      () => this.invalidateSuggestionFileCache()
    ));
    this.clearFileGroupUndoTimer();
    const messages = this.localization.getMessages();
    const settings = this.application.getInterfaceAndStartupSettings();
    const targetSection = this.settingsNavigation?.consumeRequestedSection()
      ?? null;
    if (targetSection !== null) {
      this.activateSection(targetSection);
    }
    const headings = new Map<HomepageSettingsSection, Setting>();
    this.containerEl.empty();
    this.containerEl.addClass("homepage-studio-settings");
    this.renderSettingsTabs(messages);

    if (this.activeSection === "interface") {
      headings.set("interface", new Setting(this.containerEl)
        .setName(messages.interfaceAndStartupHeading)
        .setHeading());

      new Setting(this.containerEl)
        .setName(messages.interfaceLanguage)
        .setDesc(messages.interfaceLanguageDescription)
        .then((setting) => {
          this.addLocaleControl(setting, settings, messages);
        });

      new Setting(this.containerEl)
        .setName(messages.bannerTitleSetting)
        .setDesc(messages.bannerTitleSettingDescription)
        .then((setting) => {
          this.addBannerTitleControl(setting, settings);
        });

      new Setting(this.containerEl)
        .setName(messages.bannerSubtitleSetting)
        .setDesc(messages.bannerSubtitleSettingDescription)
        .then((setting) => {
          this.addBannerSubtitleControl(setting, settings);
        });

      new Setting(this.containerEl)
        .setName(messages.openOnStartup)
        .setDesc(messages.openOnStartupDescription)
        .then((setting) => {
          this.addStartupControl(setting, settings);
        });

      new Setting(this.containerEl)
        .setName(messages.openWhenWorkspaceEmpty)
        .setDesc(messages.openWhenWorkspaceEmptyDescription)
        .then((setting) => {
          this.addEmptyWorkspaceControl(setting, settings);
        });
    }

    if (this.activeSection === "layout") {
      headings.set("layout", new Setting(this.containerEl)
        .setName(messages.layoutModuleTitle)
        .setHeading());
      this.renderLayoutSettings(
        this.application.getLayoutSettings(),
        messages
      );
    }

    if (this.activeSection === "journal") {
      headings.set("journal", new Setting(this.containerEl)
        .setName(messages.journalModuleTitle)
        .setHeading());
      const journalSettings = this.application.getJournalSettings();
      new Setting(this.containerEl)
        .setName(messages.journalViewMode)
        .setDesc(messages.journalViewModeDescription)
        .then((setting) => {
          this.addJournalViewModeControl(setting, journalSettings, messages);
        });
      new Setting(this.containerEl)
        .setName(messages.journalDateSectionFile)
        .setDesc(messages.journalDateSectionFileDescription)
        .then((setting) => {
          this.addDateSectionFileControl(setting, journalSettings, messages);
        });
    }

    if (this.activeSection === "tasks") {
      headings.set("tasks", new Setting(this.containerEl)
        .setName(messages.tasksModuleTitle)
        .setHeading());
      const taskSettings = this.application.getTaskSettings();
      new Setting(this.containerEl)
        .setName(messages.tasksFile)
        .setDesc(messages.tasksFileDescription)
        .then((setting) => {
          this.addTaskFileControl(setting, taskSettings, messages);
        });
      new Setting(this.containerEl)
        .setName(messages.tasksShowCompleted)
        .setDesc(messages.tasksShowCompletedDescription)
        .addToggle((toggle) => {
          toggle
            .setValue(taskSettings.showCompleted)
            .setDisabled(!taskSettings.editable)
            .onChange((value) => {
              this.application.setShowCompletedTasks(value);
            });
        });
      this.renderRecurringTaskSettings(taskSettings, messages);
      this.taskStateUnsubscribe = this.application.subscribeTaskSettings(() => {
        if (this.activeSection === "tasks") {
          this.display();
        }
      });
    }

    if (this.activeSection === "plans") {
      headings.set("plans", new Setting(this.containerEl)
        .setName(messages.currentPlanModuleTitle)
        .setHeading());
      this.renderPlanSettings(
        this.application.getPlanSettings(),
        messages
      );
    }

    if (this.activeSection === "banner") {
      headings.set("banner", new Setting(this.containerEl)
        .setName(messages.bannerModuleTitle)
        .setHeading());
      this.renderBannerSettings(
        this.application.getBannerSettings(),
        messages
      );
    }

    if (this.activeSection === "file-groups") {
      headings.set("file-groups", new Setting(this.containerEl)
        .setName(messages.fileGroupsModuleTitle)
        .setHeading());
      this.renderFileGroupSettings(
        this.application.getFileGroupSettings(),
        messages
      );
      this.fileEntryStateUnsubscribe =
        this.application.subscribeFileEntryStates(() => {
          if (this.activeSection === "file-groups") {
            this.display();
          }
        });
    }

    if (this.activeSection === "heatmap") {
      headings.set("heatmap", new Setting(this.containerEl)
        .setName(messages.heatmapModuleTitle)
        .setHeading());
      new Setting(this.containerEl)
        .setName(messages.heatmapCountType)
        .setDesc(messages.heatmapCountTypeDescription)
        .addDropdown((dropdown) => {
          const heatmapSettings = this.application.getHeatmapSettings();
          dropdown
            .addOption("char", messages.heatmapCountTypeCharacter)
            .addOption("word", messages.heatmapCountTypeWord)
            .setValue(heatmapSettings.countType)
            .setDisabled(!heatmapSettings.editable)
            .onChange((value) => {
              if (isHeatmapCountType(value)) {
                this.application.setHeatmapCountType(value);
              }
            });
        });
      new Setting(this.containerEl)
        .setName(messages.heatmapDateRange)
        .setDesc(messages.heatmapDateRangeDescription)
        .then((setting) => {
          this.addHeatmapDateRangeControls(
            setting,
            this.application.getHeatmapSettings(),
            messages
          );
        });
      new Setting(this.containerEl)
        .setName(messages.heatmapWeekStart)
        .setDesc(messages.heatmapWeekStartDescription)
        .then((setting) => {
          this.addHeatmapWeekStartControl(
            setting,
            this.application.getHeatmapSettings(),
            messages
          );
        });
      new Setting(this.containerEl)
        .setName(messages.heatmapThresholds)
        .setDesc(messages.heatmapThresholdsDescription)
        .then((setting) => {
          this.addHeatmapThresholdControl(
            setting,
            this.application.getHeatmapSettings()
          );
        });
      new Setting(this.containerEl)
        .setName(messages.heatmapExcludeFolders)
        .setDesc(messages.heatmapExcludeFoldersDescription)
        .then((setting) => {
          this.addHeatmapExcludeFoldersControl(
            setting,
            this.application.getHeatmapSettings()
          );
        });
      new Setting(this.containerEl)
        .setName(messages.heatmapRetention)
        .setDesc(messages.heatmapRetentionDescription)
        .then((setting) => {
          this.addHeatmapRetentionControl(
            setting,
            this.application.getHeatmapSettings()
          );
        });
    }

    if (this.activeSection === "data-management") {
      headings.set("data-management", new Setting(this.containerEl)
        .setName(messages.dataManagementHeading)
        .setHeading());
      this.renderDataManagement(messages);
    }

    const searchFocus = this.pendingSettingsSearchFocus;
    if (
      searchFocus !== null
      && searchFocus.section === this.activeSection
    ) {
      this.pendingSettingsSearchFocus = null;
      this.focusSettingName(
        searchFocus.name,
        headings.get(this.activeSection)
      );
    } else if (targetSection !== null) {
      this.focusHeading(headings.get(targetSection));
    }
  }

  public override hide(): void {
    this.fileEntryStateUnsubscribe?.();
    this.fileEntryStateUnsubscribe = null;
    this.taskStateUnsubscribe?.();
    this.taskStateUnsubscribe = null;
    this.settingsScope?.unload();
    this.settingsScope = null;
    this.suggestionFileCache = null;
    this.clearFileGroupUndoTimer();
    this.selectedBannerTheme = this.application.getLayoutSettings().theme;
    super.hide();
  }

  private activateSection(section: HomepageSettingsSection): void {
    this.activeSection = section;
    if (section === "banner") {
      this.selectedBannerTheme = this.application.getLayoutSettings().theme;
    }
  }

  private renderSettingsTabs(messages: Messages): void {
    const sections: readonly {
      readonly id: HomepageSettingsSection;
      readonly label: string;
      readonly keywords: readonly string[];
    }[] = [
      {
        id: "interface",
        label: messages.interfaceAndStartupHeading,
        keywords: [
          messages.interfaceAndStartupHeading,
          messages.interfaceLanguage,
          messages.bannerTitleSetting,
          messages.bannerSubtitleSetting,
          messages.openOnStartup,
          messages.openWhenWorkspaceEmpty
        ]
      },
      {
        id: "layout",
        label: messages.layoutModuleTitle,
        keywords: [
          messages.layoutModuleTitle,
          messages.layoutTheme,
          messages.layoutAppearance,
          messages.layoutModulesHeading,
          messages.layoutBannerVisible,
          messages.bannerMinimalPaperDisabledTitle,
          messages.layoutModuleVisible,
          messages.layoutModuleSize,
          messages.layoutRestoreDefault
        ]
      },
      {
        id: "journal",
        label: messages.journalModuleTitle,
        keywords: [
          messages.journalModuleTitle,
          messages.journalViewMode,
          messages.journalDateSectionFile
        ]
      },
      {
        id: "tasks",
        label: messages.tasksModuleTitle,
        keywords: [
          messages.tasksModuleTitle,
          messages.tasksFile,
          messages.tasksShowCompleted
        ]
      },
      {
        id: "plans",
        label: messages.currentPlanModuleTitle,
        keywords: [
          messages.currentPlanModuleTitle,
          messages.planMode,
          messages.planDailyTemplatesHeading,
          messages.planWeeklyTemplatesHeading,
          messages.planSelectedTemplate,
          messages.planCreateTemplate,
          messages.planSelectedWeeklyTemplate,
          messages.planCreateWeeklyTemplate,
          messages.planTemplateNamePlaceholder,
          messages.planPeriods,
          messages.planAddPeriod
        ]
      },
      {
        id: "banner",
        label: messages.bannerModuleTitle,
        keywords: [
          messages.bannerModuleTitle,
          messages.bannerGlobalSource,
          messages.bannerCurrentSource,
          messages.bannerVaultSource,
          messages.bannerRemoteSource,
          messages.bannerTheme,
          messages.bannerThemeConfiguration,
          messages.bannerThemeSourceMode,
          messages.bannerMinimalPaperDisabledTitle,
          messages.bannerHeight,
          messages.bannerFocalPoint,
          messages.bannerFocalPointX,
          messages.bannerFocalPointY
        ]
      },
      {
        id: "file-groups",
        label: messages.fileGroupsModuleTitle,
        keywords: [
          messages.fileGroupsModuleTitle,
          messages.fileGroupsCreate,
          messages.fileGroupsName,
          messages.fileGroupsAddFile,
          messages.fileGroupsReplaceFile
        ]
      },
      {
        id: "heatmap",
        label: messages.heatmapModuleTitle,
        keywords: [
          messages.heatmapModuleTitle,
          messages.heatmapCountType,
          messages.heatmapDateRange,
          messages.heatmapWeekStart,
          messages.heatmapThresholds,
          messages.heatmapExcludeFolders,
          messages.heatmapRetention
        ]
      },
      {
        id: "data-management",
        label: messages.dataManagementHeading,
        keywords: [
          messages.dataManagementHeading,
          messages.dataManagementPlatform,
          messages.dataManagementPrivacy,
          messages.dataManagementDiagnostics,
          messages.dataManagementBackupHeading,
          messages.reloadPluginData,
          messages.resetPluginData
        ]
      }
    ];
    const stickyTabs = this.containerEl.createDiv({
      cls: "homepage-studio-settings-tabs-sticky"
    });
    const search = stickyTabs.createEl("input", {
      cls: "homepage-studio-settings-search",
      attr: {
        type: "search",
        "aria-label": messages.settingsSearchLabel,
        placeholder: messages.settingsSearchPlaceholder,
        autocomplete: "off",
        spellcheck: "false"
      }
    });
    const resultsRegion = stickyTabs.createDiv({
      cls: "homepage-studio-settings-search-results",
      attr: {
        role: "region",
        hidden: ""
      }
    });
    attachAccessibleLabel(
      resultsRegion,
      resultsRegion,
      messages.settingsSearchLabel
    );
    const resultsList = resultsRegion.createDiv({
      cls: "homepage-studio-settings-search-result-list"
    });
    const tabList = stickyTabs.createDiv({
      cls: "homepage-studio-settings-tabs",
      attr: {
        role: "tablist"
      }
    });
    attachAccessibleLabel(
      tabList,
      tabList,
      messages.settingsSectionsLabel
    );
    sections.forEach((section, index) => {
      const selected = section.id === this.activeSection;
      const tab = tabList.createEl("button", {
        cls: "homepage-studio-settings-tab",
        text: section.label,
        attr: {
          type: "button",
          role: "tab",
          "aria-selected": selected.toString(),
          tabindex: selected ? "0" : "-1"
        }
      });
      tab.onclick = () => {
        this.activateSection(section.id);
        this.focusActiveTabAfterRender = true;
        this.display();
      };
      tab.onkeydown = (event) => {
        const targetIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? sections.length - 1
            : event.key === "ArrowLeft"
              ? (index - 1 + sections.length) % sections.length
              : event.key === "ArrowRight"
                ? (index + 1) % sections.length
                : null;
        if (targetIndex === null) {
          return;
        }
        const target = sections[targetIndex];
        if (target === undefined) {
          return;
        }
        event.preventDefault();
        this.activateSection(target.id);
        this.focusActiveTabAfterRender = true;
        this.display();
      };
    });
    const renderSearchResults = (): HTMLButtonElement[] => {
      const query = search.value.trim().toLocaleLowerCase();
      resultsList.empty();
      if (query === "") {
        resultsRegion.setAttribute("hidden", "");
        return [];
      }
      resultsRegion.removeAttribute("hidden");
      const matches = sections.flatMap((section) =>
        section.keywords
          .filter((keyword) =>
            keyword.toLocaleLowerCase().includes(query)
          )
          .map((keyword) => ({
            section,
            keyword
          }))
      );
      if (matches.length === 0) {
        resultsList.createEl("p", {
          cls: "homepage-studio-settings-search-empty",
          text: messages.settingsSearchNoResults,
          attr: {
            role: "status",
            "aria-live": "polite"
          }
        });
        return [];
      }
      return matches.map(({ section, keyword }) => {
        const result = resultsList.createEl("button", {
          cls: "homepage-studio-settings-search-result",
          text: keyword === section.label
            ? section.label
            : `${section.label} · ${keyword}`,
          attr: { type: "button" }
        });
        result.onclick = () => {
          this.activateSection(section.id);
          this.focusActiveTabAfterRender = false;
          this.pendingSettingsSearchFocus = {
            section: section.id,
            name: keyword
          };
          this.display();
        };
        return result;
      });
    };
    search.oninput = () => {
      renderSearchResults();
    };
    search.onkeydown = (event) => {
      if (event.key === "Escape" && search.value !== "") {
        event.preventDefault();
        search.value = "";
        renderSearchResults();
        return;
      }
      if (event.key !== "Enter" && event.key !== "ArrowDown") {
        return;
      }
      const firstResult = resultsList.querySelector<HTMLButtonElement>(
        ".homepage-studio-settings-search-result"
      ) ?? renderSearchResults()[0];
      if (firstResult === undefined) {
        return;
      }
      event.preventDefault();
      if (event.key === "Enter") {
        firstResult.click();
      } else {
        firstResult.focus();
      }
    };
    if (this.focusActiveTabAfterRender) {
      this.focusActiveTabAfterRender = false;
      tabList.querySelector<HTMLButtonElement>(
        '[role="tab"][aria-selected="true"]'
      )?.focus();
    }
  }

  private renderDataManagement(messages: Messages): void {
    const snapshot = this.application.getSnapshot();
    new Setting(this.containerEl)
      .setName(messages.dataManagementPlatform)
      .setDesc(messages.dataManagementPlatformDescription);
    new Setting(this.containerEl)
      .setName(messages.dataManagementPrivacy)
      .setDesc(messages.dataManagementPrivacyDescription);
    new Setting(this.containerEl)
      .setName(messages.dataManagementDiagnostics)
      .setDesc(messages.dataManagementDiagnosticsDescription)
      .setHeading();
    const diagnostics = this.containerEl.createDiv({
      cls: "homepage-studio-data-diagnostics",
      attr: {
        "data-state": snapshot.status
      }
    });
    diagnostics.createEl("p", {
      cls: "homepage-studio-data-state",
      text: snapshot.status === "safe-mode"
        ? messages.dataManagementSafeMode
        : messages.dataManagementReady
    });
    if (snapshot.diagnostics.length === 0) {
      diagnostics.createEl("p", {
        cls: "homepage-studio-data-diagnostics-empty",
        text: messages.dataManagementDiagnosticsNone
      });
    } else {
      const list = diagnostics.createEl("ul", {
        cls: "homepage-studio-data-diagnostic-list"
      });
      for (const diagnostic of snapshot.diagnostics) {
        const item = list.createEl("li");
        item.createEl("code", { text: diagnostic.code });
        item.createSpan({ text: diagnostic.message });
        if (diagnostic.details !== undefined) {
          item.createEl("pre", { text: diagnostic.details });
        }
        item.createEl("pre", {
          text: diagnostic.relatedPaths.join("\n")
        });
        item.createEl("p", { text: diagnostic.suggestedAction });
      }
    }
    const report = diagnostics.createEl("pre", {
      cls: "homepage-studio-diagnostic-report",
      text: this.application.getDiagnosticReport()
    });
    report.setAttribute("tabindex", "0");
    const diagnosticActions = diagnostics.createDiv({
      cls: "homepage-studio-data-actions"
    });
    const reload = diagnosticActions.createEl("button", {
      text: messages.reloadPluginData,
      attr: { type: "button" }
    });
    reload.onclick = () => {
      void this.application.reloadPluginData().then(() => {
        this.refreshSettings();
      });
    };
    diagnostics.createEl("p", {
      cls: "homepage-studio-data-note",
      text: messages.dataManagementReloadDescription
    });

    new Setting(this.containerEl)
      .setName(messages.dataManagementBackupHeading)
      .setDesc(messages.dataManagementBackupDescription)
      .setHeading();
    new Setting(this.containerEl)
      .setName(messages.resetPluginData)
      .setDesc(messages.dataManagementResetDescription)
      .addButton((button) => {
        button
          .setButtonText(messages.resetPluginData)
          .onClick(() => {
            void this.application.resetPluginData().then((result) => {
              if (result === "reset") {
                this.display();
              }
            });
          });
        button.buttonEl.addClass("mod-warning");
      });
  }

  private renderLayoutSettings(
    settings: LayoutSettings,
    messages: Messages
  ): void {
    const scope = this.settingsScope;
    if (scope === null) {
      return;
    }
    const region = this.containerEl.createDiv({
      cls: "homepage-studio-layout-settings"
    });
    const error = region.createEl("p", {
      cls: "homepage-studio-layout-settings-error",
      attr: {
        role: "alert",
        "aria-live": "polite"
      }
    });

    new Setting(region)
      .then((setting) => {
        setting.settingEl.setAttribute("data-layout-control", "theme");
      })
      .setName(messages.layoutTheme)
      .setDesc(messages.layoutThemeDescription)
      .addDropdown((dropdown) => {
        for (const theme of BANNER_THEME_IDS) {
          dropdown.addOption(
            theme,
            this.getBannerThemeLabel(theme, messages)
          );
        }
        dropdown
          .setValue(settings.theme)
          .setDisabled(!settings.editable)
          .onChange((value) => {
            if (!isThemeId(value)) {
              return;
            }
            const result = this.application.setHomepageTheme(value);
            if (result.type === "applied") {
              this.selectedBannerTheme = value;
            }
            this.handleLayoutMutation(
              result,
              error,
              messages,
              null,
              "theme"
            );
          });
      });

    new Setting(region)
      .then((setting) => {
        setting.settingEl.setAttribute("data-layout-control", "appearance");
      })
      .setName(messages.layoutAppearance)
      .setDesc(messages.layoutAppearanceDescription)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("auto", messages.layoutAppearanceAuto)
          .addOption("light", messages.layoutAppearanceLight)
          .addOption("dark", messages.layoutAppearanceDark)
          .setValue(settings.appearanceMode)
          .setDisabled(!settings.editable)
          .onChange((value) => {
            if (isAppearanceMode(value)) {
              this.handleLayoutMutation(
                this.application.setHomepageAppearanceMode(value),
                error,
                messages,
                null,
                "appearance"
              );
            }
          });
      });

    if (settings.theme === "minimal-paper") {
      new Setting(region)
        .setName(messages.bannerMinimalPaperDisabledTitle)
        .setDesc(messages.bannerMinimalPaperDisabledDescription)
        .then((setting) => {
          setting.settingEl.setAttribute(
            "data-layout-control",
            "banner-unavailable"
          );
        });
    } else {
      new Setting(region)
        .then((setting) => {
          setting.settingEl.setAttribute("data-layout-control", "banner");
        })
        .setName(messages.layoutBannerVisible)
        .setDesc(messages.layoutBannerVisibleDescription)
        .addToggle((toggle) => {
          toggle
            .setValue(settings.layout.bannerVisible)
            .setDisabled(!settings.editable)
            .onChange((value) => {
              this.handleLayoutMutation(
                this.application.setLayoutBannerVisible(value),
                error,
                messages,
                null,
                "banner"
              );
            });
        });
    }

    new Setting(region)
      .setName(messages.layoutModulesHeading)
      .setDesc(messages.layoutModulesDescription)
      .setHeading();

    for (
      const [moduleIndex, moduleId]
      of settings.layout.moduleOrder.entries()
    ) {
      const card = region.createEl("section", {
        cls: "homepage-studio-layout-module-card",
        attr: {
          "data-layout-module-id": moduleId,
          "data-visible": (
            !settings.layout.hiddenModules.includes(moduleId)
          ).toString()
        }
      });
      const heading = new Setting(card)
        .setName(this.getLayoutModuleLabel(moduleId, messages))
        .setHeading()
        .addButton((button) => {
          button
            .setButtonText(messages.layoutMoveUp)
            .setDisabled(!settings.editable || moduleIndex === 0)
            .onClick(() => {
              this.handleLayoutMutation(
                this.application.moveLayoutModule(moduleId, -1),
                error,
                messages,
                moduleId
              );
            });
        })
        .addButton((button) => {
          button
            .setButtonText(messages.layoutMoveDown)
            .setDisabled(
              !settings.editable
              || moduleIndex === settings.layout.moduleOrder.length - 1
            )
            .onClick(() => {
              this.handleLayoutMutation(
                this.application.moveLayoutModule(moduleId, 1),
                error,
                messages,
                moduleId
              );
            });
        });
      const dragHandle = heading.settingEl.querySelector<HTMLElement>(
        ".setting-item-info"
      );
      if (dragHandle !== null) {
        dragHandle.draggable = settings.editable;
        dragHandle.addClass("homepage-studio-layout-drag-handle");
        scope.registerDomEvent(dragHandle, "dragstart", (event) => {
          this.draggedLayoutModuleId = moduleId;
          event.dataTransfer?.setData("text/plain", moduleId);
          if (event.dataTransfer !== null) {
            event.dataTransfer.effectAllowed = "move";
          }
        });
        scope.registerDomEvent(dragHandle, "dragend", () => {
          this.draggedLayoutModuleId = null;
        });
      }
      scope.registerDomEvent(card, "dragover", (event) => {
        if (
          this.draggedLayoutModuleId !== null
          && this.draggedLayoutModuleId !== moduleId
        ) {
          event.preventDefault();
        }
      });
      scope.registerDomEvent(card, "drop", (event) => {
        const sourceId = this.draggedLayoutModuleId;
        if (sourceId === null || sourceId === moduleId) {
          return;
        }
        event.preventDefault();
        this.draggedLayoutModuleId = null;
        this.moveLayoutModuleTo(
          settings,
          sourceId,
          moduleId,
          error,
          messages
        );
      });

      new Setting(card)
        .setName(messages.layoutModuleVisible)
        .addToggle((toggle) => {
          toggle
            .setValue(!settings.layout.hiddenModules.includes(moduleId))
            .setDisabled(!settings.editable)
            .onChange((value) => {
              this.handleLayoutMutation(
                this.application.setLayoutModuleVisibility(moduleId, value),
                error,
                messages,
                moduleId
              );
            });
        });
      if (settings.theme !== "archive-observatory") {
        new Setting(card)
          .setName(messages.layoutModuleSize)
          .addDropdown((dropdown) => {
            dropdown
              .addOption("compact", messages.layoutSizeCompact)
              .addOption("standard", messages.layoutSizeStandard)
              .addOption("expanded", messages.layoutSizeExpanded)
              .setValue(settings.layout.sizes[moduleId] ?? "standard")
              .setDisabled(!settings.editable)
              .onChange((value) => {
                if (isModuleSize(value)) {
                  this.handleLayoutMutation(
                    this.application.setLayoutModuleSize(moduleId, value),
                    error,
                    messages,
                    moduleId
                  );
                }
              });
          });
      }

      if (this.pendingLayoutModuleFocusId === moduleId) {
        this.pendingLayoutModuleFocusId = null;
        card.scrollIntoView?.({ block: "nearest" });
        card.querySelector<HTMLElement>(
          "button:not([disabled]), select:not([disabled]), input:not([disabled])"
        )?.focus();
      }
    }

    new Setting(region)
      .then((setting) => {
        setting.settingEl.setAttribute("data-layout-control", "reset");
      })
      .setName(messages.layoutRestoreDefault)
      .setDesc(messages.layoutRestoreDefaultDescription)
      .addButton((button) => {
        button
          .setButtonText(messages.layoutRestoreDefault)
          .setDisabled(!settings.editable || !settings.hasOverride)
          .onClick(async () => {
            button.setDisabled(true);
            const result = await this.application.resetCurrentThemeLayout();
            if (result.type !== "applied") {
              button.setDisabled(false);
            }
            this.handleLayoutMutation(
              result,
              error,
              messages,
              null,
              "reset"
            );
          });
      });

    if (!settings.editable) {
      error.setText(messages.layoutUnavailable);
    }
    if (this.pendingLayoutControlFocus !== null) {
      const controlName = this.pendingLayoutControlFocus;
      this.pendingLayoutControlFocus = null;
      const setting = region.querySelector<HTMLElement>(
        `[data-layout-control="${controlName}"]`
      );
      setting?.scrollIntoView?.({ block: "nearest" });
      if (controlName === "reset") {
        const label = setting?.querySelector<HTMLElement>(
          ".setting-item-name"
        );
        label?.setAttribute("tabindex", "-1");
        label?.focus();
      } else {
        setting?.querySelector<HTMLElement>(
          "select:not([disabled]), input:not([disabled]), button:not([disabled])"
        )?.focus();
      }
    }
  }

  private getLayoutModuleLabel(
    moduleId: ModuleId,
    messages: Messages
  ): string {
    return {
      heatmap: messages.heatmapModuleTitle,
      journal: messages.journalModuleTitle,
      tasks: messages.tasksModuleTitle,
      "current-plan": messages.currentPlanModuleTitle,
      "file-groups": messages.fileGroupsModuleTitle
    }[moduleId];
  }

  private handleLayoutMutation(
    result: LayoutMutationResult,
    error: HTMLElement,
    messages: Messages,
    focusId: ModuleId | null = null,
    focusControl:
      "theme" | "appearance" | "banner" | "reset" | null = null
  ): void {
    if (result.type === "applied") {
      this.pendingLayoutModuleFocusId = focusId;
      this.pendingLayoutControlFocus = focusControl;
      this.refreshSettings();
      return;
    }
    if (result.type === "cancelled") {
      return;
    }
    error.setText(messages.layoutUnavailable);
  }

  private moveLayoutModuleTo(
    settings: LayoutSettings,
    sourceId: ModuleId,
    targetId: ModuleId,
    error: HTMLElement,
    messages: Messages
  ): void {
    const sourceIndex = settings.layout.moduleOrder.indexOf(sourceId);
    const targetIndex = settings.layout.moduleOrder.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return;
    }
    const offset = sourceIndex < targetIndex ? 1 : -1;
    let result: LayoutMutationResult = { type: "applied" };
    for (
      let step = 0;
      step < Math.abs(targetIndex - sourceIndex);
      step += 1
    ) {
      result = this.application.moveLayoutModule(sourceId, offset);
      if (result.type !== "applied") {
        break;
      }
    }
    this.handleLayoutMutation(result, error, messages, sourceId);
  }

  private renderBannerSettings(
    settings: BannerSettings,
    messages: Messages
  ): void {
    const region = this.containerEl.createDiv({
      cls: "homepage-studio-banner-settings"
    });
    const error = region.createEl("p", {
      cls: "homepage-studio-banner-settings-error",
      attr: {
        role: "alert"
      }
    });

    new Setting(region)
      .setName(messages.bannerGlobalSource)
      .setDesc(messages.bannerGlobalSourceDescription)
      .setHeading();
    new Setting(region)
      .setName(messages.bannerCurrentSource)
      .setDesc(this.formatBannerSource(
        settings.globalSource,
        messages
      ))
      .then((setting) => {
        if (settings.globalSource !== null) {
          setting.addButton((button) => {
            button
              .setButtonText(messages.bannerClearGlobalSource)
              .setDisabled(!settings.editable)
              .onClick(() => {
                this.handleBannerMutation(
                  this.application.clearGlobalBannerSource(),
                  error,
                  messages,
                  true
                );
              });
          });
        }
      });
    this.renderBannerSourceControls(
      region,
      settings.editable,
      (path) => this.application.setGlobalBannerVaultSource(path),
      (url) => this.application.setGlobalBannerRemoteSource(url),
      error,
      messages
    );

    new Setting(region)
      .setName(messages.bannerTheme)
      .setDesc(messages.bannerThemeConfigurationDescription)
      .setHeading();
    new Setting(region)
      .setName(messages.bannerThemeConfiguration)
      .setDesc(messages.bannerThemeConfigurationDescription)
      .addDropdown((dropdown) => {
        for (const theme of BANNER_THEME_IDS) {
          dropdown.addOption(theme, this.getBannerThemeLabel(
            theme,
            messages
          ));
        }
        dropdown
          .setValue(this.selectedBannerTheme)
          .setDisabled(!settings.editable)
          .onChange((value) => {
            if (isThemeId(value)) {
              this.selectedBannerTheme = value;
              this.display();
            }
          });
      });
    const selected = settings.themes.find(
      ({ theme }) => theme === this.selectedBannerTheme
    );
    if (selected === undefined) {
      region.appendChild(error);
      return;
    }
    if (selected.theme === "minimal-paper") {
      new Setting(region)
        .setName(messages.bannerMinimalPaperDisabledTitle)
        .setDesc(messages.bannerMinimalPaperDisabledDescription)
        .setHeading();
      region.appendChild(error);
      return;
    }
    const themeSettings = selected.settings;
    const sourceModeLabel = themeSettings.sourceMode === "inherit"
      ? messages.bannerThemeInherit
      : messages.bannerThemeOverride;
    new Setting(region)
      .setName(messages.bannerThemeSourceMode)
      .setDesc([
        sourceModeLabel,
        this.formatBannerSource(
          themeSettings.sourceMode === "override"
            ? themeSettings.source
            : settings.globalSource,
          messages
        )
      ].join(" · "))
      .then((setting) => {
        if (themeSettings.sourceMode === "override") {
          setting.addButton((button) => {
            button
              .setButtonText(messages.bannerRestoreInheritance)
              .setDisabled(!settings.editable)
              .onClick(() => {
                this.handleBannerMutation(
                  this.application.inheritThemeBannerSource(
                    this.selectedBannerTheme
                  ),
                  error,
                  messages,
                  true
                );
              });
          });
        }
      });
    this.renderBannerSourceControls(
      region,
      settings.editable,
      (path) => this.application.setThemeBannerVaultSource(
        this.selectedBannerTheme,
        path
      ),
      (url) => this.application.setThemeBannerRemoteSource(
        this.selectedBannerTheme,
        url
      ),
      error,
      messages
    );
    new Setting(region)
      .setName(messages.bannerHeight)
      .setDesc(messages.bannerHeightDescription)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("compact", messages.bannerHeightCompact)
          .addOption("standard", messages.bannerHeightStandard)
          .addOption("tall", messages.bannerHeightTall)
          .setValue(themeSettings.height)
          .setDisabled(!settings.editable)
          .onChange((value) => {
            if (isBannerHeight(value)) {
              this.handleBannerMutation(
                this.application.setThemeBannerHeight(
                  this.selectedBannerTheme,
                  value
                ),
                error,
                messages,
                false
              );
            }
          });
      });
    new Setting(region)
      .setName(messages.bannerFocalPoint)
      .setDesc(messages.bannerFocalPointDescription)
      .setHeading();
    let focalX = themeSettings.focalPoint.x;
    let focalY = themeSettings.focalPoint.y;
    const updateFocalPoint = (): void => {
      this.handleBannerMutation(
        this.application.setThemeBannerFocalPoint(
          this.selectedBannerTheme,
          focalX,
          focalY
        ),
        error,
        messages,
        false
      );
    };
    new Setting(region)
      .setName(messages.bannerFocalPointX)
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.max = "100";
        text.inputEl.step = "1";
        text
          .setValue(focalX.toString())
          .setDisabled(!settings.editable)
          .onChange((value) => {
            focalX = value.trim() === ""
              ? Number.NaN
              : Number(value);
            updateFocalPoint();
          });
      });
    new Setting(region)
      .setName(messages.bannerFocalPointY)
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.max = "100";
        text.inputEl.step = "1";
        text
          .setValue(focalY.toString())
          .setDisabled(!settings.editable)
          .onChange((value) => {
            focalY = value.trim() === ""
              ? Number.NaN
              : Number(value);
            updateFocalPoint();
          });
      });
    region.appendChild(error);
  }

  private renderBannerSourceControls(
    container: HTMLElement,
    editable: boolean,
    setVaultSource: (path: string) => BannerMutationResult,
    setRemoteSource: (url: string) => BannerMutationResult,
    error: HTMLElement,
    messages: Messages
  ): void {
    let vaultPath = "";
    let vaultInput: HTMLInputElement | null = null;
    new Setting(container)
      .setName(messages.bannerVaultSource)
      .setDesc(messages.bannerVaultSourceDescription)
      .addText((text) => {
        vaultInput = text.inputEl;
        text
          .setPlaceholder(messages.bannerVaultSourcePlaceholder)
          .setDisabled(!editable)
          .onChange((value) => {
            vaultPath = value;
          });
        this.registerInputSuggest(new VaultFileSuggest(
          this.app,
          text.inputEl,
          () => this.getSuggestionFiles(),
          (path) => {
            vaultPath = path;
          },
          (file) => isSupportedBannerImagePath(file.path)
        ));
      })
      .addButton((button) => {
        button
          .setButtonText(messages.bannerUseVaultSource)
          .setDisabled(!editable)
          .onClick(() => {
            const result = setVaultSource(normalizePath(vaultPath));
            this.handleBannerMutation(
              result,
              error,
              messages,
              true
            );
            if (result.type !== "applied") {
              vaultInput?.focus();
            }
          });
      });

    let remoteUrl = "";
    let remoteInput: HTMLInputElement | null = null;
    new Setting(container)
      .setName(messages.bannerRemoteSource)
      .setDesc(messages.bannerRemotePrivacyDescription)
      .addText((text) => {
        remoteInput = text.inputEl;
        text
          .setPlaceholder(messages.bannerRemoteSourcePlaceholder)
          .setDisabled(!editable)
          .onChange((value) => {
            remoteUrl = value;
          });
      })
      .addButton((button) => {
        button
          .setButtonText(messages.bannerUseRemoteSource)
          .setDisabled(!editable)
          .onClick(() => {
            const result = setRemoteSource(remoteUrl);
            this.handleBannerMutation(
              result,
              error,
              messages,
              true
            );
            if (result.type !== "applied") {
              remoteInput?.focus();
            }
          });
      });
  }

  private handleBannerMutation(
    result: BannerMutationResult,
    error: HTMLElement,
    messages: Messages,
    refresh: boolean
  ): void {
    if (result.type === "applied") {
      error.setText("");
      if (refresh) {
        this.display();
      }
      return;
    }
    error.setText({
      "invalid-file": messages.bannerInvalidFile,
      "invalid-url": messages.bannerInvalidUrl,
      "invalid-protocol": messages.bannerInvalidProtocol,
      "invalid-position": messages.bannerInvalidPosition,
      blocked: messages.bannerUnavailable
    }[result.type]);
  }

  private formatBannerSource(
    source: BannerSettings["globalSource"],
    messages: Messages
  ): string {
    return source === null
      ? messages.bannerNoCustomSource
      : source.value;
  }

  private getBannerThemeLabel(
    theme: ThemeId,
    messages: Messages
  ): string {
    return {
      "klein-blue": messages.themeKleinBlue,
      "watercolor-journal": messages.themeWatercolorJournal,
      "celestial-orbit": messages.themeCelestialOrbit,
      "minimal-paper": messages.themeMinimalPaper,
      "archive-observatory": messages.themeArchiveObservatory,
      "cosmic-cartography": messages.themeCosmicCartography
    }[theme];
  }

  private renderFileGroupSettings(
    settings: FileGroupSettings,
    messages: Messages
  ): void {
    const scope = this.settingsScope;
    if (scope === null) {
      return;
    }
    const region = this.containerEl.createDiv({
      cls: "homepage-studio-file-group-settings"
    });
    const error = region.createEl("p", {
      cls: "homepage-studio-file-group-settings-error",
      attr: {
        role: "alert",
        "aria-live": "polite"
      }
    });
    let groupName = "";
    new Setting(region)
      .setName(messages.fileGroupsCreate)
      .setDesc(messages.fileGroupsCreateDescription)
      .addText((text) => {
        text
          .setPlaceholder(messages.fileGroupsNamePlaceholder)
          .setDisabled(!settings.editable)
          .onChange((value) => {
            groupName = value;
          });
      })
      .addButton((button) => {
        button
          .setButtonText(messages.fileGroupsCreateAction)
          .setDisabled(!settings.editable)
          .onClick(() => {
            const result = this.application.createFileGroup(groupName);
            if (result.type === "applied" && result.id !== undefined) {
              this.pendingFileGroupFocusId = result.id;
            }
            this.handleFileGroupMutation(result, error, messages);
          });
      });

    if (settings.undo !== null) {
      new Setting(region)
        .setName(messages.fileGroupsUndoDescription.replace(
          "{path}",
          settings.undo.path
        ))
        .addButton((button) => {
          button
            .setButtonText(messages.fileGroupsUndoRemove)
            .onClick(() => {
              this.handleFileGroupMutation(
                this.application.undoRemovedFileGroupEntry(),
                error,
                messages
              );
            });
        });
      const targetWindow = this.containerEl.ownerDocument.defaultView;
      if (targetWindow !== null) {
        const delay = Math.max(0, settings.undo.expiresAt - Date.now());
        this.fileGroupUndoTimer = targetWindow.setTimeout(() => {
          this.fileGroupUndoTimer = null;
          if (this.activeSection === "file-groups") {
            this.refreshSettings();
          }
        }, delay);
      }
    }

    if (settings.groups.length === 0) {
      region.createEl("p", {
        cls: "homepage-studio-file-group-settings-empty",
        text: messages.fileGroupsSettingsEmpty
      });
      return;
    }

    for (const [groupIndex, group] of settings.groups.entries()) {
      const card = region.createEl("section", {
        cls: "homepage-studio-file-group-settings-card",
        attr: {
          "data-file-group-id": group.id
        }
      });
      const heading = new Setting(card)
        .setName(group.name)
        .setHeading()
        .addButton((button) => {
          button
            .setButtonText(messages.fileGroupsMoveGroupUp)
            .setDisabled(!settings.editable || groupIndex === 0)
            .onClick(() => {
              this.handleFileGroupMutation(
                this.application.moveFileGroup(group.id, -1),
                error,
                messages
              );
            });
        })
        .addButton((button) => {
          button
            .setButtonText(messages.fileGroupsMoveGroupDown)
            .setDisabled(
              !settings.editable
              || groupIndex === settings.groups.length - 1
            )
            .onClick(() => {
              this.handleFileGroupMutation(
                this.application.moveFileGroup(group.id, 1),
                error,
                messages
              );
            });
        });
      const groupDragHandle = heading.settingEl.querySelector<HTMLElement>(
        ".setting-item-info"
      );
      if (groupDragHandle !== null) {
        groupDragHandle.draggable = settings.editable;
        groupDragHandle.addClass("homepage-studio-file-group-drag-handle");
        scope.registerDomEvent(groupDragHandle, "dragstart", (event) => {
          this.draggedFileGroupId = group.id;
          event.dataTransfer?.setData("text/plain", group.id);
          if (event.dataTransfer !== null) {
            event.dataTransfer.effectAllowed = "move";
          }
        });
        scope.registerDomEvent(groupDragHandle, "dragend", () => {
          this.draggedFileGroupId = null;
        });
      }
      scope.registerDomEvent(card, "dragover", (event) => {
        if (
          this.draggedFileGroupId !== null
          && this.draggedFileGroupId !== group.id
        ) {
          event.preventDefault();
        }
      });
      scope.registerDomEvent(card, "drop", (event) => {
        const sourceId = this.draggedFileGroupId;
        if (sourceId === null || sourceId === group.id) {
          return;
        }
        event.preventDefault();
        this.draggedFileGroupId = null;
        this.moveFileGroupTo(
          settings,
          sourceId,
          group.id,
          error,
          messages
        );
      });
      const localError = card.createEl("p", {
        cls: "homepage-studio-file-group-settings-error",
        attr: {
          role: "alert",
          "aria-live": "polite"
        }
      });
      let nextName = group.name;
      new Setting(card)
        .setName(messages.fileGroupsName)
        .addText((text) => {
          text
            .setValue(group.name)
            .setDisabled(!settings.editable)
            .onChange((value) => {
              nextName = value;
            });
        })
        .addButton((button) => {
          button
            .setButtonText(messages.fileGroupsRename)
            .setDisabled(!settings.editable)
            .onClick(() => {
              this.handleFileGroupMutation(
                this.application.renameFileGroup(group.id, nextName),
                localError,
                messages
              );
            });
        })
        .addButton((button) => {
          button.buttonEl.addClass("mod-warning");
          button
            .setButtonText(messages.fileGroupsDelete)
            .setDisabled(!settings.editable)
            .onClick(() => {
              void this.application.deleteFileGroup(group.id).then((result) => {
                this.handleFileGroupMutation(result, localError, messages);
              });
            });
        });

      let candidatePath = "";
      new Setting(card)
        .setName(messages.fileGroupsAddFile)
        .setDesc(messages.fileGroupsAddFileDescription)
        .addText((text) => {
          text
            .setPlaceholder(messages.fileGroupsFilePlaceholder)
            .setDisabled(!settings.editable)
            .onChange((value) => {
              candidatePath = value;
            });
          this.registerInputSuggest(new VaultFileSuggest(
            this.app,
            text.inputEl,
            () => this.getSuggestionFiles(),
            (path) => {
              candidatePath = path;
            }
          ));
        })
        .addButton((button) => {
          button
            .setButtonText(messages.fileGroupsAddFileAction)
            .setDisabled(!settings.editable)
            .onClick(() => {
              const trimmedPath = candidatePath.trim();
              const path = trimmedPath === ""
                ? ""
                : normalizePath(trimmedPath);
              const file = path === ""
                ? null
                : this.app.vault.getAbstractFileByPath(path);
              if (!(file instanceof TFile)) {
                localError.setText(messages.fileGroupsInvalidFile);
                return;
              }
              this.handleFileGroupMutation(
                this.application.addFileGroupEntry(group.id, file.path),
                localError,
                messages
              );
            });
        });

      if (group.entries.length === 0) {
        card.createEl("p", {
          cls: "homepage-studio-file-group-settings-empty",
          text: messages.fileGroupsNoFiles
        });
      } else {
        for (const [entryIndex, entry] of group.entries.entries()) {
          const entrySetting = new Setting(card)
            .setName(entry.path);
          if (entry.state !== "ready") {
            entrySetting.setDesc(
              entry.state === "missing"
                ? messages.fileGroupsMissingFile
                : messages.fileGroupsInvalidTarget
            );
          }
          entrySetting
            .addButton((button) => {
              button
                .setButtonText(messages.fileGroupsMoveFileUp)
                .setDisabled(!settings.editable || entryIndex === 0)
                .onClick(() => {
                  this.handleFileGroupMutation(
                    this.application.moveFileGroupEntry(
                      group.id,
                      entry.id,
                      -1
                    ),
                    localError,
                    messages
                  );
                });
            })
            .addButton((button) => {
              button
                .setButtonText(messages.fileGroupsMoveFileDown)
                .setDisabled(
                  !settings.editable
                  || entryIndex === group.entries.length - 1
                )
                .onClick(() => {
                  this.handleFileGroupMutation(
                    this.application.moveFileGroupEntry(
                      group.id,
                      entry.id,
                      1
                    ),
                    localError,
                    messages
                  );
                });
            })
            .addButton((button) => {
              button
                .setButtonText(messages.fileGroupsRemoveFile)
                .setDisabled(!settings.editable)
                .onClick(() => {
                  this.handleFileGroupMutation(
                    this.application.removeFileGroupEntry(
                      group.id,
                      entry.id
                    ),
                    localError,
                    messages
                  );
                });
            });
          entrySetting.settingEl.addClass(
            "homepage-studio-file-group-entry-setting"
          );
          entrySetting.settingEl.setAttribute(
            "data-file-entry-state",
            entry.state
          );
          const entryDragHandle = entrySetting.settingEl
            .querySelector<HTMLElement>(".setting-item-info");
          if (entryDragHandle !== null) {
            entryDragHandle.draggable = settings.editable;
            entryDragHandle.addClass(
              "homepage-studio-file-group-drag-handle"
            );
            scope.registerDomEvent(entryDragHandle, "dragstart", (event) => {
              this.draggedFileEntry = {
                groupId: group.id,
                entryId: entry.id
              };
              event.dataTransfer?.setData("text/plain", entry.id);
              if (event.dataTransfer !== null) {
                event.dataTransfer.effectAllowed = "move";
              }
            });
            scope.registerDomEvent(entryDragHandle, "dragend", () => {
              this.draggedFileEntry = null;
            });
          }
          scope.registerDomEvent(
            entrySetting.settingEl,
            "dragover",
            (event) => {
              if (
                this.draggedFileEntry?.groupId === group.id
                && this.draggedFileEntry.entryId !== entry.id
              ) {
                event.preventDefault();
              }
            }
          );
          scope.registerDomEvent(entrySetting.settingEl, "drop", (event) => {
            const source = this.draggedFileEntry;
            if (
              source === null
              || source.groupId !== group.id
              || source.entryId === entry.id
            ) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            this.draggedFileEntry = null;
            this.moveFileGroupEntryTo(
              settings,
              group.id,
              source.entryId,
              entry.id,
              localError,
              messages
            );
          });
          if (entry.state !== "ready") {
            this.renderFileGroupEntryReplacement(
              card,
              group.id,
              entry.id,
              settings.editable,
              localError,
              messages
            );
          }
        }
      }

      if (this.pendingFileGroupFocusId === group.id) {
        this.pendingFileGroupFocusId = null;
        card.scrollIntoView?.({ block: "nearest" });
        card.querySelector<HTMLInputElement>("input")?.focus();
      }
    }
  }

  private handleFileGroupMutation(
    result: FileGroupMutationResult,
    error: HTMLElement,
    messages: Messages
  ): void {
    if (result.type === "applied") {
      this.refreshSettings();
      return;
    }
    if (result.type === "cancelled") {
      return;
    }
    const messageByResult: Record<typeof result.type, string> = {
      "invalid-name": messages.fileGroupsInvalidName,
      "invalid-file": messages.fileGroupsInvalidFile,
      "duplicate-path": messages.fileGroupsDuplicateFile,
      "not-found": messages.fileGroupsNotFound,
      "undo-expired": messages.fileGroupsUndoExpired,
      blocked: messages.fileGroupsUnavailable
    };
    error.setText(messageByResult[result.type]);
  }

  private moveFileGroupTo(
    settings: FileGroupSettings,
    sourceId: string,
    targetId: string,
    error: HTMLElement,
    messages: Messages
  ): void {
    const sourceIndex = settings.groups.findIndex(
      (group) => group.id === sourceId
    );
    const targetIndex = settings.groups.findIndex(
      (group) => group.id === targetId
    );
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return;
    }
    const offset = sourceIndex < targetIndex ? 1 : -1;
    let result: FileGroupMutationResult = {
      type: "applied",
      id: sourceId
    };
    for (
      let step = 0;
      step < Math.abs(targetIndex - sourceIndex);
      step += 1
    ) {
      result = this.application.moveFileGroup(sourceId, offset);
      if (result.type !== "applied") {
        break;
      }
    }
    this.handleFileGroupMutation(result, error, messages);
  }

  private moveFileGroupEntryTo(
    settings: FileGroupSettings,
    groupId: string,
    sourceId: string,
    targetId: string,
    error: HTMLElement,
    messages: Messages
  ): void {
    const group = settings.groups.find((candidate) => candidate.id === groupId);
    const sourceIndex = group?.entries.findIndex(
      (entry) => entry.id === sourceId
    ) ?? -1;
    const targetIndex = group?.entries.findIndex(
      (entry) => entry.id === targetId
    ) ?? -1;
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return;
    }
    const offset = sourceIndex < targetIndex ? 1 : -1;
    let result: FileGroupMutationResult = {
      type: "applied",
      id: sourceId
    };
    for (
      let step = 0;
      step < Math.abs(targetIndex - sourceIndex);
      step += 1
    ) {
      result = this.application.moveFileGroupEntry(
        groupId,
        sourceId,
        offset
      );
      if (result.type !== "applied") {
        break;
      }
    }
    this.handleFileGroupMutation(result, error, messages);
  }

  private renderFileGroupEntryReplacement(
    container: HTMLElement,
    groupId: string,
    entryId: string,
    editable: boolean,
    error: HTMLElement,
    messages: Messages
  ): void {
    let candidatePath = "";
    new Setting(container)
      .setName(messages.fileGroupsReplaceFile)
      .setDesc(messages.fileGroupsReplaceFileDescription)
      .addText((text) => {
        text
          .setPlaceholder(messages.fileGroupsFilePlaceholder)
          .setDisabled(!editable)
          .onChange((value) => {
            candidatePath = value;
          });
        this.registerInputSuggest(new VaultFileSuggest(
          this.app,
          text.inputEl,
          () => this.getSuggestionFiles(),
          (path) => {
            candidatePath = path;
          }
        ));
      })
      .addButton((button) => {
        button
          .setButtonText(messages.fileGroupsReplaceFile)
          .setDisabled(!editable)
          .onClick(() => {
            const trimmedPath = candidatePath.trim();
            const path = trimmedPath === ""
              ? ""
              : normalizePath(trimmedPath);
            const file = path === ""
              ? null
              : this.app.vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) {
              error.setText(messages.fileGroupsInvalidFile);
              return;
            }
            this.handleFileGroupMutation(
              this.application.replaceFileGroupEntry(
                groupId,
                entryId,
                file.path
              ),
              error,
              messages
            );
          });
      });
  }

  private renderPlanSettings(
    planSettings: PlanSettings,
    messages: Messages
  ): void {
    const region = this.containerEl.createDiv({
      cls: "homepage-studio-plan-settings"
    });
    new Setting(region)
      .setName(planSettings.activeMode === "daily"
        ? messages.planDailyTemplatesHeading
        : messages.planWeeklyTemplatesHeading)
      .setDesc(planSettings.activeMode === "daily"
        ? messages.planDailyTemplatesDescription
        : messages.planWeeklyTemplatesDescription)
      .setHeading();
    const error = region.createEl("p", {
      cls: "homepage-studio-plan-settings-error",
      attr: {
        role: "alert",
        "aria-live": "polite"
      }
    });

    new Setting(region)
      .setName(messages.planMode)
      .setDesc(messages.planModeDescription)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("daily", messages.planModeDaily)
          .addOption("weekly", messages.planModeWeekly)
          .setValue(planSettings.activeMode)
          .setDisabled(!planSettings.editable)
          .onChange((value) => {
            if (value === "daily" || value === "weekly") {
              this.handlePlanMutation(
                this.application.setPlanMode(value),
                error,
                messages
              );
            }
          });
      });

    if (planSettings.activeMode === "weekly") {
      this.renderWeeklyPlanSettings(
        region,
        planSettings,
        messages,
        error
      );
      return;
    }
    const settings: DailyPlanSettings = {
      editable: planSettings.editable,
      selectedTemplateId: planSettings.selectedDailyTemplateId,
      templates: planSettings.dailyTemplates
    };

    new Setting(region)
      .setName(messages.planSelectedTemplate)
      .setDesc(messages.planSelectedTemplateDescription)
      .addDropdown((dropdown) => {
        dropdown.addOption("", messages.planNoTemplateSelected);
        for (const template of settings.templates) {
          dropdown.addOption(template.id, template.name);
        }
        dropdown
          .setValue(settings.selectedTemplateId ?? "")
          .setDisabled(!settings.editable)
          .onChange((value) => {
            this.handlePlanMutation(
              this.application.selectDailyPlanTemplate(value === ""
                ? null
                : value),
              error,
              messages
            );
          });
      });

    let newTemplateName = "";
    new Setting(region)
      .setName(messages.planCreateTemplate)
      .addText((text) => {
        text
          .setPlaceholder(messages.planTemplateNamePlaceholder)
          .setDisabled(!settings.editable)
          .onChange((value) => {
            newTemplateName = value;
          });
        attachAccessibleLabel(
          text.inputEl,
          text.inputEl.parentElement ?? region,
          messages.planTemplateNamePlaceholder
        );
      })
      .addButton((button) => {
        button
          .setButtonText(messages.planCreate)
          .setDisabled(!settings.editable)
          .onClick(() => {
            const result = this.application.createDailyPlanTemplate(
              newTemplateName
            );
            if (result.type === "applied" && result.id !== undefined) {
              this.pendingPlanTemplateFocusId = result.id;
            }
            this.handlePlanMutation(
              result,
              error,
              messages
            );
          });
      });

    for (const template of settings.templates) {
      this.renderDailyPlanTemplate(
        region,
        template,
        settings,
        messages,
        error
      );
    }
  }

  private renderWeeklyPlanSettings(
    region: HTMLElement,
    settings: PlanSettings,
    messages: Messages,
    error: HTMLElement
  ): void {
    new Setting(region)
      .setName(messages.planSelectedWeeklyTemplate)
      .setDesc(messages.planSelectedWeeklyTemplateDescription)
      .addDropdown((dropdown) => {
        dropdown.addOption("", messages.planNoWeeklyTemplateSelected);
        for (const template of settings.weeklyTemplates) {
          dropdown.addOption(template.id, template.name);
        }
        dropdown
          .setValue(settings.selectedWeeklyTemplateId ?? "")
          .setDisabled(!settings.editable)
          .onChange((value) => {
            this.handlePlanMutation(
              this.application.selectWeeklyPlanTemplate(
                value === "" ? null : value
              ),
              error,
              messages
            );
          });
      });

    let newTemplateName = "";
    new Setting(region)
      .setName(messages.planCreateWeeklyTemplate)
      .addText((text) => {
        text
          .setPlaceholder(messages.planTemplateNamePlaceholder)
          .setDisabled(!settings.editable)
          .onChange((value) => {
            newTemplateName = value;
          });
      })
      .addButton((button) => {
        button
          .setButtonText(messages.planCreate)
          .setDisabled(!settings.editable)
          .onClick(() => {
            const result = this.application.createWeeklyPlanTemplate(
              newTemplateName
            );
            if (result.type === "applied" && result.id !== undefined) {
              this.pendingPlanTemplateFocusId = result.id;
            }
            this.handlePlanMutation(result, error, messages);
          });
      });

    for (const template of settings.weeklyTemplates) {
      this.renderWeeklyPlanTemplate(
        region,
        template,
        settings,
        messages,
        error
      );
    }
  }

  private renderWeeklyPlanTemplate(
    container: HTMLElement,
    template: WeeklyTemplate,
    settings: PlanSettings,
    messages: Messages,
    error: HTMLElement
  ): void {
    const card = container.createDiv({
      cls: "homepage-studio-plan-template-card",
      attr: {
        "data-template-id": template.id,
        "data-selected": (
          settings.selectedWeeklyTemplateId === template.id
        ).toString()
      }
    });
    const heading = new Setting(card)
      .setName(template.name)
      .setHeading();
    heading.settingEl.addClass("homepage-studio-plan-template-title");

    let templateName = template.name;
    new Setting(card)
      .setName(messages.planTemplateNamePlaceholder)
      .addText((text) => {
        text
          .setValue(template.name)
          .setDisabled(!settings.editable)
          .onChange((value) => {
            templateName = value;
          });
      })
      .addButton((button) => {
        button
          .setButtonText(messages.planRename)
          .setDisabled(!settings.editable)
          .onClick(() => {
            this.handlePlanMutation(
              this.application.renameWeeklyPlanTemplate(
                template.id,
                templateName
              ),
              error,
              messages
            );
          });
      })
      .addButton((button) => {
        button
          .setButtonText(messages.planCopy)
          .setDisabled(!settings.editable)
          .onClick(() => {
            this.handlePlanMutation(
              this.application.copyWeeklyPlanTemplate(
                template.id,
                messages.planCopyName.replace("{name}", template.name)
              ),
              error,
              messages
            );
          });
      })
      .addButton((button) => {
        button.buttonEl.addClass("mod-warning");
        button
          .setButtonText(messages.planDelete)
          .setDisabled(!settings.editable)
          .onClick(() => {
            void this.application.deleteWeeklyPlanTemplate(template.id)
              .then((result) => {
                this.handlePlanMutation(result, error, messages);
              });
          });
      });

    for (const day of WEEKDAYS) {
      this.renderWeeklyPlanDay(
        card,
        template,
        day,
        settings.editable,
        messages
      );
    }
    if (this.pendingPlanTemplateFocusId === template.id) {
      this.pendingPlanTemplateFocusId = null;
      card.scrollIntoView?.({ block: "nearest" });
      card.querySelector<HTMLInputElement>("input")?.focus();
    }
  }

  private renderWeeklyPlanDay(
    card: HTMLElement,
    template: WeeklyTemplate,
    day: Weekday,
    editable: boolean,
    messages: Messages
  ): void {
    const periods = template.days[day];
    const daySection = card.createEl("details", {
      cls: "homepage-studio-plan-weekday",
      attr: {
        "data-weekday": day
      }
    });
    daySection.open = periods.length > 0;
    daySection.createEl("summary", {
      text: this.getWeekdayLabel(day, messages)
    });
    if (periods.length === 0) {
      daySection.createEl("p", {
        cls: "homepage-studio-plan-periods-empty",
        text: messages.planNoPeriods
      });
    }
    periods.forEach((period, index) => {
      this.renderPlanPeriod(
        daySection,
        period,
        index,
        periods.length,
        editable,
        messages,
        {
          update: (update) => this.application.updateWeeklyPlanPeriod(
            template.id,
            day,
            period.id,
            update
          ),
          move: (offset) => this.application.moveWeeklyPlanPeriod(
            template.id,
            day,
            period.id,
            offset
          ),
          remove: () => this.application.deleteWeeklyPlanPeriod(
            template.id,
            day,
            period.id
          )
        }
      );
    });
    this.renderNewPlanPeriod(
      daySection,
      periods,
      editable,
      messages,
      (period) => this.application.addWeeklyPlanPeriod(
        template.id,
        day,
        period
      )
    );
  }

  private getWeekdayLabel(day: Weekday, messages: Messages): string {
    const labels: Record<Weekday, string> = {
      monday: messages.planWeekdayMonday,
      tuesday: messages.planWeekdayTuesday,
      wednesday: messages.planWeekdayWednesday,
      thursday: messages.planWeekdayThursday,
      friday: messages.planWeekdayFriday,
      saturday: messages.planWeekdaySaturday,
      sunday: messages.planWeekdaySunday
    };
    return labels[day];
  }

  private renderDailyPlanTemplate(
    container: HTMLElement,
    template: DailyTemplate,
    settings: DailyPlanSettings,
    messages: Messages,
    error: HTMLElement
  ): void {
    const card = container.createDiv({
      cls: "homepage-studio-plan-template-card",
      attr: {
        "data-template-id": template.id,
        "data-selected": (
          settings.selectedTemplateId === template.id
        ).toString()
      }
    });
    const templateHeading = new Setting(card)
      .setName(template.name)
      .setHeading();
    templateHeading.settingEl.addClass(
      "homepage-studio-plan-template-title"
    );

    let templateName = template.name;
    new Setting(card)
      .setName(messages.planTemplateNamePlaceholder)
      .addText((text) => {
        text
          .setValue(template.name)
          .setDisabled(!settings.editable)
          .onChange((value) => {
            templateName = value;
          });
      })
      .addButton((button) => {
        button
          .setButtonText(messages.planRename)
          .setDisabled(!settings.editable)
          .onClick(() => {
            this.handlePlanMutation(
              this.application.renameDailyPlanTemplate(
                template.id,
                templateName
              ),
              error,
              messages
            );
          });
      })
      .addButton((button) => {
        button
          .setButtonText(messages.planCopy)
          .setDisabled(!settings.editable)
          .onClick(() => {
            this.handlePlanMutation(
              this.application.copyDailyPlanTemplate(
                template.id,
                messages.planCopyName.replace("{name}", template.name)
              ),
              error,
              messages
            );
          });
      })
      .addButton((button) => {
        button.buttonEl.addClass("mod-warning");
        button
          .setButtonText(messages.planDelete)
          .setDisabled(!settings.editable)
          .onClick(() => {
            void this.application.deleteDailyPlanTemplate(template.id)
              .then((result) => {
                this.handlePlanMutation(result, error, messages);
              });
          });
      });

    new Setting(card)
      .setName(messages.planPeriods)
      .setHeading();
    if (template.periods.length === 0) {
      card.createEl("p", {
        cls: "homepage-studio-plan-periods-empty",
        text: messages.planNoPeriods
      });
    }
    template.periods.forEach((period, index) => {
      this.renderPlanPeriod(
        card,
        period,
        index,
        template.periods.length,
        settings.editable,
        messages,
        {
          update: (update) => this.application.updateDailyPlanPeriod(
            template.id,
            period.id,
            update
          ),
          move: (offset) => this.application.moveDailyPlanPeriod(
            template.id,
            period.id,
            offset
          ),
          remove: () => this.application.deleteDailyPlanPeriod(
            template.id,
            period.id
          )
        }
      );
    });
    this.renderNewPlanPeriod(
      card,
      template.periods,
      settings.editable,
      messages,
      (period) => this.application.addDailyPlanPeriod(template.id, period)
    );
    if (this.pendingPlanTemplateFocusId === template.id) {
      this.pendingPlanTemplateFocusId = null;
      card.scrollIntoView?.({
        block: "nearest"
      });
      card.querySelector<HTMLInputElement>("input")?.focus();
    }
  }

  private renderPlanPeriod(
    container: HTMLElement,
    period: PlanPeriod,
    index: number,
    periodCount: number,
    editable: boolean,
    messages: Messages,
    operations: PlanPeriodOperations
  ): void {
    let label = period.label;
    let start = formatPlanMinute(period.startMinute);
    let end = formatPlanMinute(period.endMinute);
    const setting = new Setting(container);
    setting.settingEl.addClass(
      "homepage-studio-plan-period-setting",
      "homepage-studio-plan-period-existing"
    );
    const fields = setting.controlEl.createDiv({
      cls: "homepage-studio-plan-period-fields"
    });
    const actions = setting.controlEl.createDiv({
      cls: "homepage-studio-plan-period-actions"
    });
    const localError = actions.createEl("p", {
      cls: "homepage-studio-plan-settings-error "
        + "homepage-studio-plan-period-error",
      attr: {
        role: "alert",
        "aria-live": "polite"
      }
    });
    setting
      .addText((text) => {
        fields.appendChild(text.inputEl);
        text
          .setValue(label)
          .setPlaceholder(messages.planPeriodLabel)
          .setDisabled(!editable)
          .onChange((value) => {
            label = value;
          });
        attachAccessibleLabel(
          text.inputEl,
          setting.controlEl,
          messages.planPeriodLabel
        );
      })
      .addText((text) => {
        fields.appendChild(text.inputEl);
        text
          .setValue(start)
          .setPlaceholder("00:00")
          .setDisabled(!editable)
          .onChange((value) => {
            start = value;
          });
        text.inputEl.inputMode = "numeric";
        attachAccessibleLabel(
          text.inputEl,
          setting.controlEl,
          messages.planPeriodStart
        );
      })
      .addText((text) => {
        fields.appendChild(text.inputEl);
        text
          .setValue(end)
          .setPlaceholder("00:00")
          .setDisabled(!editable)
          .onChange((value) => {
            end = value;
          });
        text.inputEl.inputMode = "numeric";
        attachAccessibleLabel(
          text.inputEl,
          setting.controlEl,
          messages.planPeriodEnd
        );
      })
      .addButton((button) => {
        actions.appendChild(button.buttonEl);
        button
          .setButtonText(messages.planSavePeriod)
          .setDisabled(!editable)
          .onClick(() => {
            const next = this.parseDailyPeriod(label, start, end);
            this.handlePlanMutation(
              next.type === "valid"
                ? operations.update(next.period)
                : next,
              localError,
              messages
            );
          });
      })
      .addButton((button) => {
        actions.appendChild(button.buttonEl);
        button
          .setButtonText(messages.planMoveEarlier)
          .setDisabled(!editable || index === 0)
          .onClick(() => {
            this.handlePlanMutation(
              operations.move(-1),
              localError,
              messages
            );
          });
      })
      .addButton((button) => {
        actions.appendChild(button.buttonEl);
        button
          .setButtonText(messages.planMoveLater)
          .setDisabled(!editable || index === periodCount - 1)
          .onClick(() => {
            this.handlePlanMutation(
              operations.move(1),
              localError,
              messages
            );
          });
      })
      .addButton((button) => {
        actions.appendChild(button.buttonEl);
        button.buttonEl.addClass("mod-warning");
        button
          .setButtonText(messages.planRemovePeriod)
          .setDisabled(!editable)
          .onClick(() => {
            this.handlePlanMutation(
              operations.remove(),
              localError,
              messages
            );
          });
      });
  }

  private renderNewPlanPeriod(
    container: HTMLElement,
    periods: readonly PlanPeriod[],
    editable: boolean,
    messages: Messages,
    add: (
      period: Omit<PlanPeriod, "id">
    ) => DailyPlanMutationResult
  ): void {
    let label = "";
    const previousPeriod = periods[periods.length - 1];
    const startMinute = previousPeriod === undefined
      ? 9 * 60
      : previousPeriod.endMinute % (24 * 60);
    const endMinute = Math.min(startMinute + 60, 24 * 60);
    let start = formatPlanMinute(startMinute);
    let end = formatPlanMinute(endMinute);
    const setting = new Setting(container)
      .setName(messages.planAddPeriod);
    const localError = container.createEl("p", {
      cls: "homepage-studio-plan-settings-error",
      attr: {
        role: "alert",
        "aria-live": "polite"
      }
    });
    localError.addClass("homepage-studio-plan-period-error");
    setting.settingEl.addClass(
      "homepage-studio-plan-period-setting",
      "homepage-studio-plan-period-new"
    );
    setting
      .addText((text) => {
        text
          .setPlaceholder(messages.planPeriodLabel)
          .setDisabled(!editable)
          .onChange((value) => {
            label = value;
          });
        attachAccessibleLabel(
          text.inputEl,
          setting.controlEl,
          messages.planPeriodLabel
        );
      })
      .addText((text) => {
        text
          .setValue(start)
          .setPlaceholder("00:00")
          .setDisabled(!editable)
          .onChange((value) => {
            start = value;
          });
        text.inputEl.inputMode = "numeric";
        attachAccessibleLabel(
          text.inputEl,
          setting.controlEl,
          messages.planPeriodStart
        );
      })
      .addText((text) => {
        text
          .setValue(end)
          .setPlaceholder("00:00")
          .setDisabled(!editable)
          .onChange((value) => {
            end = value;
          });
        text.inputEl.inputMode = "numeric";
        attachAccessibleLabel(
          text.inputEl,
          setting.controlEl,
          messages.planPeriodEnd
        );
      })
      .addButton((button) => {
        button
          .setButtonText(messages.planAddPeriod)
          .setDisabled(!editable)
          .onClick(() => {
            const result = this.parseDailyPeriod(label, start, end);
            this.handlePlanMutation(
              result.type === "valid"
                ? add(result.period)
                : result,
              localError,
              messages
            );
          });
      });
  }

  private parseDailyPeriod(
    label: string,
    start: string,
    end: string
  ): PlanPeriodInputResult {
    const normalizedLabel = normalizePlanLabel(label);
    if (normalizedLabel.length === 0 || normalizedLabel.length > 200) {
      return { type: "invalid-label" };
    }
    const startMinute = parsePlanTime(start);
    if (startMinute === null) {
      return { type: "invalid-start-time" };
    }
    const parsedEndMinute = parsePlanTime(end, true);
    if (parsedEndMinute === null) {
      return { type: "invalid-end-time" };
    }
    return {
      type: "valid",
      period: {
        label,
        startMinute,
        endMinute: parsedEndMinute <= startMinute
          ? parsedEndMinute + 24 * 60
          : parsedEndMinute
      }
    };
  }

  private handlePlanMutation(
    result: DailyPlanMutationResult,
    error: HTMLElement,
    messages: Messages
  ): void {
    if (result.type === "applied") {
      this.refreshSettings();
      return;
    }
    if (result.type === "cancelled") {
      return;
    }
    const messageByResult: Record<typeof result.type, string> = {
      "invalid-name": messages.planInvalidName,
      "invalid-label": messages.planInvalidLabel,
      "invalid-start-time": messages.planInvalidStartTime,
      "invalid-end-time": messages.planInvalidEndTime,
      "invalid-duration": messages.planInvalidPeriod,
      overlap: messages.planOverlap,
      "overnight-overlap": messages.planOvernightOverlap,
      "not-found": messages.planTemplateNotFound,
      blocked: messages.planSettingsUnavailable
    };
    error.setText(messageByResult[result.type]);
  }

  private addLocaleControl(
    setting: Setting,
    settings: InterfaceAndStartupSettings,
    messages: Messages
  ): void {
    setting.addDropdown((dropdown) => {
      dropdown
        .addOption("auto", messages.followObsidian)
        .addOption("zh-cn", messages.simplifiedChinese)
        .addOption("en", messages.english)
        .setValue(settings.locale)
        .setDisabled(!settings.editable)
        .onChange((value) => {
          if (isLocalePreference(value)) {
            this.application.setInterfaceLocale(value);
            this.refreshSettings();
          }
        });
    });
  }

  private addStartupControl(
    setting: Setting,
    settings: InterfaceAndStartupSettings
  ): void {
    setting.addToggle((toggle) => {
      toggle
        .setValue(settings.openOnStartup)
        .setDisabled(!settings.editable)
        .onChange((value) => {
          this.application.setOpenOnStartup(value);
        });
    });
  }

  private addBannerTitleControl(
    setting: Setting,
    settings: InterfaceAndStartupSettings
  ): void {
    setting.addText((text) => {
      text
        .setValue(settings.bannerTitle)
        .setDisabled(!settings.editable)
        .onChange((value) => {
          this.application.setBannerTitle(value);
        });
      text.inputEl.maxLength = 200;
    });
  }

  private addBannerSubtitleControl(
    setting: Setting,
    settings: InterfaceAndStartupSettings
  ): void {
    setting.addText((text) => {
      text
        .setValue(settings.bannerSubtitle)
        .setDisabled(!settings.editable)
        .onChange((value) => {
          this.application.setBannerSubtitle(value);
        });
      text.inputEl.maxLength = 300;
    });
  }

  private addEmptyWorkspaceControl(
    setting: Setting,
    settings: InterfaceAndStartupSettings
  ): void {
    setting.addToggle((toggle) => {
      toggle
        .setValue(settings.openWhenWorkspaceEmpty)
        .setDisabled(!settings.editable)
        .onChange((value) => {
          this.application.setOpenWhenWorkspaceEmpty(value);
        });
    });
  }

  private addJournalViewModeControl(
    setting: Setting,
    settings: JournalSettings,
    messages: Messages
  ): void {
    setting.addDropdown((dropdown) => {
      dropdown
        .addOption("edit", messages.journalViewModeEdit)
        .addOption("preview", messages.journalViewModePreview)
        .setValue(settings.viewMode)
        .setDisabled(!settings.editable)
        .onChange((value) => {
          if (value === "edit" || value === "preview") {
            this.application.setJournalViewMode(value);
          }
        });
    });
  }

  private addDateSectionFileControl(
    setting: Setting,
    settings: JournalSettings,
    messages: Messages
  ): void {
    let candidatePath = settings.filePath ?? "";
    let pathInput: HTMLInputElement | null = null;
    setting.addText((text) => {
      pathInput = text.inputEl;
      text
        .setValue(candidatePath)
        .setPlaceholder(messages.journalDateSectionPathPlaceholder)
        .setDisabled(!settings.editable)
        .onChange((value) => {
          candidatePath = value;
        });
      this.registerInputSuggest(new MarkdownFileSuggest(
        this.app,
        text.inputEl,
        () => this.getSuggestionFiles(),
        (path) => {
          candidatePath = path;
        }
      ));
    });
    setting.addButton((button) => {
      button
        .setButtonText(messages.journalUseExistingFile)
        .setDisabled(!settings.editable)
        .onClick(() => {
          void this.activateDateSectionFile(candidatePath, messages).then(
            (activated) => {
              if (!activated) {
                pathInput?.focus();
              }
            }
          );
        });
    });
    setting.addButton((button) => {
      button
        .setButtonText(messages.journalCreateFile)
        .setDisabled(!settings.editable)
        .onClick(() => {
          void this.createDateSectionFile(candidatePath, messages).then(
            (activated) => {
              if (!activated) {
                pathInput?.focus();
              }
            }
          );
        });
    });
  }

  private renderRecurringTaskSettings(
    settings: TaskSettings,
    messages: Messages
  ): void {
    const region = this.containerEl.createDiv({
      cls: "homepage-studio-recurring-task-settings"
    });
    new Setting(region)
      .setName(messages.tasksRecurringHeading)
      .setDesc(messages.tasksRecurringDescription)
      .setHeading();
    const error = region.createEl("p", {
      cls: "homepage-studio-recurring-task-error",
      attr: {
        role: "alert",
        "aria-live": "polite"
      }
    });
    const diagnostic = settings.diagnostics[0];
    if (diagnostic !== undefined) {
      error.setText(messages.tasksSourceInvalid
        .replace("{line}", String(diagnostic.line))
        .replace("{code}", diagnostic.code));
    } else if (settings.recurringState !== "ready") {
      error.setText(messages.tasksRecurringUnavailable);
    }

    let newName = "";
    let newRecurrence: TaskRecurrence = "daily";
    let newNameInput: HTMLInputElement | null = null;
    new Setting(region)
      .setName(messages.tasksRecurringCreate)
      .setDesc(messages.tasksRecurringCreateDescription)
      .then((setting) => {
        setting.settingEl.addClass(
          "homepage-studio-recurring-task-create"
        );
      })
      .addText((text) => {
        newNameInput = text.inputEl;
        text
          .setPlaceholder(messages.tasksRecurringNamePlaceholder)
          .setDisabled(!settings.recurringEditable)
          .onChange((value) => {
            newName = value;
          });
        attachAccessibleLabel(
          text.inputEl,
          region,
          messages.tasksRecurringTaskName
        );
      })
      .addDropdown((dropdown) => {
        dropdown
          .addOption("daily", messages.tasksRecurringDaily)
          .addOption("weekly", messages.tasksRecurringWeekly)
          .setValue(newRecurrence)
          .setDisabled(!settings.recurringEditable)
          .onChange((value) => {
            if (isTaskRecurrence(value)) {
              newRecurrence = value;
            }
          });
        attachAccessibleLabel(
          dropdown.selectEl,
          region,
          messages.tasksRecurringType
        );
      })
      .addButton((button) => {
        button
          .setButtonText(messages.tasksRecurringAdd)
          .setDisabled(!settings.recurringEditable)
          .onClick(() => {
            button.setDisabled(true);
            void this.application.addRecurringTask(
              newName.trim(),
              newRecurrence
            ).then((result) => {
              const description = this.describeTaskMutationResult(
                result,
                messages
              );
              error.setText(description);
              if (result.type !== "applied") {
                button.setDisabled(false);
                newNameInput?.focus();
              }
            });
          });
      });

    if (
      settings.recurringState === "ready"
      && settings.recurringTasks.length === 0
    ) {
      region.createEl("p", {
        cls: "homepage-studio-recurring-task-empty",
        text: messages.tasksRecurringEmpty
      });
    }

    for (const task of settings.recurringTasks) {
      let name = task.text;
      let recurrence = task.recurrence;
      let nameInput: HTMLInputElement | null = null;
      new Setting(region)
        .setName(messages.tasksRecurringTaskName)
        .then((setting) => {
          setting.settingEl.addClass(
            "homepage-studio-recurring-task-row"
          );
        })
        .addText((text) => {
          nameInput = text.inputEl;
          text
            .setValue(name)
            .setDisabled(!settings.recurringEditable)
            .onChange((value) => {
              name = value;
            });
          attachAccessibleLabel(
            text.inputEl,
            region,
            messages.tasksRecurringTaskName
          );
        })
        .addDropdown((dropdown) => {
          dropdown
            .addOption("daily", messages.tasksRecurringDaily)
            .addOption("weekly", messages.tasksRecurringWeekly)
            .setValue(recurrence)
            .setDisabled(!settings.recurringEditable)
            .onChange((value) => {
              if (isTaskRecurrence(value)) {
                recurrence = value;
              }
            });
          attachAccessibleLabel(
            dropdown.selectEl,
            region,
            messages.tasksRecurringType
          );
        })
        .addButton((button) => {
          button
            .setButtonText(messages.tasksRecurringSave)
            .setDisabled(!settings.recurringEditable)
            .onClick(() => {
              button.setDisabled(true);
              void this.application.updateRecurringTask(
                task.target,
                name.trim(),
                recurrence
              ).then((result) => {
                error.setText(this.describeTaskMutationResult(
                  result,
                  messages
                ));
                if (result.type !== "applied") {
                  button.setDisabled(false);
                  nameInput?.focus();
                }
              });
            });
        })
        .addButton((button) => {
          button
            .setButtonText(messages.tasksConfirmDelete)
            .setDisabled(!settings.recurringEditable)
            .onClick(() => {
              button.setDisabled(true);
              void this.application.deleteTask(
                task.target,
                task.text
              ).then((result) => {
                error.setText(this.describeTaskMutationResult(
                  result,
                  messages
                ));
                if (result.type !== "applied") {
                  button.setDisabled(false);
                }
              });
            });
        });
    }
  }

  private describeTaskMutationResult(
    result: TaskSourceMutationResult,
    messages: Messages
  ): string {
    switch (result.type) {
      case "applied":
      case "noop":
        return "";
      case "invalid-task":
        return messages.tasksInvalidTask;
      case "conflict":
        return messages.tasksConflict;
      case "invalid-source": {
        const diagnostic = result.diagnostics[0];
        return diagnostic === undefined
          ? messages.tasksSourceInvalidUnknown
          : messages.tasksSourceInvalid
            .replace("{line}", String(diagnostic.line))
            .replace("{code}", diagnostic.code);
      }
      case "missing-source":
        return messages.tasksSourceMissing.replace("{path}", result.path);
      case "missing-region":
        return messages.tasksMissingRegionDescription;
      case "io-error":
        return messages.tasksSourceIoError.replace("{path}", result.path);
    }
  }

  private addTaskFileControl(
    setting: Setting,
    settings: TaskSettings,
    messages: Messages
  ): void {
    let candidatePath = settings.filePath ?? "";
    let pathInput: HTMLInputElement | null = null;
    setting.addText((text) => {
      pathInput = text.inputEl;
      text
        .setValue(candidatePath)
        .setPlaceholder(messages.tasksPathPlaceholder)
        .setDisabled(!settings.editable)
        .onChange((value) => {
          candidatePath = value;
        });
      this.registerInputSuggest(new MarkdownFileSuggest(
        this.app,
        text.inputEl,
        () => this.getSuggestionFiles(),
        (path) => {
          candidatePath = path;
        }
      ));
    });
    setting.addButton((button) => {
      button
        .setButtonText(messages.tasksUseExistingFile)
        .setDisabled(!settings.editable)
        .onClick(() => {
          void this.activateTaskFile(candidatePath, messages).then(
            (activated) => {
              if (!activated) {
                pathInput?.focus();
              }
            }
          );
        });
    });
    setting.addButton((button) => {
      button
        .setButtonText(messages.tasksCreateFile)
        .setDisabled(!settings.editable)
        .onClick(() => {
          void this.createTaskFile(candidatePath, messages).then(
            (activated) => {
              if (!activated) {
                pathInput?.focus();
              }
            }
          );
        });
    });
  }

  private async activateTaskFile(
    path: string,
    messages: Messages
  ): Promise<boolean> {
    const result = await this.application.activateTaskSource(path);
    new Notice(this.describeTaskResult(result, messages));
    if (result.type === "activated") {
      this.refreshSettings();
      return true;
    }
    return false;
  }

  private async createTaskFile(
    path: string,
    messages: Messages
  ): Promise<boolean> {
    const result = await this.application.createTaskSource(path);
    new Notice(this.describeTaskResult(result, messages));
    if (result.type === "activated") {
      this.refreshSettings();
      return true;
    }
    return false;
  }

  private describeTaskResult(
    result: TaskSourceActivationResult | HomepageTaskCreationResult,
    messages: Messages
  ): string {
    switch (result.type) {
      case "activated":
        return messages.tasksSourceActivated.replace("{path}", result.path);
      case "missing-source":
      case "missing-region":
        return messages.tasksSourceMissing.replace(
          "{path}",
          "path" in result ? result.path : ""
        );
      case "invalid-source": {
        const diagnostic = result.diagnostics[0];
        if (diagnostic === undefined) {
          return messages.tasksSourceInvalidUnknown;
        }
        return messages.tasksSourceInvalid
          .replace("{line}", String(diagnostic.line))
          .replace("{code}", diagnostic.code);
      }
      case "already-exists":
        return messages.tasksSourceAlreadyExists.replace("{path}", result.path);
      case "invalid-path":
        return messages.tasksSourceInvalidPath;
      case "io-error":
        return messages.tasksSourceIoError.replace("{path}", result.path);
      case "configuration-unavailable":
        return messages.tasksConfigurationUnavailable;
      case "append-cancelled":
        return messages.tasksAppendCancelled;
      case "invalid-task":
        return messages.tasksInvalidTask;
      case "conflict":
        return messages.tasksConflict;
      case "noop":
        return messages.tasksAppendCancelled;
    }
  }

  private async activateDateSectionFile(
    path: string,
    messages: Messages
  ): Promise<boolean> {
    const result = await this.application.activateDateSectionJournal(path);
    new Notice(this.describeJournalResult(result, messages));
    if (result.type === "activated") {
      this.refreshSettings();
      return true;
    }
    return false;
  }

  private async createDateSectionFile(
    path: string,
    messages: Messages
  ): Promise<boolean> {
    const result = await this.application.createDateSectionJournal(path);
    new Notice(this.describeJournalResult(result, messages));
    if (result.type === "activated") {
      this.refreshSettings();
      return true;
    }
    return false;
  }

  private describeJournalResult(
    result: JournalSourceActivationResult | JournalSourceCreationResult,
    messages: Messages
  ): string {
    switch (result.type) {
      case "activated":
        return messages.journalSourceActivated.replace("{path}", result.path);
      case "missing-source":
        return messages.journalSourceMissing.replace("{path}", result.path);
      case "invalid-source": {
        const diagnostic = result.diagnostics[0];
        return diagnostic === undefined
          ? messages.journalSourceInvalid
          : messages.journalSourceInvalid
            .replace("{line}", diagnostic.line.toString())
            .replace("{code}", diagnostic.code);
      }
      case "already-exists":
        return messages.journalSourceAlreadyExists;
      case "invalid-path":
        return messages.journalSourceInvalidPath;
      case "io-error":
        return messages.journalSourceIoError;
      case "configuration-unavailable":
        return messages.journalConfigurationUnavailable;
    }
  }

  private registerInputSuggest(suggest: { close(): void }): void {
    const scope = this.settingsScope;
    if (scope === null) {
      suggest.close();
      return;
    }
    scope.register(() => suggest.close());
  }

  private getSuggestionFiles(): readonly TFile[] {
    if (this.suggestionFileCache === null) {
      this.suggestionFileCache = this.app.vault.getFiles();
    }
    return this.suggestionFileCache;
  }

  private invalidateSuggestionFileCache(): void {
    this.suggestionFileCache = null;
  }

  private clearFileGroupUndoTimer(): void {
    if (this.fileGroupUndoTimer === null) {
      return;
    }
    this.containerEl.ownerDocument.defaultView?.clearTimeout(
      this.fileGroupUndoTimer
    );
    this.fileGroupUndoTimer = null;
  }

  private addHeatmapDateRangeControls(
    setting: Setting,
    settings: HeatmapSettings,
    messages: Messages
  ): void {
    setting.addDropdown((dropdown) => {
      dropdown
        .addOption("latestDays", messages.heatmapLatestDays)
        .addOption("fixedYear", messages.heatmapFixedYear)
        .setValue(settings.dateRange.type)
        .setDisabled(!settings.editable)
        .onChange((value) => {
          if (value === "latestDays") {
            this.application.setHeatmapDateRange({
              type: "latestDays",
              days: 365
            });
            this.refreshSettings();
          } else if (value === "fixedYear") {
            this.application.setHeatmapDateRange({
              type: "fixedYear",
              year: new Date().getFullYear()
            });
            this.refreshSettings();
          }
        });
    });
    setting.addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = settings.dateRange.type === "latestDays" ? "1" : "1970";
      text.inputEl.max = settings.dateRange.type === "latestDays" ? "3650" : "9999";
      text
        .setValue(
          settings.dateRange.type === "latestDays"
            ? settings.dateRange.days.toString()
            : settings.dateRange.year.toString()
        )
        .setDisabled(!settings.editable)
        .onChange((value) => {
          const parsed = Number(value);
          if (settings.dateRange.type === "latestDays") {
            this.application.setHeatmapDateRange({
              type: "latestDays",
              days: parsed
            });
          } else {
            this.application.setHeatmapDateRange({
              type: "fixedYear",
              year: parsed
            });
          }
        });
    });
  }

  private addHeatmapWeekStartControl(
    setting: Setting,
    settings: HeatmapSettings,
    messages: Messages
  ): void {
    setting.addDropdown((dropdown) => {
      dropdown
        .addOption("0", messages.heatmapWeekSunday)
        .addOption("1", messages.heatmapWeekMonday)
        .addOption("6", messages.heatmapWeekSaturday)
        .setValue(settings.startOfWeek.toString())
        .setDisabled(!settings.editable)
        .onChange((value) => {
          if (value === "0" || value === "1" || value === "6") {
            this.application.setHeatmapStartOfWeek(Number(value) as 0 | 1 | 6);
          }
        });
    });
  }

  private addHeatmapThresholdControl(
    setting: Setting,
    settings: HeatmapSettings
  ): void {
    setting.addText((text) => {
      text
        .setValue(settings.thresholds.join(", "))
        .setDisabled(!settings.editable)
        .onChange((value) => {
          const parsed = value
            .split(",")
            .map((part) => Number(part.trim()));
          const [low, medium, high] = parsed;
          if (
            parsed.length === 3
            && low !== undefined
            && medium !== undefined
            && high !== undefined
          ) {
            this.application.setHeatmapThresholds([low, medium, high]);
          }
        });
    });
  }

  private addHeatmapExcludeFoldersControl(
    setting: Setting,
    settings: HeatmapSettings
  ): void {
    setting.addTextArea((textArea) => {
      textArea
        .setValue(settings.excludeFolders.join("\n"))
        .setDisabled(!settings.editable)
        .onChange((value) => {
          this.application.setHeatmapExcludeFolders(value.split(/\r?\n/gu));
        });
    });
  }

  private addHeatmapRetentionControl(
    setting: Setting,
    settings: HeatmapSettings
  ): void {
    setting.addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text
        .setValue(settings.historyRetentionDays.toString())
        .setDisabled(!settings.editable)
        .onChange((value) => {
          this.application.setHeatmapHistoryRetentionDays(Number(value));
        });
    });
  }

  private refreshSettings(): void {
    const compatibleTab = this as unknown as { update?: () => void };
    if (compatibleTab.update === undefined) {
      this.display();
      return;
    }
    compatibleTab.update();
  }

  private focusHeading(heading: Setting | undefined): void {
    if (heading === undefined) {
      return;
    }
    this.focusSettingsElement(heading.nameEl);
  }

  private focusSettingName(
    name: string,
    fallback: Setting | undefined
  ): void {
    const target = [
      ...this.containerEl.querySelectorAll<HTMLElement>(
        ".setting-item-name"
      )
    ].find((element) => element.textContent?.trim() === name);
    if (target === undefined) {
      this.focusHeading(fallback);
      return;
    }
    this.focusSettingsElement(target);
  }

  private focusSettingsElement(element: HTMLElement): void {
    const setting = element.closest<HTMLElement>(".setting-item");
    const clearSearchTarget = (): void => {
      setting?.removeClass("homepage-studio-settings-search-target");
    };
    setting?.addClass("homepage-studio-settings-search-target");
    this.settingsScope?.registerDomEvent(
      element,
      "blur",
      clearSearchTarget
    );
    element.setAttribute("tabindex", "-1");
    element.focus({
      preventScroll: true
    });
    element.scrollIntoView?.({
      behavior: "smooth",
      block: "center",
      inline: "nearest"
    });
  }
}
