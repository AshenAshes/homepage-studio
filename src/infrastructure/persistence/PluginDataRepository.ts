import type { PluginDataLoadResult } from "../../application/ports/PluginDataPort";
import type { Diagnostic } from "../../domain/diagnostics";
import { createDefaultPluginData } from "../../domain/data/defaults";
import type { PluginData } from "../../domain/data/types";
import { validatePluginData } from "../../domain/data/validation";
import type { PluginDataWriter } from "./SerialPersistenceCoordinator";

export interface PluginDataHost {
  loadData(): Promise<unknown>;
  saveData(data: PluginData): Promise<void>;
}

export interface PluginDataExistence {
  exists(path: string): Promise<boolean>;
}

const loadFailureDiagnostic = (error: unknown): Diagnostic => ({
  code: error instanceof SyntaxError ? "DATA-JSON-PARSE" : "DATA-LOAD",
  messageKey: "diagnosticInvalidData",
  relatedPaths: ["data.json"],
  details: error instanceof Error ? error.message : String(error),
  severity: "error",
  suggestedActionKey: "diagnosticRepairData"
});

export class PluginDataRepository implements PluginDataWriter {
  public constructor(
    private readonly host: PluginDataHost,
    private readonly existence: PluginDataExistence,
    private readonly dataPath: string
  ) {}

  public async load(): Promise<PluginDataLoadResult> {
    if (!await this.existence.exists(this.dataPath)) {
      return {
        type: "new",
        data: createDefaultPluginData()
      };
    }

    let input: unknown;
    try {
      input = await this.host.loadData();
    } catch (error) {
      return {
        type: "safe",
        diagnostics: [loadFailureDiagnostic(error)]
      };
    }

    const validation = validatePluginData(input);
    if (validation.type === "invalid") {
      return { type: "safe", diagnostics: validation.diagnostics };
    }
    return {
      type: "ready",
      data: validation.data,
      migrated: JSON.stringify(input) !== JSON.stringify(validation.data)
    };
  }

  public save(data: PluginData): Promise<void> {
    return this.host.saveData(data);
  }
}
