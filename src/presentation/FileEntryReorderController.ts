import type { Component } from "obsidian";
import type { FileGroupEntryMoveTarget } from
  "../domain/files/fileGroups";

export interface FileEntryReorderMoveRequest {
  readonly sourceGroupId: string;
  readonly entryId: string;
  readonly target: FileGroupEntryMoveTarget;
}

export type FileEntryReorderMoveResult =
  | { readonly type: "applied" }
  | { readonly type: "noop" }
  | { readonly type: "duplicate-path" }
  | { readonly type: "not-found" }
  | { readonly type: "blocked" };

export interface FileEntryReorderControllerOptions {
  readonly container: HTMLElement;
  readonly scrollContainer?: HTMLElement;
  readonly scope: Component;
  readonly enabled: boolean;
  readonly move: (
    request: FileEntryReorderMoveRequest,
    announcement: string
  ) => FileEntryReorderMoveResult;
  readonly open: (path: string, newPane: boolean) => void;
  readonly onPickup?: () => void;
  readonly onFinish?: () => void;
  readonly onUnavailableOpen?: (
    path: string,
    state: "missing" | "invalid",
    groupId: string
  ) => void;
  readonly formatMovedAnnouncement: (
    path: string,
    groupName: string,
    position: number
  ) => string;
  readonly onApplied: (
    entryId: string,
    announcement: string
  ) => void;
  readonly onRejected: (
    result: Exclude<FileEntryReorderMoveResult, { readonly type: "applied" }>,
    targetGroupId: string
  ) => void;
}

interface ReorderItem {
  readonly element: HTMLElement;
  readonly entryId: string;
  readonly path: string;
  readonly state: "ready" | "missing" | "invalid";
}

interface ReorderGroup {
  readonly element: HTMLElement;
  readonly groupId: string;
  readonly name: string;
  readonly items: readonly ReorderItem[];
}

interface PointerDrop {
  readonly target: FileGroupEntryMoveTarget;
  readonly targetGroup: ReorderGroup;
  readonly position: number;
}

interface PointerDropHit {
  readonly group: HTMLElement;
  readonly element: HTMLElement;
}

type PointerDropResolution =
  | { readonly type: "hit"; readonly hit: PointerDropHit }
  | { readonly type: "outside" }
  | { readonly type: "unavailable" };

interface PointerDrag {
  readonly sourceGroup: ReorderGroup;
  readonly sourceItem: ReorderItem;
  readonly surface: HTMLElement;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly grabOffsetX: number;
  readonly grabOffsetY: number;
  readonly timer: number;
  active: boolean;
  movedBeyondThreshold: boolean;
  lastX: number;
  lastY: number;
  lastTarget: HTMLElement | null;
  portal: HTMLElement | null;
  ghost: HTMLElement | null;
  slot: HTMLElement | null;
  drop: PointerDrop | null;
  rejectedGroupId: string | null;
}

const HOLD_DELAY_MS = 220;
const MOVE_THRESHOLD_PX = 5;

const createDragPortal = (container: HTMLElement): HTMLElement => {
  const ownerDocument = container.ownerDocument;
  const homepage = container.closest<HTMLElement>(".homepage-studio");
  const settings = container.closest<HTMLElement>(
    ".homepage-studio-settings"
  );
  const portal = ownerDocument.body.createDiv({
    cls: "homepage-studio-file-entry-reorder-portal "
      + "homepage-studio-file-entry-reorder-theme-context"
  });
  if (homepage !== null) {
    portal.addClass("homepage-studio");
    for (const attribute of ["data-theme", "data-appearance"] as const) {
      const value = homepage.getAttribute(attribute);
      if (value !== null) {
        portal.setAttribute(attribute, value);
      }
    }
  } else if (settings !== null) {
    portal.addClass("homepage-studio-settings");
  }
  return portal;
};

const disablePointerHitTesting = (element: HTMLElement): void => {
  element.addClass("homepage-studio-file-entry-reorder-pointer-transparent");
  for (const descendant of element.querySelectorAll<HTMLElement>("*")) {
    descendant.addClass(
      "homepage-studio-file-entry-reorder-pointer-transparent"
    );
  }
};

const readGroup = (element: HTMLElement): ReorderGroup => ({
  element,
  groupId: element.dataset.fileGroupId ?? "",
  name: element.dataset.fileGroupName ?? "",
  items: [
    ...element.querySelectorAll<HTMLElement>(
      ".homepage-studio-file-entry-reorder-item"
    )
  ].map((item) => {
    const state = item.dataset.fileEntryState;
    return {
      element: item,
      entryId: item.dataset.fileEntryId ?? "",
      path: item.dataset.fileEntryPath ?? "",
      state: state === "missing" || state === "invalid" ? state : "ready"
    };
  })
});

const readGroups = (container: HTMLElement): readonly ReorderGroup[] => [
  ...container.querySelectorAll<HTMLElement>("[data-file-group-id]")
].map(readGroup);

const anchorTarget = (
  groupId: string,
  item: ReorderItem,
  placement: "before" | "after"
): FileGroupEntryMoveTarget => ({
  targetGroupId: groupId,
  anchorEntryId: item.entryId,
  placement
});

const endTarget = (groupId: string): FileGroupEntryMoveTarget => ({
  targetGroupId: groupId,
  anchorEntryId: null,
  placement: "end"
});

const resolveKeyboardMove = (
  groups: readonly ReorderGroup[],
  sourceGroup: ReorderGroup,
  sourceItem: ReorderItem,
  key: string
): {
  readonly target: FileGroupEntryMoveTarget;
  readonly targetGroup: ReorderGroup;
  readonly position: number;
} | null => {
  const sourceGroupIndex = groups.indexOf(sourceGroup);
  const sourceIndex = sourceGroup.items.indexOf(sourceItem);
  if (key === "ArrowUp" && sourceIndex > 0) {
    return {
      target: anchorTarget(
        sourceGroup.groupId,
        sourceGroup.items[sourceIndex - 1]!,
        "before"
      ),
      targetGroup: sourceGroup,
      position: sourceIndex
    };
  }
  if (key === "ArrowDown" && sourceIndex < sourceGroup.items.length - 1) {
    return {
      target: anchorTarget(
        sourceGroup.groupId,
        sourceGroup.items[sourceIndex + 1]!,
        "after"
      ),
      targetGroup: sourceGroup,
      position: sourceIndex + 2
    };
  }
  if (key === "Home" && sourceIndex > 0) {
    return {
      target: anchorTarget(
        sourceGroup.groupId,
        sourceGroup.items[0]!,
        "before"
      ),
      targetGroup: sourceGroup,
      position: 1
    };
  }
  if (key === "End" && sourceIndex < sourceGroup.items.length - 1) {
    return {
      target: endTarget(sourceGroup.groupId),
      targetGroup: sourceGroup,
      position: sourceGroup.items.length
    };
  }
  if (key !== "ArrowLeft" && key !== "ArrowRight") {
    return null;
  }
  const targetGroup = groups[
    sourceGroupIndex + (key === "ArrowLeft" ? -1 : 1)
  ];
  if (targetGroup === undefined) {
    return null;
  }
  const anchor = targetGroup.items[sourceIndex];
  return {
    target: anchor === undefined
      ? endTarget(targetGroup.groupId)
      : anchorTarget(targetGroup.groupId, anchor, "before"),
    targetGroup,
    position: Math.min(sourceIndex, targetGroup.items.length) + 1
  };
};

export const attachFileEntryReorderController = (
  options: FileEntryReorderControllerOptions
): void => {
  if (!options.enabled) {
    return;
  }
  const groups = readGroups(options.container);
  let drag: PointerDrag | null = null;
  const targetWindow = options.container.ownerDocument.defaultView;
  let suppressedClickSurface: HTMLElement | null = null;
  let suppressedClickTimer: number | null = null;
  let cancelledPointer: {
    readonly pointerId: number;
    readonly surface: HTMLElement;
  } | null = null;
  const scrollContainer = options.scrollContainer ?? options.container;
  let autoScrollTimer: number | null = null;
  let autoScrollDirection = 0;
  let scheduledDropFrame: number | null = null;
  let pendingDrop: {
    readonly x: number;
    readonly y: number;
    readonly target: HTMLElement | null;
  } | null = null;

  const clearSuppressedClick = (): void => {
    if (suppressedClickTimer !== null) {
      targetWindow?.clearTimeout(suppressedClickTimer);
      suppressedClickTimer = null;
    }
    suppressedClickSurface = null;
  };

  const suppressCompatibilityClick = (surface: HTMLElement): void => {
    clearSuppressedClick();
    suppressedClickSurface = surface;
    suppressedClickTimer = targetWindow?.setTimeout(() => {
      suppressedClickSurface = null;
      suppressedClickTimer = null;
    }, 0) ?? null;
  };

  const getScrollBounds = (): { readonly top: number; readonly bottom: number } => {
    const rect = scrollContainer.getBoundingClientRect();
    return rect.height > 0
      ? { top: rect.top, bottom: rect.bottom }
      : { top: 0, bottom: targetWindow?.innerHeight ?? 0 };
  };

  const getScrollDirection = (clientY: number): number => {
    const edge = 72;
    const bounds = getScrollBounds();
    return clientY < bounds.top + edge
      ? -1
      : clientY > bounds.bottom - edge
        ? 1
        : 0;
  };

  const clearAutoScroll = (): void => {
    if (autoScrollTimer !== null) {
      targetWindow?.clearTimeout(autoScrollTimer);
      autoScrollTimer = null;
    }
    autoScrollDirection = 0;
  };

  const clearGroupStates = (): void => {
    options.container.removeAttribute("data-file-entry-reorder-state");
    for (const group of options.container.querySelectorAll<HTMLElement>(
      "[data-file-group-id][data-file-entry-drop-state]"
    )) {
      group.removeAttribute("data-file-entry-drop-state");
    }
  };

  const clearScheduledDrop = (): void => {
    if (scheduledDropFrame !== null) {
      targetWindow?.clearTimeout(scheduledDropFrame);
      scheduledDropFrame = null;
    }
    pendingDrop = null;
  };

  const cleanupDrag = (notifyFinish = true): void => {
    if (drag === null) {
      return;
    }
    const wasActive = drag.active;
    targetWindow?.clearTimeout(drag.timer);
    clearAutoScroll();
    clearScheduledDrop();
    drag.ghost?.remove();
    drag.portal?.remove();
    drag.slot?.remove();
    drag.sourceItem.element.removeClass(
      "homepage-studio-file-entry-reorder-source"
    );
    drag.sourceItem.element.removeClass(
      "homepage-studio-file-entry-reorder-source-intra-group"
    );
    if (drag.surface.hasPointerCapture?.(drag.pointerId) === true) {
      drag.surface.releasePointerCapture?.(drag.pointerId);
    }
    clearGroupStates();
    drag = null;
    if (wasActive && notifyFinish) {
      options.onFinish?.();
    }
  };

  const positionGhost = (): void => {
    if (drag?.ghost === null || drag === null) {
      return;
    }
    drag.ghost.style.setProperty(
      "--homepage-file-entry-ghost-x",
      `${drag.lastX - drag.grabOffsetX}px`
    );
    drag.ghost.style.setProperty(
      "--homepage-file-entry-ghost-y",
      `${drag.lastY - drag.grabOffsetY}px`
    );
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

  const readDropHit = (element: Element | null): PointerDropHit | null => {
    const group = element?.closest<HTMLElement>("[data-file-group-id]")
      ?? null;
    return group !== null && options.container.contains(group)
      ? { group, element: element as HTMLElement }
      : null;
  };

  const resolveDropHit = (
    x: number,
    y: number,
    eventTarget: HTMLElement | null
  ): PointerDropResolution => {
    const coordinateElement = options.container.ownerDocument
      .elementFromPoint?.(x, y) ?? null;
    const coordinateHit = readDropHit(coordinateElement);
    if (coordinateHit !== null) {
      return { type: "hit", hit: coordinateHit };
    }
    for (const group of options.container.querySelectorAll<HTMLElement>(
      "[data-file-group-id]"
    )) {
      if (!containsPoint(group, x, y)) {
        continue;
      }
      const list = group.querySelector<HTMLElement>(
        ".homepage-studio-file-entry-reorder-list"
      );
      return {
        type: "hit",
        hit: {
          group,
          element: list !== null && containsPoint(list, x, y) ? list : group
        }
      };
    }
    const eventTargetHit = drag !== null
      && eventTarget !== null
      && !drag.sourceItem.element.contains(eventTarget)
      ? readDropHit(eventTarget)
      : null;
    if (eventTargetHit !== null) {
      return { type: "hit", hit: eventTargetHit };
    }
    const targetWindowWidth = targetWindow?.innerWidth ?? 0;
    const targetWindowHeight = targetWindow?.innerHeight ?? 0;
    const outsideViewport = x < 0
      || y < 0
      || (targetWindowWidth > 0 && x > targetWindowWidth)
      || (targetWindowHeight > 0 && y > targetWindowHeight);
    if (outsideViewport) {
      return { type: "outside" };
    }
    const dragPortal = coordinateElement?.closest(
      ".homepage-studio-file-entry-reorder-portal"
    ) ?? null;
    return coordinateElement === null || dragPortal !== null
      ? { type: "unavailable" }
      : { type: "outside" };
  };

  const readPointerEventTarget = (
    event: PointerEvent
  ): HTMLElement | null => {
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

  const setDrop = (
    x: number,
    y: number,
    eventTarget: HTMLElement | null = null
  ): void => {
    if (drag === null || !drag.active || drag.slot === null) {
      return;
    }
    const resolution = resolveDropHit(x, y, eventTarget);
    if (resolution.type === "unavailable") {
      return;
    }
    drag.slot.remove();
    drag.sourceItem.element.removeClass(
      "homepage-studio-file-entry-reorder-source-intra-group"
    );
    clearGroupStates();
    drag.drop = null;
    drag.rejectedGroupId = null;
    if (resolution.type === "outside") {
      return;
    }
    const { hit } = resolution;
    const targetElement = hit.group;
    const targetGroup = readGroup(targetElement);
    if (targetGroup.items.some((item) =>
      item.entryId !== drag?.sourceItem.entryId
      && item.path === drag?.sourceItem.path
    )) {
      targetGroup.element.setAttribute(
        "data-file-entry-drop-state",
        "invalid"
      );
      options.container.setAttribute(
        "data-file-entry-reorder-state",
        "invalid"
      );
      drag.rejectedGroupId = targetGroup.groupId;
      return;
    }
    const list = targetGroup.element.querySelector<HTMLElement>(
      ".homepage-studio-file-entry-reorder-list"
    );
    if (list === null) {
      return;
    }
    if (targetGroup.groupId === drag.sourceGroup.groupId) {
      drag.sourceItem.element.addClass(
        "homepage-studio-file-entry-reorder-source-intra-group"
      );
    }
    const candidates = targetGroup.items.filter(
      (item) => item.entryId !== drag?.sourceItem.entryId
    );
    const hitList = hit.element.closest<HTMLElement>(
      ".homepage-studio-file-entry-reorder-list"
    ) ?? null;
    if (hitList !== list) {
      list.appendChild(drag.slot);
      drag.drop = {
        target: endTarget(targetGroup.groupId),
        targetGroup,
        position: candidates.length + 1
      };
      targetGroup.element.setAttribute(
        "data-file-entry-drop-state",
        "active"
      );
      return;
    }
    const nearest = candidates.reduce<{
      readonly item: ReorderItem | null;
      readonly rect: DOMRect | null;
      readonly distance: number;
    }>((current, item) => {
      const rect = item.element.getBoundingClientRect();
      const distance = Math.hypot(
        x - (rect.left + rect.width / 2),
        y - (rect.top + rect.height / 2)
      );
      return distance < current.distance
        ? { item, rect, distance }
        : current;
    }, { item: null, rect: null, distance: Number.POSITIVE_INFINITY });
    if (nearest.item === null || nearest.rect === null) {
      list.appendChild(drag.slot);
      drag.drop = {
        target: endTarget(targetGroup.groupId),
        targetGroup,
        position: candidates.length + 1
      };
    } else {
      const isGrid = targetWindow?.getComputedStyle(list).display === "grid";
      const withinNearestRow = y >= nearest.rect.top
        && y <= nearest.rect.bottom;
      const before = isGrid && withinNearestRow
        ? x < nearest.rect.left + nearest.rect.width / 2
        : y < nearest.rect.top + nearest.rect.height / 2;
      list.insertBefore(
        drag.slot,
        before ? nearest.item.element : nearest.item.element.nextSibling
      );
      const anchorIndex = candidates.indexOf(nearest.item);
      drag.drop = {
        target: anchorTarget(
          targetGroup.groupId,
          nearest.item,
          before ? "before" : "after"
        ),
        targetGroup,
        position: anchorIndex + (before ? 1 : 2)
      };
    }
    targetGroup.element.setAttribute(
      "data-file-entry-drop-state",
      "active"
    );
  };

  const scheduleDrop = (
    x: number,
    y: number,
    eventTarget: HTMLElement | null = null
  ): void => {
    if (scheduledDropFrame === null || targetWindow === null) {
      setDrop(x, y, eventTarget);
      if (targetWindow !== null) {
        scheduledDropFrame = targetWindow.setTimeout(() => {
          scheduledDropFrame = null;
          const next = pendingDrop;
          pendingDrop = null;
          if (next !== null) {
            scheduleDrop(next.x, next.y, next.target);
          }
        }, 16);
      }
      return;
    }
    pendingDrop = { x, y, target: eventTarget };
  };

  const flushDrop = (
    x: number,
    y: number,
    eventTarget: HTMLElement | null = null
  ): void => {
    clearScheduledDrop();
    setDrop(x, y, eventTarget);
  };

  const continueAutoScroll = (): void => {
    if (
      drag === null
      || !drag.active
      || autoScrollDirection === 0
      || targetWindow === null
    ) {
      clearAutoScroll();
      return;
    }
    const previousScrollTop = scrollContainer.scrollTop;
    scrollContainer.scrollTop += autoScrollDirection * 12;
    if (scrollContainer.scrollTop === previousScrollTop) {
      clearAutoScroll();
      return;
    }
    scheduleDrop(drag.lastX, drag.lastY, drag.lastTarget);
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
    if (drag === null || drag.active) {
      return;
    }
    const sourceRow = drag.sourceItem.element.querySelector<HTMLElement>(
      ".homepage-studio-file-group-entry-setting, .homepage-studio-file-group-entry"
    ) ?? drag.sourceItem.element;
    const rect = sourceRow.getBoundingClientRect();
    drag.active = true;
    drag.sourceItem.element.addClass(
      "homepage-studio-file-entry-reorder-source"
    );
    drag.portal = createDragPortal(options.container);
    drag.ghost = drag.portal.createDiv({
      cls: "homepage-studio-file-entry-reorder-ghost",
      attr: {
        "aria-hidden": "true",
        inert: ""
      }
    });
    drag.ghost.appendChild(sourceRow.cloneNode(true));
    disablePointerHitTesting(drag.portal);
    drag.ghost.style.setProperty(
      "--homepage-file-entry-ghost-width",
      `${rect.width}px`
    );
    drag.ghost.style.setProperty(
      "--homepage-file-entry-ghost-height",
      `${rect.height}px`
    );
    drag.slot = drag.sourceItem.element.tagName === "LI"
      ? options.container.createEl("li", {
        cls: "homepage-studio-file-entry-reorder-slot",
        attr: {
          "aria-hidden": "true",
          inert: ""
        }
      })
      : options.container.createDiv({
        cls: "homepage-studio-file-entry-reorder-slot",
        attr: {
          "aria-hidden": "true",
          inert: ""
        }
      });
    drag.slot.appendChild(sourceRow.cloneNode(true));
    drag.slot.remove();
    options.onPickup?.();
    positionGhost();
    setDrop(drag.lastX, drag.lastY, drag.lastTarget);
  };

  const finishDrag = (): void => {
    if (drag === null) {
      return;
    }
    if (!drag.active) {
      cleanupDrag();
      return;
    }
    const current = drag;
    const drop = current.drop;
    const rejectedGroupId = current.rejectedGroupId;
    cleanupDrag(false);
    try {
      if (drop === null) {
        if (rejectedGroupId !== null) {
          options.onRejected({ type: "duplicate-path" }, rejectedGroupId);
        }
        return;
      }
      const announcement = options.formatMovedAnnouncement(
        current.sourceItem.path,
        drop.targetGroup.name,
        drop.position
      );
      const result = options.move({
        sourceGroupId: current.sourceGroup.groupId,
        entryId: current.sourceItem.entryId,
        target: drop.target
      }, announcement);
      if (result.type === "applied") {
        options.onApplied(
          current.sourceItem.entryId,
          announcement
        );
        return;
      }
      options.onRejected(result, drop.targetGroup.groupId);
    } finally {
      options.onFinish?.();
    }
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (drag === null || event.pointerId !== drag.pointerId) {
      return;
    }
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastTarget = readPointerEventTarget(event);
    if (!drag.active) {
      const distance = Math.hypot(
        event.clientX - drag.startX,
        event.clientY - drag.startY
      );
      if (distance > MOVE_THRESHOLD_PX) {
        drag.movedBeyondThreshold = true;
      }
      return;
    }
    event.preventDefault();
    positionGhost();
    scheduleDrop(event.clientX, event.clientY, drag.lastTarget);
    updateAutoScroll(event.clientY);
  };

  const handlePointerUp = (event: PointerEvent): void => {
    if (
      cancelledPointer !== null
      && event.pointerId === cancelledPointer.pointerId
    ) {
      const { surface } = cancelledPointer;
      cancelledPointer = null;
      suppressCompatibilityClick(surface);
      return;
    }
    if (drag === null || event.pointerId !== drag.pointerId) {
      return;
    }
    drag.lastTarget = readPointerEventTarget(event);
    const shouldSuppressClick = drag.active || drag.movedBeyondThreshold;
    if (shouldSuppressClick) {
      event.preventDefault();
      suppressCompatibilityClick(drag.surface);
    }
    if (drag.active) {
      flushDrop(event.clientX, event.clientY, drag.lastTarget);
    }
    finishDrag();
  };

  const handlePointerCancel = (event: PointerEvent): void => {
    if (cancelledPointer?.pointerId === event.pointerId) {
      cancelledPointer = null;
    }
    if (drag?.pointerId === event.pointerId) {
      cleanupDrag();
    }
  };

  const handleWindowInterruption = (): void => {
    cleanupDrag();
    cancelledPointer = null;
  };

  options.scope.registerDomEvent(
    options.container.ownerDocument,
    "keydown",
    (event) => {
      if (event.key === "Escape" && drag?.active === true) {
        event.preventDefault();
        cancelledPointer = {
          pointerId: drag.pointerId,
          surface: drag.surface
        };
        cleanupDrag();
      }
    }
  );
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
    "visibilitychange",
    () => {
      if (options.container.ownerDocument.visibilityState === "hidden") {
        handleWindowInterruption();
      }
    }
  );
  if (targetWindow !== null) {
    options.scope.registerDomEvent(
      targetWindow,
      "pointerup",
      handlePointerUp
    );
    options.scope.registerDomEvent(
      targetWindow,
      "pointercancel",
      handlePointerCancel
    );
    options.scope.registerDomEvent(
      targetWindow,
      "blur",
      handleWindowInterruption
    );
    options.scope.registerDomEvent(
      targetWindow,
      "pagehide",
      handleWindowInterruption
    );
  }
  options.scope.register(() => {
    cleanupDrag();
    clearSuppressedClick();
    cancelledPointer = null;
  });

  for (const group of groups) {
    for (const item of group.items) {
      const surface = item.element.querySelector<HTMLElement>(
        ".homepage-studio-file-entry-reorder-surface"
      );
      if (surface === null) {
        continue;
      }
      options.scope.registerDomEvent(surface, "pointerdown", (event) => {
        clearSuppressedClick();
        if (
          drag !== null
          || event.button !== 0
          || event.ctrlKey
          || event.metaKey
          || event.pointerType === "touch"
          || targetWindow === null
        ) {
          return;
        }
        const rect = surface.getBoundingClientRect();
        const pending = {
          sourceGroup: group,
          sourceItem: item,
          surface,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          grabOffsetX: event.clientX - rect.left,
          grabOffsetY: event.clientY - rect.top,
          active: false,
          movedBeyondThreshold: false,
          lastX: event.clientX,
          lastY: event.clientY,
          lastTarget: surface,
          portal: null,
          ghost: null,
          slot: null,
          drop: null,
          rejectedGroupId: null,
          timer: 0
        } satisfies PointerDrag;
        const timer = targetWindow.setTimeout(() => {
          activateDrag();
        }, HOLD_DELAY_MS);
        drag = { ...pending, timer };
        surface.setPointerCapture?.(event.pointerId);
      });
      options.scope.registerDomEvent(surface, "click", (event) => {
        if (suppressedClickSurface === surface) {
          clearSuppressedClick();
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (item.state === "ready") {
          options.open(item.path, event.ctrlKey || event.metaKey);
        } else {
          options.onUnavailableOpen?.(
            item.path,
            item.state,
            group.groupId
          );
        }
      });
      options.scope.registerDomEvent(surface, "auxclick", (event) => {
        if (event.button === 1 && item.state === "ready") {
          event.preventDefault();
          options.open(item.path, true);
        }
      });
      options.scope.registerDomEvent(surface, "keydown", (event) => {
        if (
          !event.altKey
          && (event.key === "Enter" || event.key === " ")
          && surface.tagName !== "BUTTON"
        ) {
          event.preventDefault();
          if (item.state === "ready") {
            options.open(item.path, false);
          } else {
            options.onUnavailableOpen?.(
              item.path,
              item.state,
              group.groupId
            );
          }
          return;
        }
        if (!event.altKey) {
          return;
        }
        const resolved = resolveKeyboardMove(groups, group, item, event.key);
        if (resolved === null) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const announcement = options.formatMovedAnnouncement(
          item.path,
          resolved.targetGroup.name,
          resolved.position
        );
        const result = options.move({
          sourceGroupId: group.groupId,
          entryId: item.entryId,
          target: resolved.target
        }, announcement);
        if (result.type === "applied") {
          options.onApplied(
            item.entryId,
            announcement
          );
          return;
        }
        options.onRejected(result, resolved.targetGroup.groupId);
      });
    }
  }
};
