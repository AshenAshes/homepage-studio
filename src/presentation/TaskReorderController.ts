import type { Component } from "obsidian";
import type { TaskTarget } from "../domain/tasks/taskSource";

export type TaskReorderScope =
  | "active-incomplete"
  | "active-completed"
  | "archive";

export interface TaskReorderItem {
  readonly target: TaskTarget;
  readonly text: string;
  readonly scope: TaskReorderScope;
}

export interface TaskReorderMoveRequest {
  readonly target: TaskTarget;
  readonly before: TaskTarget | null;
}

export type TaskReorderMoveResult =
  | { readonly type: "applied" }
  | { readonly type: "noop" }
  | { readonly type: "conflict" }
  | { readonly type: "blocked" };

export interface TaskReorderControllerOptions {
  readonly container: HTMLElement;
  readonly scrollContainer?: HTMLElement;
  readonly scope: Component;
  readonly enabled: boolean;
  readonly resolveItem: (element: HTMLElement) => TaskReorderItem | null;
  readonly move: (
    request: TaskReorderMoveRequest
  ) => Promise<TaskReorderMoveResult>;
  readonly onPickup: (
    scope: TaskReorderScope,
    cancel: () => void
  ) => void;
  readonly onCommit: () => void;
  readonly onFinish: () => void;
  readonly formatMovedAnnouncement: (
    task: string,
    position: number
  ) => string;
  readonly onApplied: (announcement: string) => void;
  readonly onRejected: (result: Exclude<
    TaskReorderMoveResult,
    { readonly type: "applied" } | { readonly type: "noop" }
  >) => void;
}

interface ReorderRow extends TaskReorderItem {
  readonly element: HTMLElement;
  readonly surface: HTMLElement;
}

interface PointerDrop {
  readonly before: TaskTarget | null;
  readonly position: number;
}

interface PointerDrag {
  readonly source: ReorderRow;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly grabOffsetX: number;
  readonly grabOffsetY: number;
  readonly timer: number;
  active: boolean;
  committing: boolean;
  finishNotified: boolean;
  movedBeyondThreshold: boolean;
  lastX: number;
  lastY: number;
  lastTarget: HTMLElement | null;
  portal: HTMLElement | null;
  cursorShield: HTMLElement | null;
  ghost: HTMLElement | null;
  slot: HTMLElement | null;
  drop: PointerDrop | null;
}

type DropResolution =
  | { readonly type: "row"; readonly row: ReorderRow }
  | { readonly type: "invalid" }
  | { readonly type: "outside" }
  | { readonly type: "unavailable" };

const HOLD_DELAY_MS = 220;
const MOVE_THRESHOLD_PX = 5;

const createPortal = (container: HTMLElement): HTMLElement => {
  const homepage = container.closest<HTMLElement>(".homepage-studio");
  const portal = container.ownerDocument.body.createDiv({
    cls: "homepage-studio-task-reorder-portal"
  });
  if (homepage !== null) {
    portal.addClass("homepage-studio");
    for (const attribute of ["data-theme", "data-appearance"] as const) {
      const value = homepage.getAttribute(attribute);
      if (value !== null) {
        portal.setAttribute(attribute, value);
      }
    }
  }
  return portal;
};

const removeCloneActions = (element: HTMLElement): void => {
  for (const action of element.querySelectorAll(
    ".homepage-studio-task-actions, .homepage-studio-task-icon-button"
  )) {
    action.remove();
  }
};

const disablePointerHitTesting = (element: HTMLElement): void => {
  element.addClass("homepage-studio-task-reorder-pointer-transparent");
  for (const descendant of element.querySelectorAll<HTMLElement>("*")) {
    descendant.addClass(
      "homepage-studio-task-reorder-pointer-transparent"
    );
  }
};

export const attachTaskReorderController = (
  options: TaskReorderControllerOptions
): void => {
  if (!options.enabled) {
    return;
  }
  const targetWindow = options.container.ownerDocument.defaultView;
  if (targetWindow === null) {
    return;
  }
  const scrollContainer = options.scrollContainer ?? options.container;
  let drag: PointerDrag | null = null;
  let busy = false;
  let suppressedSurface: HTMLElement | null = null;
  let suppressedTimer: number | null = null;
  let scheduledDropTimer: number | null = null;
  let pendingDrop: {
    readonly x: number;
    readonly y: number;
    readonly target: HTMLElement | null;
  } | null = null;
  let autoScrollTimer: number | null = null;
  let autoScrollDirection = 0;

  const readRows = (): readonly ReorderRow[] => [
    ...options.container.querySelectorAll<HTMLElement>(
      ".homepage-studio-task-reorder-item"
    )
  ].flatMap((element) => {
    const item = options.resolveItem(element);
    const surface = element.querySelector<HTMLElement>(
      ".homepage-studio-task-reorder-surface"
    );
    return item === null || surface === null
      ? []
      : [{ ...item, element, surface }];
  });

  const rowsInScope = (scope: TaskReorderScope): readonly ReorderRow[] =>
    readRows().filter((row) => row.scope === scope);

  const clearSuppressedClick = (): void => {
    if (suppressedTimer !== null) {
      targetWindow.clearTimeout(suppressedTimer);
      suppressedTimer = null;
    }
    suppressedSurface = null;
  };

  const suppressCompatibilityClick = (surface: HTMLElement): void => {
    clearSuppressedClick();
    suppressedSurface = surface;
    suppressedTimer = targetWindow.setTimeout(() => {
      suppressedSurface = null;
      suppressedTimer = null;
    }, 0);
  };

  const clearScheduledDrop = (): void => {
    if (scheduledDropTimer !== null) {
      targetWindow.clearTimeout(scheduledDropTimer);
      scheduledDropTimer = null;
    }
    pendingDrop = null;
  };

  const clearAutoScroll = (): void => {
    if (autoScrollTimer !== null) {
      targetWindow.clearTimeout(autoScrollTimer);
      autoScrollTimer = null;
    }
    autoScrollDirection = 0;
  };

  const cleanupDrag = (notifyFinish = true): void => {
    const current = drag;
    if (current === null) {
      return;
    }
    drag = null;
    targetWindow.clearTimeout(current.timer);
    clearScheduledDrop();
    clearAutoScroll();
    current.ghost?.remove();
    current.portal?.remove();
    current.slot?.remove();
    current.source.element.removeClass(
      "homepage-studio-task-reorder-source"
    );
    current.source.element.ownerDocument.body.classList.remove(
      "homepage-studio-task-reorder-active"
    );
    options.container.removeAttribute("data-task-reorder-state");
    if (current.source.surface.hasPointerCapture?.(current.pointerId) === true) {
      current.source.surface.releasePointerCapture?.(current.pointerId);
    }
    if (current.active && notifyFinish && !current.finishNotified) {
      current.finishNotified = true;
      options.onFinish();
    }
  };

  const cancelDrag = (): void => {
    cleanupDrag();
  };

  const positionGhost = (): void => {
    const current = drag;
    if (current?.ghost === null || current === null) {
      return;
    }
    current.ghost.style.setProperty(
      "--homepage-task-ghost-x",
      `${current.lastX - current.grabOffsetX}px`
    );
    current.ghost.style.setProperty(
      "--homepage-task-ghost-y",
      `${current.lastY - current.grabOffsetY}px`
    );
  };

  const readPointerTarget = (event: PointerEvent): HTMLElement | null => {
    const target = event.target as Node | null;
    if (
      target === null
      || typeof target.nodeType !== "number"
      || !options.container.contains(target)
    ) {
      return null;
    }
    return target.nodeType === 1
      ? target as HTMLElement
      : target.parentElement;
  };

  const containsPoint = (
    element: HTMLElement,
    x: number,
    y: number
  ): boolean => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0
      && rect.height > 0
      && x >= rect.left
      && x <= rect.right
      && y >= rect.top
      && y <= rect.bottom;
  };

  const rowFromElement = (element: Element | null): ReorderRow | null => {
    const rowElement = element?.closest<HTMLElement>(
      ".homepage-studio-task-reorder-item"
    ) ?? null;
    if (rowElement === null || !options.container.contains(rowElement)) {
      return null;
    }
    return readRows().find((row) => row.element === rowElement) ?? null;
  };

  const resolveDrop = (
    x: number,
    y: number,
    eventTarget: HTMLElement | null
  ): DropResolution => {
    const current = drag;
    if (current === null) {
      return { type: "unavailable" };
    }
    current.cursorShield?.classList.add(
      "homepage-studio-task-reorder-hit-testing"
    );
    let coordinateElement: Element | null = null;
    try {
      coordinateElement = options.container.ownerDocument
        .elementFromPoint?.(x, y) ?? null;
    } finally {
      current.cursorShield?.classList.remove(
        "homepage-studio-task-reorder-hit-testing"
      );
    }
    const coordinateRow = rowFromElement(coordinateElement);
    if (coordinateRow !== null) {
      return coordinateRow.scope === current.source.scope
        ? { type: "row", row: coordinateRow }
        : { type: "invalid" };
    }
    const eventRow = rowFromElement(eventTarget);
    if (
      eventRow !== null
      && eventRow.element !== current.source.element
    ) {
      return eventRow.scope === current.source.scope
        ? { type: "row", row: eventRow }
        : { type: "invalid" };
    }
    const coordinateList = coordinateElement?.closest<HTMLElement>(
      ".homepage-studio-task-reorder-list"
    ) ?? null;
    if (
      coordinateList !== null
      && options.container.contains(coordinateList)
    ) {
      const candidates = readRows().filter(
        (row) => row.element.closest(
          ".homepage-studio-task-reorder-list"
        ) === coordinateList
        && row.element !== current.source.element
      );
      const nearest = candidates.reduce<{
        readonly row: ReorderRow | null;
        readonly distance: number;
      }>((best, row) => {
        const rect = row.element.getBoundingClientRect();
        const distance = Math.hypot(
          x - (rect.left + rect.width / 2),
          y - (rect.top + rect.height / 2)
        );
        return distance < best.distance ? { row, distance } : best;
      }, { row: null, distance: Number.POSITIVE_INFINITY });
      if (nearest.row !== null) {
        return nearest.row.scope === current.source.scope
          ? { type: "row", row: nearest.row }
          : { type: "invalid" };
      }
      return { type: "invalid" };
    }
    if (coordinateElement === null) {
      const geometricRow = readRows().find((row) =>
        row.element !== current.source.element
        && containsPoint(row.element, x, y)
      );
      if (geometricRow !== undefined) {
        return geometricRow.scope === current.source.scope
          ? { type: "row", row: geometricRow }
          : { type: "invalid" };
      }
      return { type: "unavailable" };
    }
    return options.container.contains(coordinateElement)
      ? { type: "invalid" }
      : { type: "outside" };
  };

  const placeSlot = (row: ReorderRow, before: boolean): void => {
    const current = drag;
    if (current?.slot === null || current === null) {
      return;
    }
    const candidates = rowsInScope(current.source.scope).filter(
      (candidate) => candidate.element !== current.source.element
    );
    const rowIndex = candidates.findIndex(
      (candidate) => candidate.element === row.element
    );
    if (rowIndex < 0) {
      return;
    }
    const next = before ? row : candidates[rowIndex + 1] ?? null;
    row.element.parentElement?.insertBefore(
      current.slot,
      before ? row.element : row.element.nextSibling
    );
    current.drop = {
      before: next?.target ?? null,
      position: rowIndex + (before ? 1 : 2)
    };
    options.container.setAttribute("data-task-reorder-state", "active");
  };

  const setDrop = (
    x: number,
    y: number,
    eventTarget: HTMLElement | null
  ): void => {
    const current = drag;
    if (current === null || !current.active || current.slot === null) {
      return;
    }
    current.slot.remove();
    current.drop = null;
    options.container.removeAttribute("data-task-reorder-state");
    const resolution = resolveDrop(x, y, eventTarget);
    if (resolution.type === "unavailable") {
      return;
    }
    if (resolution.type !== "row") {
      return;
    }
    const rect = resolution.row.element.getBoundingClientRect();
    const list = resolution.row.element.closest<HTMLElement>(
      ".homepage-studio-task-reorder-list"
    );
    const isGrid = list !== null
      && targetWindow.getComputedStyle(list).display === "grid";
    const withinRow = y >= rect.top && y <= rect.bottom;
    placeSlot(
      resolution.row,
      isGrid && withinRow
        ? x < rect.left + rect.width / 2
        : y < rect.top + rect.height / 2
    );
  };

  const scheduleDrop = (
    x: number,
    y: number,
    target: HTMLElement | null
  ): void => {
    if (scheduledDropTimer === null) {
      setDrop(x, y, target);
      scheduledDropTimer = targetWindow.setTimeout(() => {
        scheduledDropTimer = null;
        const pending = pendingDrop;
        pendingDrop = null;
        if (pending !== null) {
          scheduleDrop(pending.x, pending.y, pending.target);
        }
      }, 16);
      return;
    }
    pendingDrop = { x, y, target };
  };

  const flushDrop = (
    x: number,
    y: number,
    target: HTMLElement | null
  ): void => {
    clearScheduledDrop();
    setDrop(x, y, target);
  };

  const getScrollDirection = (clientY: number): number => {
    const rect = scrollContainer.getBoundingClientRect();
    const top = rect.height > 0 ? rect.top : 0;
    const bottom = rect.height > 0 ? rect.bottom : targetWindow.innerHeight;
    return clientY < top + 72
      ? -1
      : clientY > bottom - 72
        ? 1
        : 0;
  };

  const continueAutoScroll = (): void => {
    const current = drag;
    if (
      current === null
      || !current.active
      || autoScrollDirection === 0
    ) {
      clearAutoScroll();
      return;
    }
    const previous = scrollContainer.scrollTop;
    scrollContainer.scrollTop += autoScrollDirection * 12;
    if (scrollContainer.scrollTop === previous) {
      clearAutoScroll();
      return;
    }
    scheduleDrop(current.lastX, current.lastY, current.lastTarget);
    autoScrollTimer = targetWindow.setTimeout(continueAutoScroll, 16);
  };

  const updateAutoScroll = (clientY: number): void => {
    const direction = getScrollDirection(clientY);
    if (direction === autoScrollDirection) {
      return;
    }
    clearAutoScroll();
    autoScrollDirection = direction;
    if (direction !== 0) {
      continueAutoScroll();
    }
  };

  const activateDrag = (): void => {
    const current = drag;
    if (current === null || current.active) {
      return;
    }
    current.active = true;
    options.onPickup(current.source.scope, cancelDrag);
    const sourceRect = current.source.element.getBoundingClientRect();
    const sourceRows = rowsInScope(current.source.scope);
    const sourceIndex = sourceRows.findIndex(
      (row) => row.element === current.source.element
    );
    const next = sourceRows[sourceIndex + 1] ?? null;
    const clone = current.source.element.cloneNode(true) as HTMLElement;
    removeCloneActions(clone);
    current.portal = createPortal(options.container);
    current.cursorShield = current.portal.createDiv({
      cls: "homepage-studio-task-reorder-cursor-shield",
      attr: { "aria-hidden": "true" }
    });
    current.ghost = current.portal.createDiv({
      cls: "homepage-studio-task-reorder-ghost",
      attr: { "aria-hidden": "true", inert: "" }
    });
    current.ghost.appendChild(clone);
    current.ghost.style.setProperty(
      "--homepage-task-ghost-width",
      `${sourceRect.width}px`
    );
    current.ghost.style.setProperty(
      "--homepage-task-ghost-height",
      `${sourceRect.height}px`
    );
    const slotClone = current.source.element.cloneNode(true) as HTMLElement;
    removeCloneActions(slotClone);
    slotClone.classList.remove("homepage-studio-task-reorder-item");
    slotClone.classList.add("homepage-studio-task-reorder-slot");
    slotClone.removeAttribute("data-task-reorder-key");
    slotClone.setAttribute("aria-hidden", "true");
    slotClone.setAttribute("inert", "");
    slotClone.style.setProperty(
      "--homepage-task-slot-height",
      `${sourceRect.height}px`
    );
    disablePointerHitTesting(slotClone);
    current.slot = slotClone;
    current.source.element.parentElement?.insertBefore(
      current.slot,
      current.source.element
    );
    current.drop = {
      before: next?.target ?? null,
      position: Math.max(1, sourceIndex + 1)
    };
    current.source.element.addClass("homepage-studio-task-reorder-source");
    current.source.element.ownerDocument.body.classList.add(
      "homepage-studio-task-reorder-active"
    );
    options.container.setAttribute("data-task-reorder-state", "active");
    disablePointerHitTesting(current.ghost);
    if (current.source.surface.hasPointerCapture?.(current.pointerId) === true) {
      current.source.surface.releasePointerCapture?.(current.pointerId);
    }
    options.container.ownerDocument.getSelection()?.removeAllRanges();
    positionGhost();
  };

  const finishDrag = (): void => {
    const current = drag;
    if (current === null) {
      return;
    }
    if (!current.active) {
      cleanupDrag();
      return;
    }
    const drop = current.drop;
    if (drop === null) {
      cleanupDrag();
      return;
    }
    busy = true;
    current.committing = true;
    clearScheduledDrop();
    clearAutoScroll();
    options.onCommit();
    void options.move({
      target: current.source.target,
      before: drop.before
    }).then((result) => {
      if (result.type === "applied") {
        options.onApplied(options.formatMovedAnnouncement(
          current.source.text,
          drop.position
        ));
      } else if (result.type !== "noop") {
        options.onRejected(result);
      }
    }).catch(() => {
      options.onRejected({ type: "blocked" });
    }).finally(() => {
      busy = false;
      if (drag === current) {
        cleanupDrag();
      } else if (!current.finishNotified) {
        current.finishNotified = true;
        options.onFinish();
      }
    });
  };

  const handlePointerMove = (event: PointerEvent): void => {
    const current = drag;
    if (
      current === null
      || current.committing
      || event.pointerId !== current.pointerId
    ) {
      return;
    }
    current.lastX = event.clientX;
    current.lastY = event.clientY;
    current.lastTarget = readPointerTarget(event);
    if (!current.active) {
      if (Math.hypot(
        event.clientX - current.startX,
        event.clientY - current.startY
      ) > MOVE_THRESHOLD_PX) {
        current.movedBeyondThreshold = true;
      }
      return;
    }
    event.preventDefault();
    positionGhost();
    scheduleDrop(event.clientX, event.clientY, current.lastTarget);
    updateAutoScroll(event.clientY);
  };

  const handlePointerUp = (event: PointerEvent): void => {
    const current = drag;
    if (
      current === null
      || current.committing
      || event.pointerId !== current.pointerId
    ) {
      return;
    }
    current.lastTarget = readPointerTarget(event);
    if (current.active || current.movedBeyondThreshold) {
      event.preventDefault();
      suppressCompatibilityClick(current.source.surface);
    }
    if (current.active) {
      flushDrop(event.clientX, event.clientY, current.lastTarget);
    }
    finishDrag();
  };

  const handlePointerCancel = (event: PointerEvent): void => {
    if (
      drag?.pointerId === event.pointerId
      && !drag.committing
    ) {
      cleanupDrag();
    }
  };

  const handleInterruption = (): void => {
    cleanupDrag();
  };

  options.scope.registerDomEvent(
    options.container.ownerDocument,
    "pointermove",
    handlePointerMove
  );
  options.scope.registerDomEvent(
    options.container.ownerDocument,
    "pointerup",
    handlePointerUp
  );
  options.scope.registerDomEvent(
    options.container.ownerDocument,
    "pointercancel",
    handlePointerCancel
  );
  options.scope.registerDomEvent(
    options.container.ownerDocument,
    "keydown",
    (event) => {
      if (event.key === "Escape" && drag?.active === true) {
        event.preventDefault();
        suppressCompatibilityClick(drag.source.surface);
        cleanupDrag();
      }
    }
  );
  options.scope.registerDomEvent(
    options.container.ownerDocument,
    "visibilitychange",
    () => {
      if (options.container.ownerDocument.visibilityState === "hidden") {
        handleInterruption();
      }
    }
  );
  options.scope.registerDomEvent(targetWindow, "pointerup", handlePointerUp);
  options.scope.registerDomEvent(
    targetWindow,
    "pointercancel",
    handlePointerCancel
  );
  options.scope.registerDomEvent(targetWindow, "blur", handleInterruption);
  options.scope.registerDomEvent(targetWindow, "pagehide", handleInterruption);
  options.scope.register(() => {
    cleanupDrag();
    clearSuppressedClick();
  });

  for (const row of readRows()) {
    options.scope.registerDomEvent(row.surface, "pointerdown", (event) => {
      clearSuppressedClick();
      const target = event.target as Element | null;
      if (
        drag !== null
        || busy
        || event.button !== 0
        || event.ctrlKey
        || event.metaKey
        || event.pointerType === "touch"
        || target?.closest("a, button, input, textarea, select") !== null
      ) {
        return;
      }
      const rect = row.element.getBoundingClientRect();
      const pending = {
        source: row,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        grabOffsetX: event.clientX - rect.left,
        grabOffsetY: event.clientY - rect.top,
        active: false,
        committing: false,
        finishNotified: false,
        movedBeyondThreshold: false,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTarget: row.surface,
        portal: null,
        cursorShield: null,
        ghost: null,
        slot: null,
        drop: null,
        timer: 0
      } satisfies PointerDrag;
      const timer = targetWindow.setTimeout(activateDrag, HOLD_DELAY_MS);
      drag = { ...pending, timer };
      row.surface.setPointerCapture?.(event.pointerId);
    });
    options.scope.registerDomEvent(row.surface, "click", (event) => {
      if (suppressedSurface !== row.surface) {
        return;
      }
      clearSuppressedClick();
      event.preventDefault();
      event.stopImmediatePropagation();
    });
    options.scope.registerDomEvent(
      row.surface,
      "lostpointercapture",
      () => {
        if (
          drag?.source.surface === row.surface
          && !drag.active
          && !drag.committing
        ) {
          cleanupDrag();
        }
      }
    );
  }
};
