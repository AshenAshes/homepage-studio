import type { Diagnostic, DiagnosticRecorder } from "../domain/diagnostics";

export class InMemoryDiagnosticRecorder implements DiagnosticRecorder {
  private readonly diagnostics: Diagnostic[] = [];

  public record(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic);
  }

  public getAll(): readonly Diagnostic[] {
    return [...this.diagnostics];
  }
}
