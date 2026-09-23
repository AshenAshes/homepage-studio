import type { Component } from "obsidian";

interface PeriodRow {
  row: HTMLElement;
  flush: () => boolean;
  move: (offset: number) => boolean;
}
const entries = new WeakMap<HTMLElement, PeriodRow>();
const drags = new WeakMap<HTMLElement, PeriodRow>();

export function attachPlanPeriodDrag(
  container: HTMLElement, row: HTMLElement, handle: HTMLButtonElement,
  scope: Component, flush: () => boolean, move: (offset: number) => boolean
): void {
  const entry = { row, flush, move };
  entries.set(row, entry);
  const rows = (): HTMLElement[] => Array.from(container.children)
    .filter((child): child is HTMLElement => entries.has(child as HTMLElement));
  const prepare = (): boolean => rows().every((item) => entries.get(item)?.flush() === true);
  const clear = (): void => {
    for (const item of rows()) {
      item.removeAttribute("data-drop-position");
      item.removeAttribute("data-dragging");
    }
    drags.delete(container);
  };
  const place = (source: PeriodRow, target: HTMLElement, after: boolean): void => {
    const list = rows();
    const from = list.indexOf(source.row);
    const to = list.indexOf(target);
    if (from < 0 || to < 0) return;
    const destination = to + (after ? 1 : 0) - (from < to + (after ? 1 : 0) ? 1 : 0);
    if (destination === from || !prepare()) return;
    if (!source.move(destination - from)) return;
    container.insertBefore(source.row, after ? target.nextSibling : target);
  };
  handle.draggable = !handle.disabled;
  scope.registerDomEvent(handle, "dragstart", (event) => {
    if (handle.disabled || !prepare()) { event.preventDefault(); return; }
    drags.set(container, entry);
    row.setAttribute("data-dragging", "true");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", "homepage-plan-period");
      event.dataTransfer.setDragImage(row, 12, 12);
    }
    event.stopPropagation();
  });
  scope.registerDomEvent(row, "dragover", (event) => {
    if (!drags.has(container)) return;
    event.preventDefault();
    event.stopPropagation();
    for (const item of rows()) item.removeAttribute("data-drop-position");
    const bounds = row.getBoundingClientRect();
    row.setAttribute("data-drop-position", event.clientY >= bounds.top + bounds.height / 2 ? "after" : "before");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });
  scope.registerDomEvent(row, "drop", (event) => {
    const source = drags.get(container);
    if (!source) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = row.getBoundingClientRect();
    place(source, row, event.clientY >= bounds.top + bounds.height / 2);
    clear();
  });
  scope.registerDomEvent(handle, "dragend", clear);
  scope.registerDomEvent(handle, "keydown", (event) => {
    if (event.key === "Escape") { clear(); return; }
    if (handle.disabled || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const list = rows();
    const target = list[list.indexOf(row) + (event.key === "ArrowUp" ? -1 : 1)];
    if (target) place(entry, target, event.key === "ArrowDown");
    handle.focus({ preventScroll: true });
  });
  scope.register(() => { clear(); entries.delete(row); });
}
