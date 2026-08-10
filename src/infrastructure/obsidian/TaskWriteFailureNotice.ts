import { Notice } from "obsidian";
import type { TaskWriteFailurePort } from
  "../../application/HomepageApplicationFacade";
import type { LocalizationService } from
  "../../application/services/LocalizationService";

export class TaskWriteFailureNotice implements TaskWriteFailurePort {
  public constructor(private readonly localization: LocalizationService) {}

  public notify(
    reason: Parameters<TaskWriteFailurePort["notify"]>[0],
    path: string
  ): void {
    const messages = this.localization.getMessages();
    const message = reason === "invalid-task"
      ? messages.tasksInvalidTask
      : reason === "conflict"
        ? messages.tasksConflict
        : messages.tasksWriteFailed.replace("{path}", path);
    new Notice(message);
  }
}
