import {
  Modal,
  type App
} from "obsidian";
import type {
  DailyPlanTemplateDeleteConfirmationPort
} from "../../application/HomepageApplicationFacade";
import type { LocalizationService } from
  "../../application/services/LocalizationService";
import type { Messages } from "../../localization/messages";
import {
  captureModalTrigger,
  restoreModalTrigger
} from "./ModalFocusRestore";

class DailyPlanDeleteModal extends Modal {
  private settled = false;

  public constructor(
    app: App,
    private readonly messages: Messages,
    private readonly name: string,
    private readonly selected: boolean,
    private readonly trigger: HTMLElement | null,
    private readonly resolve: (confirmed: boolean) => void
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.titleEl.setText(this.messages.planDeleteTitle);
    this.contentEl.createEl("p", {
      text: this.messages.planDeleteDescription.replace("{name}", this.name)
    });
    if (this.selected) {
      this.contentEl.createEl("p", {
        cls: "homepage-studio-plan-delete-warning",
        text: this.messages.planDeleteSelectedDescription
      });
    }
    const actions = this.contentEl.createDiv({
      cls: "homepage-studio-plan-delete-actions"
    });
    const cancel = actions.createEl("button", {
      text: this.messages.cancel,
      attr: { type: "button" }
    });
    const confirm = actions.createEl("button", {
      cls: "mod-warning",
      text: this.messages.planConfirmDelete,
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

export class DailyPlanDeleteConfirmation
implements DailyPlanTemplateDeleteConfirmationPort {
  public constructor(
    private readonly app: App,
    private readonly localization: LocalizationService
  ) {}

  public confirm(name: string, selected: boolean): Promise<boolean> {
    return new Promise((resolve) => {
      new DailyPlanDeleteModal(
        this.app,
        this.localization.getMessages(),
        name,
        selected,
        captureModalTrigger(this.app),
        resolve
      ).open();
    });
  }
}
