import { Modal, type App } from "obsidian";
import type {
  TaskDeleteConfirmationPort,
  TaskSourceAppendConfirmationPort
} from "../../application/HomepageApplicationFacade";
import type { LocalizationService } from
  "../../application/services/LocalizationService";
import type { Messages } from "../../localization/messages";
import { createMinimalTaskSource } from "../../domain/tasks/taskSource";
import {
  captureModalTrigger,
  restoreModalTrigger
} from "./ModalFocusRestore";

interface ConfirmationCopy {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly preview?: string;
}

class TaskConfirmationModal extends Modal {
  private resolved = false;

  public constructor(
    app: App,
    private readonly messages: Messages,
    private readonly copy: ConfirmationCopy,
    private readonly trigger: HTMLElement | null,
    private readonly resolve: (confirmed: boolean) => void
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.titleEl.setText(this.copy.title);
    this.contentEl.empty();
    this.contentEl.createEl("p", {
      text: this.copy.description
    });
    if (this.copy.preview !== undefined) {
      this.contentEl.createEl("pre", {
        text: this.copy.preview
      });
    }
    const actions = this.contentEl.createDiv({
      cls: "homepage-studio-task-confirmation-actions"
    });
    const cancel = actions.createEl("button", {
      text: this.messages.cancel,
      attr: { type: "button" }
    });
    const confirm = actions.createEl("button", {
      cls: "mod-warning",
      text: this.copy.confirmLabel,
      attr: { type: "button" }
    });
    cancel.onclick = () => {
      this.finish(false);
    };
    confirm.onclick = () => {
      this.finish(true);
    };
    cancel.focus();
  }

  public override onClose(): void {
    if (!this.resolved) {
      this.resolved = true;
      this.resolve(false);
    }
    this.contentEl.empty();
    restoreModalTrigger(this.trigger);
  }

  private finish(confirmed: boolean): void {
    if (!this.resolved) {
      this.resolved = true;
      this.resolve(confirmed);
    }
    this.close();
  }
}

export class TaskSourceAppendConfirmation
implements TaskSourceAppendConfirmationPort {
  public constructor(
    private readonly app: App,
    private readonly localization: LocalizationService
  ) {}

  public confirm(path: string): Promise<boolean> {
    const messages = this.localization.getMessages();
    return new Promise((resolve) => {
      new TaskConfirmationModal(
        this.app,
        messages,
        {
          title: messages.tasksAppendTitle,
          description: messages.tasksAppendDescription.replace("{path}", path),
          confirmLabel: messages.tasksAppendConfirm,
          preview: createMinimalTaskSource()
        },
        captureModalTrigger(this.app),
        resolve
      ).open();
    });
  }
}

export class TaskDeleteConfirmation implements TaskDeleteConfirmationPort {
  public constructor(
    private readonly app: App,
    private readonly localization: LocalizationService
  ) {}

  public confirm(text: string, path: string): Promise<boolean> {
    const messages = this.localization.getMessages();
    return new Promise((resolve) => {
      new TaskConfirmationModal(
        this.app,
        messages,
        {
          title: messages.tasksDeleteTitle,
          description: messages.tasksDeleteDescription
            .replace("{task}", text)
            .replace("{path}", path),
          confirmLabel: messages.tasksConfirmDelete
        },
        captureModalTrigger(this.app),
        resolve
      ).open();
    });
  }
}
