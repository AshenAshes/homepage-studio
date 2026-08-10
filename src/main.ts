import {
  getLanguage,
  normalizePath,
  Plugin,
  TFile
} from "obsidian";
import { AppStore } from "./application/AppStore";
import { HomepageApplicationFacade } from "./application/HomepageApplicationFacade";
import { InMemoryDiagnosticRecorder } from "./application/diagnostics";
import { DataLifecycleService } from "./application/services/DataLifecycleService";
import { LocalizationService } from "./application/services/LocalizationService";
import { HeatmapTrackingService } from "./application/services/HeatmapTrackingService";
import {
  HOMEPAGE_ICON,
  HOMEPAGE_PLUGIN_ID,
  HOMEPAGE_VIEW_TYPE
} from "./constants";
import { PersistenceFailureNotice } from "./infrastructure/obsidian/PersistenceFailureNotice";
import { ObsidianSettingsNavigator } from "./infrastructure/obsidian/ObsidianSettingsNavigator";
import { ResetDataConfirmation } from "./infrastructure/obsidian/ResetDataConfirmation";
import { LayoutResetConfirmation } from
  "./infrastructure/obsidian/LayoutResetConfirmation";
import { WorkspaceController } from "./infrastructure/obsidian/WorkspaceController";
import { HeatmapEditorTracker } from "./infrastructure/obsidian/HeatmapEditorTracker";
import { ObsidianFileNavigator } from "./infrastructure/obsidian/ObsidianFileNavigator";
import { ObsidianMarkdownFile } from
  "./infrastructure/obsidian/ObsidianMarkdownFile";
import { JournalWriteFailureNotice } from
  "./infrastructure/obsidian/JournalWriteFailureNotice";
import { JournalDeleteConfirmation } from
  "./infrastructure/obsidian/JournalDeleteConfirmation";
import { PluginDataBackupService } from "./infrastructure/persistence/PluginDataBackupService";
import { PluginDataRepository } from "./infrastructure/persistence/PluginDataRepository";
import {
  SerialPersistenceCoordinator,
  type TimerDriver
} from "./infrastructure/persistence/SerialPersistenceCoordinator";
import { SystemLocalClock } from "./infrastructure/time/SystemLocalClock";
import { HomepageView } from "./presentation/HomepageView";
import { HomepageSettingsTab } from "./presentation/HomepageSettingsTab";
import { attachTooltipAccessibleLabel } from "./presentation/accessibility";
import { DateSectionJournalService } from
  "./application/services/DateSectionJournalService";
import { DateSectionJournalDraftService } from
  "./application/services/DateSectionJournalDraftService";
import { TaskSourceService } from
  "./application/services/TaskSourceService";
import {
  TaskDeleteConfirmation,
  TaskSourceAppendConfirmation
} from "./infrastructure/obsidian/TaskConfirmations";
import { TaskWriteFailureNotice } from
  "./infrastructure/obsidian/TaskWriteFailureNotice";
import { DailyPlanDeleteConfirmation } from
  "./infrastructure/obsidian/DailyPlanDeleteConfirmation";
import { FileGroupDeleteConfirmation } from
  "./infrastructure/obsidian/FileGroupDeleteConfirmation";
import { ObsidianFileEntryRuntime } from
  "./infrastructure/obsidian/ObsidianFileEntryRuntime";
import { ObsidianBannerResource } from
  "./infrastructure/obsidian/ObsidianBannerResource";

export default class HomepageStudioPlugin extends Plugin {
  private persistence: SerialPersistenceCoordinator | null = null;
  private heatmapEditorTracker: HeatmapEditorTracker | null = null;

  public override async onload(): Promise<void> {
    const localization = new LocalizationService(getLanguage());
    const diagnostics = new InMemoryDiagnosticRecorder();
    const dataPath = normalizePath(
      `${this.app.vault.configDir}/plugins/${HOMEPAGE_PLUGIN_ID}/data.json`
    );
    const repository = new PluginDataRepository(
      this,
      this.app.vault.adapter,
      dataPath
    );
    const backup = new PluginDataBackupService(
      {
        read: (path) => this.app.vault.adapter.read(path),
        write: (path, data) => this.app.vault.adapter.write(path, data)
      },
      dataPath,
      () => new Date()
    );
    const timerWindow = this.app.workspace.containerEl.ownerDocument.defaultView;
    if (timerWindow === null) {
      throw new Error("Workspace window is unavailable.");
    }
    const timerDriver: TimerDriver = {
      set: (callback, delay) => timerWindow.setTimeout(callback, delay),
      clear: (handle) => timerWindow.clearTimeout(handle)
    };
    const failureNotice = new PersistenceFailureNotice(localization);
    const persistence = new SerialPersistenceCoordinator(
      repository,
      backup,
      failureNotice,
      timerDriver
    );
    this.persistence = persistence;
    const store = new AppStore(persistence);
    const lifecycle = new DataLifecycleService(store, repository, backup);
    const settingsNavigation = new ObsidianSettingsNavigator(this.app);
    const clock = new SystemLocalClock({
      now: () => new Date(),
      set: (callback, delay) => timerWindow.setTimeout(callback, delay),
      clear: (handle) => timerWindow.clearTimeout(handle)
    });
    const heatmapTracking = new HeatmapTrackingService(store, clock);
    const markdownFiles = new ObsidianMarkdownFile(this.app);
    const dateSectionJournal = new DateSectionJournalService(markdownFiles);
    const journalDrafts = new DateSectionJournalDraftService(
      dateSectionJournal,
      timerDriver
    );
    const taskSource = new TaskSourceService(markdownFiles);
    const fileEntryRuntime = new ObsidianFileEntryRuntime(this.app);
    const bannerResource = new ObsidianBannerResource(this.app);
    const application = new HomepageApplicationFacade(
      new WorkspaceController(this.app, diagnostics),
      localization,
      store,
      lifecycle,
      new ResetDataConfirmation(this.app, localization),
      failureNotice,
      settingsNavigation,
      heatmapTracking,
      new ObsidianFileNavigator(this.app),
      dateSectionJournal,
      journalDrafts,
      new JournalWriteFailureNotice(localization),
      new JournalDeleteConfirmation(this.app, localization),
      taskSource,
      new TaskSourceAppendConfirmation(this.app, localization),
      new TaskDeleteConfirmation(this.app, localization),
      new TaskWriteFailureNotice(localization),
      new DailyPlanDeleteConfirmation(this.app, localization),
      new FileGroupDeleteConfirmation(this.app, localization),
      fileEntryRuntime,
      bannerResource,
      new LayoutResetConfirmation(this.app, localization)
    );
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      const directory = !(file instanceof TFile);
      application.handleFileEntryRename(
        oldPath,
        file.path,
        directory
      );
      application.handleBannerResourceRename(
        oldPath,
        file.path,
        directory
      );
    }));
    this.registerEvent(this.app.vault.on("create", () => {
      application.refreshFileEntryStates();
      application.refreshBannerResources();
    }));
    this.registerEvent(this.app.vault.on("delete", () => {
      application.refreshFileEntryStates();
      application.refreshBannerResources();
    }));

    this.registerView(
      HOMEPAGE_VIEW_TYPE,
      (leaf) => new HomepageView(leaf, application)
    );
    this.addSettingTab(new HomepageSettingsTab(
      this.app,
      this,
      application,
      localization,
      settingsNavigation
    ));

    const command = this.addCommand({
      id: "open",
      name: localization.getMessages().openHomepageCommand,
      callback: () => {
        void application.openHomepage();
      }
    });

    const ribbon = this.addRibbonIcon(
      HOMEPAGE_ICON,
      localization.getMessages().openHomepageCommand,
      () => {
        void application.openHomepage();
      }
    );
    attachTooltipAccessibleLabel(
      ribbon,
      localization.getMessages().openHomepageCommand,
      "right"
    );

    const refreshEntryLabels = (): void => {
      const label = localization.getMessages().openHomepageCommand;
      command.name = label;
      attachTooltipAccessibleLabel(ribbon, label, "right");
    };
    this.register(localization.subscribe(refreshEntryLabels));

    const syncLocalePreference = (): void => {
      const state = store.getState();
      localization.setPreference(
        state.mode === "ready" ? state.data.locale : "auto"
      );
    };
    this.register(store.subscribeState(syncLocalePreference));

    this.register(clock.subscribe((snapshot) => {
      store.updateLocalTime(snapshot);
      heatmapTracking.refreshDate();
    }));
    store.updateLocalTime(clock.getCurrent());

    const boundClockWindows = new Set<Window>();
    const clockDocuments = new Set<Document>();
    const syncClockActivity = (): void => {
      const applicationVisible = [...clockDocuments].some(
        (document_) => document_.visibilityState !== "hidden"
      );
      if (!applicationVisible) {
        clock.stop();
        return;
      }
      clock.refresh();
      clock.start();
    };
    const bindClockWindow = (targetWindow: Window): void => {
      if (boundClockWindows.has(targetWindow)) {
        return;
      }
      boundClockWindows.add(targetWindow);
      clockDocuments.add(targetWindow.document);
      this.registerDomEvent(targetWindow, "focus", () => {
        syncClockActivity();
      });
      this.registerDomEvent(targetWindow.document, "visibilitychange", () => {
        syncClockActivity();
      });
      syncClockActivity();
    };
    bindClockWindow(timerWindow);
    this.app.workspace.iterateAllLeaves((leaf) => {
      bindClockWindow(leaf.getContainer().win);
    });
    this.registerEvent(this.app.workspace.on(
      "window-open",
      (_workspaceWindow, workspaceWindow) => {
        bindClockWindow(workspaceWindow);
      }
    ));
    this.register(() => {
      clockDocuments.clear();
      clock.stop();
    });

    await lifecycle.initialize();
    syncLocalePreference();
    heatmapTracking.refreshDate();
    const heatmapEditorTracker = new HeatmapEditorTracker(
      this.app,
      application,
      timerDriver
    );
    this.heatmapEditorTracker = heatmapEditorTracker;
    heatmapEditorTracker.start();
    this.register(() => {
      heatmapEditorTracker.stop();
      this.heatmapEditorTracker = null;
    });
    this.register(application.startDateSectionJournalLifecycle());
    this.register(application.startTaskSourceLifecycle());
    this.register(() => {
      void application.disposeJournalDrafts();
    });
    this.register(application.startWorkspaceLifecycle());
  }

  public override onunload(): void {
    this.heatmapEditorTracker?.flush();
    void this.persistence?.flush();
  }
}
