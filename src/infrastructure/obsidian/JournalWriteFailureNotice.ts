import { Notice } from "obsidian";
import type { JournalWriteFailurePort } from
  "../../application/HomepageApplicationFacade";
import type { JournalDraftState } from
  "../../application/services/DateSectionJournalDraftService";
import type { LocalizationService } from
  "../../application/services/LocalizationService";

type FailureReason = Extract<JournalDraftState, {
  readonly type: "failed";
}>["reason"];

export class JournalWriteFailureNotice implements JournalWriteFailurePort {
  public constructor(private readonly localization: LocalizationService) {}

  public notify(reason: FailureReason, path: string): void {
    const messages = this.localization.getMessages();
    const message = reason === "missing-source"
      ? messages.journalWriteMissing
      : reason === "invalid-source"
        ? messages.journalWriteInvalid
        : reason === "future-date"
          ? messages.journalWriteFuture
          : messages.journalWriteIo;
    new Notice(message.replace("{path}", path));
  }
}
