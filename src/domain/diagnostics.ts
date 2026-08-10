export type DiagnosticMessageKey =
  | "diagnosticDuplicateHomepage"
  | "diagnosticInvalidData"
  | "diagnosticReloadWorkspace"
  | "diagnosticRepairData";

export interface Diagnostic {
  readonly code:
    | `DATA-${string}`
    | `IO-${string}`
    | `VIEW-${string}`;
  readonly messageKey: DiagnosticMessageKey;
  readonly relatedPaths: readonly string[];
  readonly details?: string;
  readonly severity: "warning" | "error";
  readonly suggestedActionKey: DiagnosticMessageKey;
}

export interface DiagnosticRecorder {
  record(diagnostic: Diagnostic): void;
}
