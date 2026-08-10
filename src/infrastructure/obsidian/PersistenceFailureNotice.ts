import { Notice } from "obsidian";
import type { PersistenceFailureNotifier } from "../persistence/SerialPersistenceCoordinator";
import type { RecoveryFailurePort } from "../../application/HomepageApplicationFacade";
import type { MessageProvider } from "../../application/services/LocalizationService";

const absolutePathPattern = /(?:[A-Za-z]:[\\/]|\/)[^\s"'<>]+/g;

export const describePersistenceFailure = (
  error: unknown,
  unknownReason: string
): string => {
  const rawReason = error instanceof Error ? error.message : String(error);
  const trimmed = rawReason.trim();
  return (trimmed === "" ? unknownReason : trimmed)
    .replace(absolutePathPattern, "data.json");
};

export class PersistenceFailureNotice
implements PersistenceFailureNotifier, RecoveryFailurePort {
  public constructor(private readonly localization: MessageProvider) {}

  public notify(error: unknown): void {
    const messages = this.localization.getMessages();
    new Notice(
      `${messages.persistenceWriteFailed}: ${describePersistenceFailure(
        error,
        messages.persistenceUnknownReason
      )} — ${messages.persistenceWriteRecoveryAction}`
    );
  }

  public notifyBackupFailure(error: unknown): void {
    const messages = this.localization.getMessages();
    new Notice(
      `${messages.backupFailed}: ${describePersistenceFailure(
        error,
        messages.persistenceUnknownReason
      )} — ${messages.resetBackupRecoveryAction}`
    );
  }
}
