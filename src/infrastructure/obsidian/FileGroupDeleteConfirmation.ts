import {
  Modal,
  type App
} from "obsidian";
import type {
  FileGroupDeleteConfirmationPort
} from "../../application/HomepageApplicationFacade";
import type { LocalizationService } from
  "../../application/services/LocalizationService";
import type { Messages } from "../../localization/messages";
import {
  captureModalTrigger,
  restoreModalTrigger
} from "./ModalFocusRestore";

class FileGroupDeleteModal extends Modal {
  private settled = false;

  public constructor(
    app: App,
    private readonly messages: Messages,
    private readonly name: string,
    private readonly entryCount: number,
    private readonly trigger: HTMLElement | null,
    private readonly resolve: (confirmed: boolean) => void
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.titleEl.setText(this.messages.fileGroupsDeleteTitle);
    this.contentEl.createEl("p", {
      text: this.messages.fileGroupsDeleteDescription
        .replace("{name}", this.name)
        .replace("{count}", this.entryCount.toString())
    });
    const actions = this.contentEl.createDiv({
      cls: "homepage-studio-file-group-delete-actions"
    });
    const cancel = actions.createEl("button", {
      text: this.messages.cancel,
      attr: { type: "button" }
    });
    const confirm = actions.createEl("button", {
      cls: "mod-warning",
      text: this.messages.fileGroupsConfirmDelete,
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
    this.contentEl.empty();
    this.finish(false, false);
    restoreModalTrigger(this.trigger);
  }

  private finish(confirmed: boolean, close = true): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolve(confirmed);
    if (close) {
      this.close();
    }
  }
}

export class FileGroupDeleteConfirmation
implements FileGroupDeleteConfirmationPort {
  public constructor(
    private readonly app: App,
    private readonly localization: LocalizationService
  ) {}

  public confirm(name: string, entryCount: number): Promise<boolean> {
    return new Promise((resolve) => {
      new FileGroupDeleteModal(
        this.app,
        this.localization.getMessages(),
        name,
        entryCount,
        captureModalTrigger(this.app),
        resolve
      ).open();
    });
  }
}
