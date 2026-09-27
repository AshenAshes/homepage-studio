import type { Component } from "obsidian";
import type { Layout, ModuleId, ModuleSize, ThemeId } from "../domain/data/types";
import { placeLayoutModule, setModuleSize, setModuleVisibility, type LayoutPlacement } from "../domain/layout/layout";
import type { Messages } from "../localization/messages";
import { renderLayoutBoard } from "./LayoutBoard";

export function renderLayoutEditor(host: HTMLElement, options: {
  scope: Component; theme: ThemeId; appearance: string; layout: Layout; editable: boolean;
  messages: Messages; width: number; label: (module: ModuleId) => string;
  save: (layout: Layout) => boolean;
}): void {
  const { scope, messages } = options;
  const doc = host.ownerDocument; const win = doc.defaultView;
  if (!win) return;
  let layout = structuredClone(options.layout);
  let selected: ModuleId = layout.moduleOrder.find((id) => !layout.hiddenModules.includes(id)) ?? "heatmap";
  let width = Math.max(320, options.width);
  let scale = 1;
  let drag: { id: ModuleId; resize: boolean; x: number; y: number; pointer: number; original: Layout;
    active: boolean; candidate: Layout | null; key: string; minHeight: number;
    targets: { id: ModuleId; left: number; top: number; right: number; bottom: number }[];
    zone: { label: string } | null } | null = null;
  const placements: readonly LayoutPlacement[] = ["above", "below", "left", "right", "row-before", "row-after"];
  const placementLabels = [messages.layoutPlaceAbove, messages.layoutPlaceBelow, messages.layoutPlaceLeft,
    messages.layoutPlaceRight, messages.layoutPlaceRowBefore, messages.layoutPlaceRowAfter];
  const root = host.createDiv({ cls: "homepage-studio-layout-editor" });
  root.createEl("p", { cls: "setting-item-description", text: messages.layoutCanvasHelp });
  const toolbar = root.createDiv({ cls: "homepage-studio-layout-editor-toolbar" });
  const viewportField = toolbar.createDiv({ cls: "homepage-studio-layout-move-select" });
  const viewportSelect = viewportField.createEl("select", { attr: { "aria-label": messages.layoutPreviewWidth } });
  for (const [value, label] of [[options.width, messages.layoutPreviewCurrent], [1400, messages.layoutPreviewWide], [900, messages.layoutPreviewMedium], [600, messages.layoutPreviewNarrow]] as const) {
    viewportSelect.createEl("option", { value: String(value), text: `${label} (${Math.round(value)}px)` });
  }
  const moduleField = toolbar.createDiv({ cls: "homepage-studio-layout-move-select" });
  const moduleSelect = moduleField.createEl("select", { attr: { "aria-label": messages.layoutSelectedModule } });
  for (const id of layout.moduleOrder) moduleSelect.createEl("option", { value: id, text: options.label(id) });
  const inspector = root.createDiv({ cls: "homepage-studio-layout-editor-inspector" });
  inspector.createSpan({ text: messages.layoutColumnWidth });
  for (const size of ["compact", "standard", "expanded"] as const) {
    inspector.createEl("button", { text: size === "compact" ? messages.layoutSizeCompact : size === "standard" ? messages.layoutSizeStandard : messages.layoutSizeExpanded,
      attr: { type: "button", "data-board-size": size, ...(options.editable ? {} : { disabled: "" }) } });
  }
  const visibility = inspector.createEl("button", { attr: { type: "button", ...(options.editable ? {} : { disabled: "" }) } });
  const viewport = root.createDiv({ cls: "homepage-studio-layout-preview-viewport" });
  const scene = viewport.createDiv({ cls: "homepage-studio homepage-studio-layout-preview", attr: { "data-theme": options.theme, "data-appearance": options.appearance } });
  const shelf = root.createDiv({ cls: "homepage-studio-layout-hidden", attr: { "data-layout-hidden-shelf": "true" } });
  const status = root.createDiv({ cls: "homepage-studio-layout-editor-status", attr: { role: "status", "aria-live": "polite" } });
  const keyboard = root.createDiv({ cls: "homepage-studio-layout-move-controls" });
  const moveDescription = keyboard.createSpan({ cls: "homepage-studio-layout-move-description" });
  const targetField = keyboard.createDiv({ cls: "homepage-studio-layout-move-select" });
  const targetSelect = targetField.createEl("select", { attr: { "aria-label": messages.layoutMoveTarget } });
  const placementField = keyboard.createDiv({ cls: "homepage-studio-layout-move-select" });
  const placementSelect = placementField.createEl("select", { attr: { "aria-label": messages.layoutMovePlacement } });
  placements.forEach((placement, index) => { placementSelect.createEl("option", { value: placement, text: placementLabels[index] ?? placement }); });
  const moveButton = keyboard.createEl("button", { text: messages.layoutApplyMove, attr: { type: "button", ...(options.editable ? {} : { disabled: "" }) } });
  const updateMoveControls = (): void => {
    const previous = targetSelect.value;
    moveDescription.setText(messages.layoutMoveDescription.replace("{module}", options.label(selected)));
    targetSelect.empty();
    targetSelect.createEl("option", { value: "__start__", text: messages.layoutFirstRow });
    targetSelect.createEl("option", { attr: { value: "" }, text: messages.layoutNewRow });
    for (const id of layout.moduleOrder) {
      if (id !== selected && !layout.hiddenModules.includes(id)) targetSelect.createEl("option", { value: id, text: options.label(id) });
    }
    targetSelect.value = Array.from(targetSelect.options).some((option) => option.value === previous) ? previous : "";
    placementField.hidden = targetSelect.value === "" || targetSelect.value === "__start__";
  };
  scope.registerDomEvent(targetSelect, "change", () => { placementField.hidden = targetSelect.value === "" || targetSelect.value === "__start__"; });
  const fit = (): void => {
    scale = Math.min(1, viewport.clientWidth / width);
    scene.setCssProps({ "--layout-preview-width": `${width}px`, "--layout-preview-scale": String(scale) });
    viewport.setCssProps({ "--layout-preview-height": `${Math.ceil(Math.max(scene.scrollHeight * scale, drag?.active ? drag.minHeight : 0))}px` });
  };
  const render = (draft = layout): void => {
    scene.empty(); shelf.empty();
    const shell = scene.createDiv({ cls: "homepage-studio-shell" });
    if (draft.bannerVisible) {
      const banner = shell.createDiv({ cls: "homepage-studio-banner homepage-studio-layout-banner-sample" });
      banner.createEl("strong", { text: messages.homepageTitle });
      banner.createSpan({ text: messages.layoutPreviewSample });
    }
    const board = shell.createDiv({ cls: "homepage-studio-modules" });
    let ordinal = 0;
    renderLayoutBoard(board, draft, (parent, id) => {
      const card = parent.createEl("section", { cls: "homepage-studio-module homepage-studio-layout-preview-module", attr: {
        "data-layout-drag-module": id, "data-module": id, "data-size": draft.sizes[id] ?? "standard", "data-layout-module-id": id,
        "data-selected": String(id === selected), "data-preview-moving": String(drag?.active === true && drag.id === id),
        "data-preview-origin": String(drag?.active === true && drag.id === id && !(drag.candidate && drag.zone))
      } });
      const header = card.createDiv({ cls: "homepage-studio-module-header", attr: { role: "button", tabindex: "0", "aria-label": `${options.label(id)}: ${messages.layoutCanvasDrag}` } });
      const title = header.createDiv({ cls: "homepage-studio-module-title-group" });
      title.createSpan({ cls: "homepage-studio-module-title-marker", attr: { "data-layout-number": String(++ordinal).padStart(2, "0") } });
      title.createEl("h3", { cls: "homepage-studio-module-title", text: options.label(id) });
      const sample = card.createDiv({ cls: `homepage-studio-layout-sample homepage-studio-layout-sample-${id}`, attr: { "aria-hidden": "true" } });
      const count = id === "heatmap" ? 140 : id === "journal" ? 7 : id === "file-groups" ? 6 : 4;
      for (let i = 0; i < count; i++) sample.createSpan({ cls: "homepage-studio-layout-sample-mark" });
      const hide = card.createEl("button", { cls: "homepage-studio-layout-module-hide", text: "×", attr: { type: "button", "data-layout-hide": id, "aria-label": `${messages.layoutHideModule}: ${options.label(id)}`, ...(options.editable ? {} : { disabled: "" }) } });
      hide.title = messages.layoutHideModule;
      card.createEl("button", { cls: "homepage-studio-layout-resize", text: "↔", attr: { type: "button", "data-layout-resize": id, "aria-label": `${options.label(id)}: ${messages.layoutColumnWidth}`, ...(options.editable ? {} : { disabled: "" }) } });
    });
    if (draft.hiddenModules.length === draft.moduleOrder.length) {
      board.createDiv({ cls: "homepage-studio-layout-empty-canvas", text: messages.layoutEmptyCanvas });
    }
    shelf.createSpan({ text: messages.layoutHiddenModules });
    for (const id of draft.hiddenModules) shelf.createEl("button", { text: options.label(id), attr: {
      type: "button", "data-layout-restore": id, "data-layout-drag-module": id, ...(options.editable ? {} : { disabled: "" })
    } });
    moduleSelect.value = selected;
    updateMoveControls();
    for (const button of inspector.querySelectorAll<HTMLButtonElement>("[data-board-size]")) button.setAttribute("aria-pressed", String(button.dataset.boardSize === draft.sizes[selected]));
    visibility.setText(draft.hiddenModules.includes(selected) ? messages.layoutShowModule : messages.layoutHideModule);
    viewport.querySelector(".homepage-studio-layout-drop-zone")?.remove();
    fit();
    if (drag?.active && drag.candidate && drag.zone) {
      const preview = scene.querySelector<HTMLElement>(`[data-layout-module-id="${drag.id}"]`);
      const zone = preview?.createDiv({ cls: "homepage-studio-layout-drop-zone", attr: { "aria-hidden": "true" } });
      zone?.createSpan({ cls: "homepage-studio-layout-drop-label", text: drag.zone.label });
    }

  };
  const commit = (next: Layout | null): void => {
    if (!next) { status.setText(messages.layoutInvalidPlacement); return; }
    if (JSON.stringify(next) === JSON.stringify(layout)) { render(); return; }
    if (!options.save(next)) { status.setText(messages.layoutUnavailable); render(); return; }
    layout = structuredClone(next); status.setText(messages.layoutSaved); render();
  };
  const moduleId = (value: string | undefined): ModuleId | null => layout.moduleOrder.find((id) => id === value) ?? null;
  scope.registerDomEvent(viewportSelect, "change", () => { width = Number(viewportSelect.value); fit(); });
  scope.registerDomEvent(moduleSelect, "change", () => { selected = moduleId(moduleSelect.value) ?? selected; render(); });
  scope.registerDomEvent(visibility, "click", () => commit(setModuleVisibility(layout, selected, layout.hiddenModules.includes(selected))));
  scope.registerDomEvent(moveButton, "click", () => commit(placeLayoutModule(layout, selected, moduleId(targetSelect.value), targetSelect.value === "__start__" ? "row-before" : targetSelect.value === "" ? "row-after" : placementSelect.value as LayoutPlacement)));
  scope.registerDomEvent(root, "click", (event) => {
    const target = event.target as HTMLElement | null;
    const size = target?.closest<HTMLElement>("[data-board-size]")?.dataset.boardSize as ModuleSize | undefined;
    if (size) { commit(setModuleSize(layout, selected, size)); return; }
    const hide = moduleId(target?.closest<HTMLElement>("[data-layout-hide]")?.dataset.layoutHide);
    if (hide) { commit(setModuleVisibility(layout, hide, false)); return; }
    const restore = moduleId(target?.closest<HTMLElement>("[data-layout-restore]")?.dataset.layoutRestore);
    if (restore && !drag) commit(setModuleVisibility(layout, restore, true));
  });
  const stop = (save: boolean): void => {
    const current = drag; if (!current) return;
    drag = null; root.removeAttribute("data-dragging");
    if (save && current.active) commit(current.candidate);
    else if (save && layout.hiddenModules.includes(current.id) && !current.resize) commit(setModuleVisibility(layout, current.id, true));
    else render();
  };
  scope.registerDomEvent(root, "pointerdown", (event) => {
    if (!options.editable || event.button !== 0 || drag) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, input, select") && !target.closest("[data-layout-resize], [data-layout-restore]")) return;
    const handle = target?.closest<HTMLElement>("[data-layout-drag-module], [data-layout-resize]");
    const id = moduleId(handle?.dataset.layoutDragModule ?? handle?.dataset.layoutResize);
    if (!id) return;
    selected = id;
    event.preventDefault();
    const viewportRect = viewport.getBoundingClientRect();
    const targets = Array.from(scene.querySelectorAll<HTMLElement>("[data-layout-module-id]")).map((card) => {
      const r = card.getBoundingClientRect();
      return { id: card.dataset.layoutModuleId as ModuleId, left: (r.left - viewportRect.left) / scale,
        right: (r.right - viewportRect.left) / scale, top: (r.top - viewportRect.top) / scale, bottom: (r.bottom - viewportRect.top) / scale };
    });
    drag = { id, resize: handle?.dataset.layoutResize !== undefined, x: event.clientX, y: event.clientY,
      pointer: event.pointerId, original: structuredClone(layout), active: false, candidate: layout, key: "", minHeight: viewport.clientHeight, targets, zone: null };
    moduleSelect.value = selected;
  });
  scope.registerDomEvent(doc, "pointermove", (event) => {
    const current = drag; if (!current || current.pointer !== event.pointerId) return;
    if (!current.active && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5) return;
    current.active = true; root.setAttribute("data-dragging", "true"); event.preventDefault();
    if (current.resize) {
      const ratios = options.theme === "archive-observatory" ? [0.35, 0.60, 1] : [5 / 12, 7 / 12, 1];
      const sizes: ModuleSize[] = ["compact", "standard", "expanded"];
      const originalIndex = sizes.indexOf(current.original.sizes[current.id] ?? "standard");
      const desired = (ratios[originalIndex] ?? 0.5) + (event.clientX - current.x) / Math.max(1, width * scale);
      const index = ratios.reduce((best, value, i) => Math.abs(value - desired) < Math.abs((ratios[best] ?? 0) - desired) ? i : best, 0);
      current.candidate = setModuleSize(current.original, current.id, sizes[index] ?? "standard");
      render(current.candidate); return;
    }
    const viewportRect = viewport.getBoundingClientRect();
    const px = (event.clientX - viewportRect.left) / scale;
    const py = (event.clientY - viewportRect.top) / scale;
    const hit = doc.elementFromPoint(event.clientX, event.clientY);
    let next: Layout | null = null;
    let key = "outside";
    current.zone = null;
    if (hit?.closest("[data-layout-hidden-shelf]") === shelf) {
      next = setModuleVisibility(current.original, current.id, false); key = "hidden";
    } else if (px >= 0 && px <= width && py >= 0 && py <= viewport.clientHeight / scale) {
      let target = current.targets.find((r) => px >= r.left && px <= r.right && py >= r.top && py <= r.bottom);
      if (target?.id === current.id) { next = current.original; key = "original"; }
      else {
        const bottom = Math.max(0, ...current.targets.map((r) => r.bottom));
        if (py > bottom || current.targets.length === 0) {
          next = placeLayoutModule(current.original, current.id, null, "row-after"); key = "new-row";
          current.zone = { label: messages.layoutNewRow };
          status.setText(messages.layoutNewRow);
        } else {
          target ??= current.targets.filter((r) => r.id !== current.id).sort((a, b) => {
            const distance = (r: typeof a): number => Math.hypot(Math.max(r.left - px, 0, px - r.right), Math.max(r.top - py, 0, py - r.bottom));
            return distance(a) - distance(b);
          })[0];
          if (target) {
            const w = target.right - target.left; const h = target.bottom - target.top;
            const x = (px - target.left) / w; const y = (py - target.top) / h;
            const placement: LayoutPlacement = y < 0.12 ? "row-before" : y > 0.88 ? "row-after"
              : x < 0.22 ? "left" : x > 0.78 ? "right" : y < 0.5 ? "above" : "below";
            next = placeLayoutModule(current.original, current.id, target.id, placement);
            key = `${target.id}:${placement}`;
            const label = placementLabels[placements.indexOf(placement)] ?? "";
            current.zone = { label };
            status.setText(next ? `${label} · ${options.label(target.id)}` : messages.layoutInvalidPlacement);
          }
        }
      }
    }
    current.candidate = next;
    if (key !== current.key) { current.key = key; render(next ?? current.original); }

  });
  scope.registerDomEvent(doc, "pointerup", (event) => { if (drag?.pointer === event.pointerId) stop(true); });
  scope.registerDomEvent(doc, "pointercancel", () => stop(false));
  scope.registerDomEvent(win, "blur", () => stop(false));
  scope.registerDomEvent(doc, "keydown", (event) => {
    if (event.key === "Escape" && drag) { event.preventDefault(); stop(false); }
    const target = event.target as HTMLElement | null;
    const id = moduleId(target?.closest<HTMLElement>("[data-layout-drag-module]")?.dataset.layoutDragModule);
    if (id && target !== null && !target.closest("button, input, select") && root.contains(target) && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); selected = id; render(); moduleSelect.focus(); }
  });
  scope.registerDomEvent(win, "resize", () => stop(false));
  const observer = new win.ResizeObserver(fit);
  observer.observe(viewport); observer.observe(scene);
  scope.register(() => { observer.disconnect(); drag = null; });
  render();
}
