import type { Component } from "obsidian";

export function attachFileGroupDrag(options: {
  container: HTMLElement;
  scope: Component;
  prepare: () => boolean;
  move: (id: string, offset: number) => boolean;
  onActive: (active: boolean) => void;
}): void {
  const { container, scope } = options;
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  if (!win) return;
  const cards = (): HTMLElement[] => Array.from(container.querySelectorAll<HTMLElement>(":scope > [data-file-group-id]"));
  let drag: { card: HTMLElement; handle: HTMLElement; next: ChildNode | null; index: number;
    pointer: number; startX: number; startY: number; x: number; y: number;
    active: boolean; ghost: HTMLElement | null; scroller: HTMLElement } | null = null;
  let timer: number | null = null;
  const stopScroll = (): void => { if (timer !== null) win.clearTimeout(timer); timer = null; };
  const findScroller = (): HTMLElement => {
    for (let parent = container.parentElement; parent; parent = parent.parentElement) {
      if (/(auto|scroll)/u.test(win.getComputedStyle(parent).overflowY)
        && parent.scrollHeight > parent.clientHeight) return parent;
    }
    return doc.scrollingElement as HTMLElement ?? container;
  };
  const preview = (): void => {
    const current = drag;
    if (!current?.active) return;
    current.ghost?.setCssProps({ "--group-drag-x": `${current.x + 12}px`, "--group-drag-y": `${current.y + 12}px` });
    const area = container.getBoundingClientRect();
    if (current.x < area.left || current.x > area.right) return;
    const own = current.card.getBoundingClientRect();
    if (current.y >= own.top && current.y <= own.bottom) return;
    const peers = cards().filter((card) => card !== current.card);
    const before = peers.find((card) => {
      const rect = card.getBoundingClientRect();
      return current.y < rect.top + rect.height / 2;
    });
    const scroll = current.scroller.scrollTop;
    container.insertBefore(current.card, before ?? null);
    current.scroller.scrollTop = scroll;
  };
  const finish = (commit: boolean): void => {
    const current = drag;
    if (!current) return;
    drag = null;
    stopScroll();
    const offset = cards().indexOf(current.card) - current.index;
    const applied = current.active && commit && (offset === 0
      || options.move(current.card.dataset.fileGroupId ?? "", offset));
    if (!applied && current.active) {
      const scroll = current.scroller.scrollTop;
      container.insertBefore(current.card, current.next?.parentNode === container ? current.next : null);
      current.scroller.scrollTop = scroll;
    }
    current.card.removeAttribute("data-group-dragging");
    container.removeAttribute("data-group-drag-active");
    current.ghost?.remove();
    if (current.handle.hasPointerCapture?.(current.pointer)) current.handle.releasePointerCapture(current.pointer);
    if (current.active) options.onActive(false);
  };
  const autoScroll = (): void => {
    timer = null;
    const current = drag;
    if (!current?.active) return;
    const rect = current.scroller.getBoundingClientRect();
    const top = Math.max(0, rect.top);
    const bottom = Math.min(win.innerHeight, rect.bottom);
    const edge = Math.min(60, (bottom - top) / 3);
    const direction = current.y < top + edge ? -1 : current.y > bottom - edge ? 1 : 0;
    if (!direction) return;
    const previous = current.scroller.scrollTop;
    current.scroller.scrollTop += direction * 12;
    if (previous === current.scroller.scrollTop) return;
    preview();
    timer = win.setTimeout(autoScroll, 16);
  };
  for (const card of cards()) {
    const handle = card.querySelector<HTMLElement>(".homepage-studio-file-group-drag-handle");
    if (!handle) continue;
    handle.draggable = false;
    scope.registerDomEvent(handle, "pointerdown", (event) => {
      if (event.button !== 0 || drag || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      handle.focus({ preventScroll: true });
      drag = { card, handle, next: card.nextSibling, index: cards().indexOf(card), pointer: event.pointerId,
        startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
        active: false, ghost: null, scroller: findScroller() };
      handle.setPointerCapture?.(event.pointerId);
    });
    scope.registerDomEvent(handle, "keydown", (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      if (drag || !options.prepare()) return;
      const list = cards(); const index = list.indexOf(card); const offset = event.key === "ArrowUp" ? -1 : 1;
      const neighbor = list[index + offset];
      if (neighbor && options.move(card.dataset.fileGroupId ?? "", offset)) {
        container.insertBefore(card, offset < 0 ? neighbor : neighbor.nextSibling);
        handle.focus({ preventScroll: true });
      }
    });
  }
  scope.registerDomEvent(doc, "pointermove", (event) => {
    const current = drag;
    if (!current || event.pointerId !== current.pointer) return;
    current.x = event.clientX; current.y = event.clientY;
    if (!current.active) {
      if (Math.hypot(current.x - current.startX, current.y - current.startY) < 5) return;
      if (!options.prepare()) { finish(false); return; }
      current.active = true;
      options.onActive(true);
      current.card.setAttribute("data-group-dragging", "true");
      container.setAttribute("data-group-drag-active", "true");
      current.ghost = doc.body.createDiv({ cls: "homepage-studio-file-group-drag-ghost", text: current.card.dataset.fileGroupName ?? "", attr: { "aria-hidden": "true" } });
    }
    event.preventDefault();
    preview();
    stopScroll(); autoScroll();
  });
  scope.registerDomEvent(doc, "wheel", (event) => {
    if (!drag?.active || event.ctrlKey) return;
    event.preventDefault(); stopScroll();
    drag.scroller.scrollTop += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? drag.scroller.clientHeight : 1);
    preview();
  }, { capture: true, passive: false });
  scope.registerDomEvent(doc, "pointerup", (event) => {
    if (drag?.pointer !== event.pointerId) return;
    const area = container.getBoundingClientRect();
    finish(event.clientX >= area.left && event.clientX <= area.right);
  });
  scope.registerDomEvent(doc, "pointercancel", () => finish(false));
  scope.registerDomEvent(doc, "keydown", (event) => { if (event.key === "Escape" && drag) { event.preventDefault(); finish(false); } });
  scope.registerDomEvent(win, "blur", () => finish(false));
  scope.register(() => finish(false));
}
