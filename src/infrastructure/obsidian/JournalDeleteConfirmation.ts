import { Modal, type App } from "obsidian";
import type { JournalDeleteConfirmationPort } from
  "../../application/HomepageApplicationFacade";
import type { LocalizationService } from
  "../../application/services/LocalizationService";
import type { Messages } from "../../localization/messages";
import {
  captureModalTrigger,
  restoreModalTrigger
} from "./ModalFocusRestore";

class JournalDeleteModal extends Modal {
  private resolved = false;

  public constructor(
    app: App,
    private readonly messages: Messages,
    private readonly dateKey: string,
    private readonly path: string,
    private readonly trigger: HTMLElement | null,
    private readonly resolve: (confirmed: boolean) => void
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.titleEl.setText(this.messages.journalDeleteTitle);
    this.contentEl.empty();
    this.contentEl.createEl("p", {
      text: this.messages.journalDeleteDescription
        .replace("{date}", this.dateKey)
        .replace("{path}", this.path)
    });
    const actions = this.contentEl.createDiv({
      cls: "homepage-studio-journal-delete-actions"
    });
    const cancel = actions.createEl("button", {
      text: this.messages.cancel,
      attr: { type: "button" }
    });
    const confirm = actions.createEl("button", {
      cls: "mod-warning",
      text: this.messages.journalConfirmDelete,
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

export class JournalDeleteConfirmation
implements JournalDeleteConfirmationPort {
  public constructor(
    private readonly app: App,
    private readonly localization: LocalizationService
  ) {}

  public confirm(dateKey: string, path: string): Promise<boolean> {
    return new Promise((resolve) => {
      new JournalDeleteModal(
        this.app,
        this.localization.getMessages(),
        dateKey,
        path,
        captureModalTrigger(this.app),
        resolve
      ).open();
    });
  }
}
