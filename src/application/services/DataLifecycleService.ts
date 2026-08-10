import { AppStore } from "../AppStore";
import type {
  PluginDataLoader,
  PluginDataResetBackup
} from "../ports/PluginDataPort";
import { createDefaultPluginData } from "../../domain/data/defaults";

export type ResetResult =
  | { readonly type: "reset" }
  | { readonly type: "backup-failed"; readonly error: unknown };

export class DataLifecycleService {
  private hasExistingData = false;

  public constructor(
    private readonly store: AppStore,
    private readonly repository: PluginDataLoader,
    private readonly backup: PluginDataResetBackup
  ) {}

  public initialize(): Promise<void> {
    return this.reload();
  }

  public async reload(): Promise<void> {
    const loaded = await this.repository.load();
    this.hasExistingData = loaded.type !== "new";

    if (loaded.type === "safe") {
      this.backup.beginSession(false);
      this.store.initializeSafe(loaded.diagnostics);
      return;
    }

    const existingValidData = loaded.type === "ready";
    this.backup.beginSession(existingValidData);
    this.store.initializeReady(
      loaded.data,
      loaded.type === "new" || loaded.migrated === true
    );
  }

  public async reset(): Promise<ResetResult> {
    if (this.hasExistingData) {
      try {
        await this.backup.createTimestampedBackup();
      } catch (error) {
        return {
          type: "backup-failed",
          error
        };
      }
    }

    this.hasExistingData = true;
    this.backup.beginSession(false);
    this.store.initializeReady(createDefaultPluginData(), true);
    return { type: "reset" };
  }
}
