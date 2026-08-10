import {
  Component,
  ItemView,
  MarkdownRenderer,
  type WorkspaceLeaf
} from "obsidian";
import type { HomepageApplicationFacade } from "../application/HomepageApplicationFacade";
import {
  HOMEPAGE_ICON,
  HOMEPAGE_VIEW_TYPE
} from "../constants";
import {
  clearHomepageBannerImageState,
  renderHomepageShell
} from "./HomepageShellRenderer";
import { attachAccessibleLabel } from "./accessibility";

export class HomepageView extends ItemView {
  private renderScope: Component | null = null;

  public constructor(
    leaf: WorkspaceLeaf,
    private readonly application: HomepageApplicationFacade
  ) {
    super(leaf);
  }

  public override getViewType(): string {
    return HOMEPAGE_VIEW_TYPE;
  }

  public override getDisplayText(): string {
    return this.application.getSnapshot().title;
  }

  public override getIcon(): string {
    return HOMEPAGE_ICON;
  }

  public override onOpen(): Promise<void> {
    this.register(this.application.subscribeHomepageState(() => {
      this.render();
    }));
    this.render();
    return Promise.resolve();
  }

  private render(): void {
    const snapshot = this.application.getSnapshot();
    const scrollTop = this.contentEl.scrollTop;
    const scrollLeft = this.contentEl.scrollLeft;
    const restoreScrollPosition = (): void => {
      this.contentEl.scrollTop = scrollTop;
      this.contentEl.scrollLeft = scrollLeft;
    };
    this.renderScope?.unload();
    const renderScope = new Component();
    this.renderScope = renderScope;

    this.contentEl.empty();
    this.contentEl.addClass("homepage-studio");
    this.contentEl.setAttribute("data-status", snapshot.status);
    this.containerEl.removeAttribute("data-homepage-studio-theme");
    this.contentEl.removeAttribute("data-theme");
    this.contentEl.removeAttribute("data-appearance");
    this.contentEl.removeAttribute("data-page-visible");
    this.contentEl.removeAttribute("data-cosmic-page-visible");

    if (snapshot.status === "ready" && snapshot.shell !== null) {
      this.containerEl.setAttribute(
        "data-homepage-studio-theme",
        snapshot.shell.theme
      );
      this.contentEl.setAttribute("data-theme", snapshot.shell.theme);
      this.contentEl.setAttribute(
        "data-appearance",
        snapshot.shell.appearanceMode
      );
      renderHomepageShell(
        this.contentEl,
        snapshot.shell,
        {
          openSettings: (section) => {
            this.application.openSettings(section);
          },
          openFile: (path, newPane) => {
            void this.application.openFile(path, newPane);
          },
          moveJournalDate: (offsetDays) => {
            void this.application.moveJournalDate(offsetDays);
          },
          updateJournalDraft: (content) => {
            this.application.updateJournalDraft(content);
          },
          flushJournalDraft: () => {
            void this.application.flushJournalDraft();
          },
          setJournalViewMode: (viewMode) => {
            this.application.setJournalViewMode(viewMode);
          },
          reloadJournalDraft: () => {
            this.application.reloadJournalDraft();
          },
          deleteJournalEntry: () => {
            void this.application.deleteCurrentJournalEntry();
          },
          addTask: async (text) => {
            const result = await this.application.addTask(text);
            return result.type === "applied";
          },
          beginTaskEdit: (target, text) => {
            this.application.beginTaskEdit(target, text);
          },
          updateTaskEditDraft: (text) => {
            this.application.updateTaskEditDraft(text);
          },
          saveTaskEdit: async () => {
            const result = await this.application.saveTaskEdit();
            return result.type === "applied";
          },
          cancelTaskEdit: () => {
            this.application.cancelTaskEdit();
          },
          setTaskCompleted: async (target, completed) => {
            const result = await this.application.setTaskCompleted(
              target,
              completed
            );
            return result.type === "applied";
          },
          archiveTask: async (target) => {
            const result = await this.application.archiveTask(target);
            return result.type === "applied";
          },
          archiveCompletedTasks: async () => {
            const result = await this.application.archiveCompletedTasks();
            return result.type === "applied";
          },
          unarchiveTask: async (target) => {
            const result = await this.application.unarchiveTask(target);
            return result.type === "applied";
          },
          setTaskArchiveVisible: (visible) => {
            this.application.setTaskArchiveVisible(visible);
          },
          showMoreTasks: () => {
            this.application.showMoreTasks();
          },
          showMoreArchivedTasks: () => {
            this.application.showMoreArchivedTasks();
          },
          showMoreFileGroupEntries: () => {
            this.application.showMoreFileGroupEntries();
          },
          reloadTaskSource: () => {
            void this.application.reloadTaskSource();
          },
          openTaskSource: (path) => {
            void this.application.openFile(path, false);
          },
          deleteTask: (target, text) => {
            void this.application.deleteTask(target, text);
          },
          renderMarkdown: (content, path, container, scope) => {
            void MarkdownRenderer.render(
              this.app,
              content,
              container,
              path,
              scope
            );
          }
        },
        renderScope
      );
      restoreScrollPosition();
      return;
    }

    const introduction = this.contentEl.createDiv({
      cls: "homepage-studio-introduction"
    });
    introduction.createEl("h1", {
      cls: "homepage-studio-title",
      text: snapshot.title
    });
    introduction.createEl("p", {
      cls: "homepage-studio-description",
      text: snapshot.description
    });

    if (snapshot.status === "safe-mode") {
      const diagnostics = this.contentEl.createEl("section", {
        cls: "homepage-studio-diagnostics"
      });
      attachAccessibleLabel(
        diagnostics,
        diagnostics,
        snapshot.description
      );
      const list = diagnostics.createEl("ul", {
        cls: "homepage-studio-diagnostic-list"
      });
      for (const diagnostic of snapshot.diagnostics) {
        const item = list.createEl("li", {
          cls: "homepage-studio-diagnostic"
        });
        item.createEl("code", {
          text: diagnostic.code
        });
        item.createEl("p", {
          text: diagnostic.message
        });
        if (diagnostic.details !== undefined) {
          item.createEl("pre", {
            text: diagnostic.details
          });
        }
        item.createEl("pre", {
          text: diagnostic.relatedPaths.join("\n")
        });
        item.createEl("p", {
          text: diagnostic.suggestedAction
        });
      }
      if (snapshot.recoveryActions !== null) {
        const recoveryActions = snapshot.recoveryActions;
        diagnostics.createEl("pre", {
          cls: "homepage-studio-diagnostic-report",
          text: this.application.getDiagnosticReport(),
          attr: {
            tabindex: "0"
          }
        });
        const actions = diagnostics.createDiv({
          cls: "homepage-studio-recovery-actions"
        });
        const dataManagementButton = actions.createEl("button", {
          text: recoveryActions.openDataManagementLabel
        });
        const reloadButton = actions.createEl("button", {
          text: recoveryActions.reloadLabel
        });
        const resetButton = actions.createEl("button", {
          cls: "mod-warning",
          text: recoveryActions.resetLabel
        });
        renderScope.registerDomEvent(dataManagementButton, "click", () => {
          this.application.openSettings("data-management");
        });
        renderScope.registerDomEvent(reloadButton, "click", () => {
          void this.application.reloadPluginData();
        });
        renderScope.registerDomEvent(resetButton, "click", () => {
          void this.application.resetPluginData();
        });
      }
    }
    restoreScrollPosition();
  }

  public override async onClose(): Promise<void> {
    await this.application.flushJournalDraft();
    this.renderScope?.unload();
    clearHomepageBannerImageState(this.contentEl);
    this.renderScope = null;
    this.contentEl.empty();
    this.contentEl.removeClass("homepage-studio");
    this.contentEl.removeAttribute("data-status");
    this.contentEl.removeAttribute("data-theme");
    this.contentEl.removeAttribute("data-appearance");
    this.contentEl.removeAttribute(
      "data-homepage-studio-heatmap-selected-date"
    );
    this.containerEl.removeAttribute("data-homepage-studio-theme");
  }
}
