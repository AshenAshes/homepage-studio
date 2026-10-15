import type { Component } from "obsidian";
import { validateTaskText, type TaskTextValidationReason } from "../domain/tasks/taskOperations";

interface TaskNameEditorOptions {
  original: string;
  autofocus: boolean;
  invalid: boolean;
  failed: boolean;
  invalidReason: TaskTextValidationReason | null;
  invalidLabels: Readonly<Record<TaskTextValidationReason, string>>;
  failureLabel: string;
  update(text: string): void;
  reject(reason: TaskTextValidationReason): void;
  save(): Promise<boolean>;
  cancel(): void;
  begin(): void;
  end(): void;
}

export function attachTaskNameEditor(input: HTMLTextAreaElement, scope: Component, options: TaskNameEditorOptions): void {
  const resize = (): void => {
    input.setCssProps({ "--task-editor-height": "auto" });
    const style = input.ownerDocument.defaultView?.getComputedStyle(input);
    const border = style ? parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth) : 0;
    input.setCssProps({ "--task-editor-height": `${input.scrollHeight + border}px` });
  };
  let lastWidth = input.clientWidth;
  const widthObserver = new ResizeObserver(() => {
    if (input.clientWidth !== lastWidth) { lastWidth = input.clientWidth; resize(); }
  });
  widthObserver.observe(input);
  scope.register(() => widthObserver.disconnect());
  resize();
  let composing = false;
  let saving = false;
  let finished = false;
  let invalid = options.invalid;
  const error = input.parentElement?.createDiv({ cls: "homepage-studio-task-edit-error", attr: { role: "alert" } });
  const showInvalid = (reason: TaskTextValidationReason): void => {
    input.value = "";
    resize();
    input.placeholder = options.invalidLabels[reason];
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("data-invalid", "true");
    if (error) error.setText("");
  };
  if (invalid) showInvalid(options.invalidReason ?? "empty");
  if (options.failed && error) error.setText(options.failureLabel);
  const submit = async (): Promise<void> => {
    if (saving || finished || composing || invalid) return;
    const value = input.value.trim();
    const validation = validateTaskText(value);
    if (validation !== null) {
      invalid = true;
      showInvalid(validation.reason);
      options.reject(validation.reason);
      return;
    }
    if (value === options.original) {
      finished = true;
      options.cancel();
      options.end();
      return;
    }
    saving = true;
    input.readOnly = true;
    options.update(value);
    options.begin();
    try {
      if (await options.save()) {
        finished = true;
        options.end();
      } else if (error) error.setText(options.failureLabel);
    } catch {
      if (error) error.setText(options.failureLabel);
    } finally {
      saving = false;
      input.readOnly = false;
    }
  };
  scope.registerDomEvent(input, "focus", () => options.begin());
  scope.registerDomEvent(input, "input", () => {
    resize();
    invalid = false;
    input.placeholder = "";
    input.removeAttribute("aria-invalid");
    input.removeAttribute("data-invalid");
    if (error) error.setText("");
    options.begin();
    options.update(input.value);
  });
  scope.registerDomEvent(input, "compositionstart", () => { composing = true; });
  scope.registerDomEvent(input, "compositionend", () => { composing = false; options.update(input.value); });
  scope.registerDomEvent(input, "keydown", (event) => {
    if (event.isComposing || composing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape" && !saving) {
      event.preventDefault();
      finished = true;
      options.cancel();
      options.end();
    }
  });
  scope.registerDomEvent(input, "blur", () => { composing = false; void submit(); });
  // DOM replacement or view teardown must not accidentally submit a detached input.
  scope.register(() => { finished = true; });
  if (options.autofocus) {
    options.update(input.value);
    input.focus({ preventScroll: true });
    input.select();
  }
}
