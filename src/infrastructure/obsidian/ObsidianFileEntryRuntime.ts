import {
  TFile,
  type App
} from "obsidian";
import type {
  FileEntryRuntimePort,
  FileEntryStatus
} from "../../application/HomepageApplicationFacade";

export class ObsidianFileEntryRuntime implements FileEntryRuntimePort {
  public constructor(
    private readonly app: App,
    private readonly getNow: () => number = () => Date.now()
  ) {}

  public getStatus(path: string): FileEntryStatus {
    const target = this.app.vault.getAbstractFileByPath(path);
    if (target === null) {
      return "missing";
    }
    return target instanceof TFile ? "ready" : "invalid";
  }

  public now(): number {
    return this.getNow();
  }
}
