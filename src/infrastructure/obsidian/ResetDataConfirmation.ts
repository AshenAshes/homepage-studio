import { Modal, type App } from "obsidian";
import type { ResetConfirmationPort } from "../../application/HomepageApplicationFacade";
import type { MessageProvider } from "../../application/services/LocalizationService";
import type { Messages } from "../../localization/messages";
import {
  captureModalTrigger,
  restoreModalTrigger
} from "./ModalFocusRestore";

class ResetDataModal extends Modal {
  private resolved = false;
  private step: "warning" | "final" = "warning";

  public constructor(
    app: App,
    private readonly messages: Messages,
    private readonly trigger: HTMLElement | null,
    private readonly resolve: (confirmed: boolean) => void
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.renderStep();
  }

  private renderStep(): void {
    this.titleEl.empty();
    this.titleEl.createSpan({
      text: this.step === "warning"
        ? this.messages.resetDataTitle
        : this.messages.resetDataFinalTitle
    });
    this.contentEl.empty();
    this.contentEl.createEl("p", {
      text: this.step === "warning"
        ? this.messages.resetDataDescription
        : this.messages.resetDataFinalDescription
    });
    const actions = this.contentEl.createDiv({
      cls: "homepage-studio-reset-actions"
    });
    const cancelButton = actions.createEl("button", {
      text: this.messages.cancel,
      attr: { type: "button" }
    });
    const resetButton = actions.createEl("button", {
      cls: "mod-warning",
      text: this.step === "warning"
        ? this.messages.continueResetData
        : this.messages.confirmResetData,
      attr: { type: "button" }
    });
    cancelButton.onclick = () => {
      this.finish(false);
    };
    resetButton.onclick = () => {
      if (this.step === "warning") {
        this.step = "final";
        this.renderStep();
        return;
      }
      this.finish(true);
    };
    cancelButton.focus();
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

export class ResetDataConfirmation implements ResetConfirmationPort {
  public constructor(
    private readonly app: App,
    private readonly localization: MessageProvider
  ) {}

  public confirmReset(): Promise<boolean> {
    return new Promise((resolve) => {
      new ResetDataModal(
        this.app,
        this.localization.getMessages(),
        captureModalTrigger(this.app),
        resolve
      ).open();
    });
  }
}
