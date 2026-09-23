import type { Component } from "obsidian";

/** A settings row is one transaction, even when it contains several inputs. */
export function attachSettingsAutoSave(
  inputs: readonly HTMLInputElement[],
  scope: Component,
  commit: () => boolean,
  clearError: () => void
): () => boolean {
  const targetWindow = inputs[0]?.ownerDocument.defaultView;
  if (!targetWindow || inputs.length === 0) return () => false;
  const snapshot = (): string => JSON.stringify(inputs.map((input) => input.value));
  let saved = snapshot();
  let attempted: string | null = null;
  let timer: number | null = null;
  let composing = false;
  let disposed = false;
  const cancelTimer = (): void => {
    if (timer !== null) targetWindow.clearTimeout(timer);
    timer = null;
  };
  const flush = (): boolean => {
    cancelTimer();
    if (disposed || composing || inputs.some((input) => input.disabled)) return false;
    const current = snapshot();
    if (current === saved) return true;
    if (current === attempted) return false;
    // Mark before committing: a store notification may synchronously unload this row.
    attempted = current;
    if (commit()) saved = current;
    return current === saved;
  };
  for (const input of inputs) {
    scope.registerDomEvent(input, "input", () => {
      cancelTimer();
      attempted = null;
      clearError();
      if (!composing) timer = targetWindow.setTimeout(flush, 500);
    });
    scope.registerDomEvent(input, "compositionstart", () => { composing = true; cancelTimer(); });
    scope.registerDomEvent(input, "compositionend", () => {
      composing = false;
      attempted = null;
      cancelTimer();
      timer = targetWindow.setTimeout(flush, 500);
    });
    scope.registerDomEvent(input, "blur", () => { composing = false; flush(); });
  }
  scope.register(() => {
    composing = false;
    flush();
    disposed = true;
    cancelTimer();
  });
  return flush;
}
