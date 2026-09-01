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
  refreshHomepageTemporalContent,
  renderHomepageShell
} from "./HomepageShellRenderer";
import { attachAccessibleLabel } from "./accessibility";

export class HomepageView extends ItemView {
  private renderScope: Component | null = null;
  private pendingFileEntryFocusId: string | null = null;
  private pendingFileEntryAnnouncement: string | null = null;
  private pendingTaskAnnouncement: string | null = null;
  private fileGroupEntryDragActive = false;
  private taskDragActive = false;
  private taskDragSourceRevision: number | null = null;
  private cancelTaskDrag: (() => void) | null = null;
  private textInputInteractionActive = false;
  private renderPending = false;
  private suppressNextFullNotification = false;
  private closing = false;

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
    return this.application.getHomepageTitle();
  }

  public override getIcon(): string {
    return HOMEPAGE_ICON;
  }

  public override onOpen(): Promise<void> {
    this.closing = false;
    this.register(this.application.subscribeHomepageState(() => {
      if (this.suppressNextFullNotification) {
        this.suppressNextFullNotification = false;
        return;
      }
      this.requestRender();
    }));
    this.register(this.application.subscribeHomepageLocalTime(
      (dateChanged) => {
        if (dateChanged) {
          this.suppressNextFullNotification = true;
          this.containerEl.ownerDocument.defaultView?.queueMicrotask(() => {
            this.suppressNextFullNotification = false;
          });
          this.requestRender();
          return;
        }
        this.requestTemporalRefresh();
      }
    ));
    if (typeof this.app.workspace?.on === "function") {
      this.registerEvent(this.app.workspace.on(
        "active-leaf-change",
        (leaf) => {
          if (leaf === this.leaf && this.renderPending) {
            this.requestRender(true);
          }
        }
      ));
    }
    this.requestRender();
    return Promise.resolve();
  }

  private requestRender(allowHidden = false): void {
    if (this.closing) {
      return;
    }
    if (!allowHidden && this.isInactiveTab()) {
      this.renderPending = true;
      return;
    }
    if (this.taskDragActive) {
      const snapshot = this.application.getSnapshot();
      if (snapshot.status === "ready" && snapshot.shell !== null) {
        refreshHomepageTemporalContent(this.contentEl, snapshot.shell);
        const revision = snapshot.shell.modules.find(
          (module) => module.id === "tasks"
        )?.tasks?.sourceRevision ?? null;
        if (
          this.cancelTaskDrag !== null
          && revision !== this.taskDragSourceRevision
        ) {
          this.renderPending = true;
          this.cancelTaskDrag();
          return;
        }
      }
      this.renderPending = true;
      return;
    }
    if (
      this.fileGroupEntryDragActive
      || this.textInputInteractionActive
    ) {
      const snapshot = this.application.getSnapshot();
      if (snapshot.status === "ready" && snapshot.shell !== null) {
        refreshHomepageTemporalContent(this.contentEl, snapshot.shell);
      }
      this.renderPending = true;
      return;
    }
    this.renderPending = false;
    this.render();
  }

  private isInactiveTab(): boolean {
    const leaf = this.containerEl.closest<HTMLElement>(".workspace-leaf");
    return leaf?.style.display === "none";
  }

  private requestTemporalRefresh(): void {
    if (this.closing) {
      return;
    }
    if (this.isInactiveTab()) {
      this.renderPending = true;
      return;
    }
    const snapshot = this.application.getTemporalSnapshot();
    if (snapshot !== null) {
      refreshHomepageTemporalContent(this.contentEl, snapshot);
    }
  }

  private beginFileGroupEntryDrag(): void {
    this.fileGroupEntryDragActive = true;
  }

  private endFileGroupEntryDrag(): void {
    this.fileGroupEntryDragActive = false;
    if (this.renderPending) {
      this.requestRender();
    }
  }

  private beginTaskDrag(
    sourceRevision: number,
    cancel: () => void
  ): void {
    this.taskDragActive = true;
    this.taskDragSourceRevision = sourceRevision;
    this.cancelTaskDrag = cancel;
  }

  private commitTaskDrag(): void {
    this.cancelTaskDrag = null;
    this.taskDragSourceRevision = null;
  }

  private endTaskDrag(): void {
    this.taskDragActive = false;
    this.taskDragSourceRevision = null;
    this.cancelTaskDrag = null;
    if (this.renderPending) {
      this.requestRender();
    }
  }

  private beginTextInputInteraction(): void {
    this.textInputInteractionActive = true;
  }

  private endTextInputInteraction(
    focusTarget?: "task-add"
  ): void {
    this.textInputInteractionActive = false;
    if (this.renderPending) {
      this.requestRender();
    }
    if (focusTarget === "task-add") {
      this.contentEl.querySelector<HTMLElement>(
        ".homepage-studio-task-add-button"
      )?.focus({ preventScroll: true });
    }
  }

  private render(): void {
    const snapshot = this.application.getSnapshot();
    const scrollTop = this.contentEl.scrollTop;
    const scrollLeft = this.contentEl.scrollLeft;
    const journalEditor = this.contentEl.querySelector<HTMLTextAreaElement>(
      ".homepage-studio-journal-editor"
    );
    const journalSelection = journalEditor !== null
      && this.contentEl.ownerDocument.activeElement === journalEditor
      ? {
        start: journalEditor.selectionStart,
        end: journalEditor.selectionEnd,
        direction: journalEditor.selectionDirection
      }
      : null;
    const restoreScrollPosition = (): void => {
      this.contentEl.scrollTop = scrollTop;
      this.contentEl.scrollLeft = scrollLeft;
    };
    this.renderScope?.unload();
    const renderScope = new Component();
    this.renderScope = renderScope;
    renderScope.registerDomEvent(this.contentEl, "click", (event) => {
      const target = event.target;
      if (
        target instanceof Element
        && (
          target.closest(".homepage-studio-journal-editor") !== null
          || target.closest(".homepage-studio-task-add") !== null
          || target.closest(
            '.homepage-studio-task[data-editing="true"]'
          ) !== null
        )
      ) {
        return;
      }
      this.endTextInputInteraction();
    });

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
            this.endTextInputInteraction();
            void this.application.moveJournalDate(offsetDays);
          },
          updateJournalDraft: (content) => {
            this.application.updateJournalDraft(content);
          },
          flushJournalDraft: () => {
            void this.application.flushJournalDraft();
          },
          setJournalViewMode: (viewMode) => {
            this.endTextInputInteraction();
            this.application.setJournalViewMode(viewMode);
          },
          reloadJournalDraft: () => {
            this.endTextInputInteraction();
            this.application.reloadJournalDraft();
          },
          deleteJournalEntry: () => {
            this.endTextInputInteraction();
            void this.application.deleteCurrentJournalEntry();
          },
          addTask: async (text) => {
            const result = await this.application.addTask(text);
            return result.type === "applied";
          },
          updateTaskAddDraft: (text) => {
            this.application.updateTaskAddDraft(text);
          },
          beginTaskEdit: (target, text) => {
            this.application.beginTaskEdit(target, text);
          },
          updateTaskEditDraft: (text) => {
            this.application.updateTaskEditDraft(text);
          },
          saveTaskEdit: async () => {
            const result = await this.application.saveTaskEdit();
            return result.type === "applied" || result.type === "noop";
          },
          cancelTaskEdit: () => {
            this.application.cancelTaskEdit();
          },
          beginTextInputInteraction: () => {
            this.beginTextInputInteraction();
          },
          endTextInputInteraction: (focusTarget) => {
            this.endTextInputInteraction(focusTarget);
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
          beginTaskDrag: (sourceRevision, cancel) => {
            this.beginTaskDrag(sourceRevision, cancel);
          },
          commitTaskDrag: () => {
            this.commitTaskDrag();
          },
          endTaskDrag: () => {
            this.endTaskDrag();
          },
          reorderTask: async (request) => {
            const result = await this.application.reorderTask(
              request.target,
              request.before
            );
            return result.type === "applied" || result.type === "noop"
              ? result
              : result.type === "conflict"
                ? { type: "conflict" }
                : { type: "blocked" };
          },
          announceTaskMove: (announcement) => {
            this.pendingTaskAnnouncement = announcement;
          },
          showMoreFileGroupEntries: () => {
            this.application.showMoreFileGroupEntries();
          },
          beginFileGroupEntryDrag: () => {
            this.beginFileGroupEntryDrag();
          },
          endFileGroupEntryDrag: () => {
            this.endFileGroupEntryDrag();
          },
          getAllFileGroups: () =>
            this.application.getAllFileGroupsViewModel(),
          moveFileGroupEntry: (request, announcement) => {
            this.pendingFileEntryFocusId = request.entryId;
            this.pendingFileEntryAnnouncement = announcement;
            const result = this.application.moveFileGroupEntryTo(
              request.sourceGroupId,
              request.entryId,
              request.target
            );
            if (result.type !== "applied") {
              this.pendingFileEntryFocusId = null;
              this.pendingFileEntryAnnouncement = null;
            }
            return result;
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
      if (journalSelection !== null) {
        const nextEditor = this.contentEl.querySelector<HTMLTextAreaElement>(
          ".homepage-studio-journal-editor"
        );
        if (nextEditor !== null) {
          nextEditor.focus({ preventScroll: true });
          nextEditor.setSelectionRange(
            journalSelection.start,
            journalSelection.end,
            journalSelection.direction
          );
        }
      }
      if (this.pendingFileEntryAnnouncement !== null) {
        this.contentEl.querySelector<HTMLElement>(
          ".homepage-studio-file-entry-reorder-live"
        )?.setText(this.pendingFileEntryAnnouncement);
        this.pendingFileEntryAnnouncement = null;
      }
      if (this.pendingTaskAnnouncement !== null) {
        this.contentEl.querySelector<HTMLElement>(
          ".homepage-studio-task-reorder-live"
        )?.setText(this.pendingTaskAnnouncement);
        this.pendingTaskAnnouncement = null;
      }
      if (this.pendingFileEntryFocusId !== null) {
        const pendingId = this.pendingFileEntryFocusId;
        this.pendingFileEntryFocusId = null;
        const movedItem = [
          ...this.contentEl.querySelectorAll<HTMLElement>(
            ".homepage-studio-file-entry-reorder-item"
          )
        ].find((item) => item.dataset.fileEntryId === pendingId);
        const movedSurface = movedItem?.querySelector<HTMLElement>(
          ".homepage-studio-file-entry-reorder-surface"
        );
        if (movedSurface !== null && movedSurface !== undefined) {
          movedSurface.focus({ preventScroll: true });
        } else {
          this.contentEl.querySelector<HTMLElement>(
            ".homepage-studio-file-groups .homepage-studio-collection-more"
          )?.focus({ preventScroll: true });
        }
      }
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
    this.closing = true;
    await this.application.flushJournalDraft();
    this.renderScope?.unload();
    clearHomepageBannerImageState(this.contentEl);
    this.renderScope = null;
    this.fileGroupEntryDragActive = false;
    this.pendingTaskAnnouncement = null;
    this.taskDragActive = false;
    this.taskDragSourceRevision = null;
    this.cancelTaskDrag = null;
    this.textInputInteractionActive = false;
    this.renderPending = false;
    this.suppressNextFullNotification = false;
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
