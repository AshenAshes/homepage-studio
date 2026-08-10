import {
  Modal,
  type App
} from "obsidian";
import type {
  LayoutResetConfirmationPort
} from "../../application/HomepageApplicationFacade";
import type { LocalizationService } from
  "../../application/services/LocalizationService";
import type { ThemeId } from "../../domain/data/types";
import type { Messages } from "../../localization/messages";
import {
  captureModalTrigger,
  restoreModalTrigger
} from "./ModalFocusRestore";

class LayoutResetModal extends Modal {
  private settled = false;

  public constructor(
    app: App,
    private readonly messages: Messages,
    private readonly theme: ThemeId,
    private readonly trigger: HTMLElement | null,
    private readonly resolve: (confirmed: boolean) => void
  ) {
    super(app);
  }

  public override onOpen(): void {
    this.titleEl.setText(this.messages.layoutResetTitle);
    this.contentEl.createEl("p", {
      text: this.messages.layoutResetDescription.replace(
        "{theme}",
        getThemeLabel(this.theme, this.messages)
      )
    });
    const actions = this.contentEl.createDiv({
      cls: "homepage-studio-layout-reset-actions"
    });
    const cancel = actions.createEl("button", {
      text: this.messages.cancel,
      attr: { type: "button" }
    });
    const confirm = actions.createEl("button", {
      cls: "mod-warning",
      text: this.messages.layoutConfirmReset,
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

const getThemeLabel = (theme: ThemeId, messages: Messages): string => ({
  "klein-blue": messages.themeKleinBlue,
  "watercolor-journal": messages.themeWatercolorJournal,
  "celestial-orbit": messages.themeCelestialOrbit,
  "minimal-paper": messages.themeMinimalPaper,
  "archive-observatory": messages.themeArchiveObservatory,
  "cosmic-cartography": messages.themeCosmicCartography
})[theme];

export class LayoutResetConfirmation
implements LayoutResetConfirmationPort {
  public constructor(
    private readonly app: App,
    private readonly localization: LocalizationService
  ) {}

  public confirm(theme: ThemeId): Promise<boolean> {
    return new Promise((resolve) => {
      new LayoutResetModal(
        this.app,
        this.localization.getMessages(),
        theme,
        captureModalTrigger(this.app),
        resolve
      ).open();
    });
  }
}
