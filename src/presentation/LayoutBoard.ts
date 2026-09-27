import type { Layout, ModuleId } from "../domain/data/types";
import { visibleLayoutRows } from "../domain/layout/layout";

/** Shared structure for the real homepage and its scaled layout preview. */
export function renderLayoutBoard(
  container: HTMLElement,
  layout: Layout,
  render: (parent: HTMLElement, module: ModuleId) => void
): void {
  container.setAttribute("data-layout-board", "true");
  for (const row of visibleLayoutRows(layout)) {
    const rowEl = container.createDiv({ cls: "homepage-studio-layout-row" });
    for (const column of row.columns) {
      const columnEl = rowEl.createDiv({ cls: "homepage-studio-layout-column", attr: { "data-width": column.size } });
      for (const module of column.modules) render(columnEl, module);
    }
  }
}
