import type { Diagnostic } from "../../domain/diagnostics";
import type { PluginData } from "../../domain/data/types";

export type PluginDataLoadResult =
  | { readonly type: "new"; readonly data: PluginData }
  | {
    readonly type: "ready";
    readonly data: PluginData;
    readonly migrated?: boolean;
  }
  | { readonly type: "safe"; readonly diagnostics: readonly Diagnostic[] };

export interface PluginDataLoader {
  load(): Promise<PluginDataLoadResult>;
}

export interface PluginDataResetBackup {
  beginSession(hasExistingValidData: boolean): void;
  createTimestampedBackup(): Promise<string>;
}
