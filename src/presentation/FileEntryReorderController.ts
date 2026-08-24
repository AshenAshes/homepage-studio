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
  ghost: HTMLElement | null;
  slot: HTMLElement | null;
  drop: PointerDrop | null;
  rejectedGroupId: string | null;
}

const HOLD_DELAY_MS = 220;
const MOVE_THRESHOLD_PX = 5;

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
  let pendingDrop: { readonly x: number; readonly y: number } | null = null;

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

  const cleanupDrag = (): void => {
    if (drag === null) {
      return;
    }
    const wasActive = drag.active;
    targetWindow?.clearTimeout(drag.timer);
    clearAutoScroll();
    clearScheduledDrop();
    drag.ghost?.remove();
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
    if (wasActive) {
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

  const setDrop = (x: number, y: number): void => {
    if (drag === null || !drag.active || drag.slot === null) {
      return;
    }
    drag.slot.remove();
    drag.sourceItem.element.removeClass(
      "homepage-studio-file-entry-reorder-source-intra-group"
    );
    clearGroupStates();
    drag.drop = null;
    drag.rejectedGroupId = null;
    const hit = options.container.ownerDocument.elementFromPoint?.(x, y)
      ?? null;
    const targetElement = hit?.closest<HTMLElement>("[data-file-group-id]")
      ?? null;
    if (
      targetElement === null
      || !options.container.contains(targetElement)
    ) {
      return;
    }
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
    const hitList = hit?.closest<HTMLElement>(
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

  const scheduleDrop = (x: number, y: number): void => {
    if (scheduledDropFrame === null || targetWindow === null) {
      setDrop(x, y);
      if (targetWindow !== null) {
        scheduledDropFrame = targetWindow.setTimeout(() => {
          scheduledDropFrame = null;
          const next = pendingDrop;
          pendingDrop = null;
          if (next !== null) {
            scheduleDrop(next.x, next.y);
          }
        }, 16);
      }
      return;
    }
    pendingDrop = { x, y };
  };

  const flushDrop = (x: number, y: number): void => {
    clearScheduledDrop();
    setDrop(x, y);
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
    scheduleDrop(drag.lastX, drag.lastY);
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
    drag.ghost = options.container.createDiv({
      cls: "homepage-studio-file-entry-reorder-ghost",
      attr: {
        "aria-hidden": "true",
        inert: ""
      }
    });
    drag.ghost.appendChild(sourceRow.cloneNode(true));
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
    setDrop(drag.lastX, drag.lastY);
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
    cleanupDrag();
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
    "pointerup",
    (event) => {
      if (
        cancelledPointer === null
        || event.pointerId !== cancelledPointer.pointerId
      ) {
        return;
      }
      const { surface } = cancelledPointer;
      cancelledPointer = null;
      if (event.target !== null && surface.contains(event.target as Node)) {
        suppressCompatibilityClick(surface);
      }
    }
  );
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
      options.scope.registerDomEvent(surface, "pointermove", (event) => {
        if (drag === null || event.pointerId !== drag.pointerId) {
          return;
        }
        drag.lastX = event.clientX;
        drag.lastY = event.clientY;
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
        scheduleDrop(event.clientX, event.clientY);
        updateAutoScroll(event.clientY);
      });
      options.scope.registerDomEvent(surface, "pointerup", (event) => {
        if (drag === null || event.pointerId !== drag.pointerId) {
          return;
        }
        const shouldSuppressClick = drag.active || drag.movedBeyondThreshold;
        if (shouldSuppressClick) {
          event.preventDefault();
          suppressCompatibilityClick(surface);
        }
        if (drag.active) {
          flushDrop(event.clientX, event.clientY);
        }
        finishDrag();
      });
      options.scope.registerDomEvent(surface, "pointercancel", (event) => {
        if (cancelledPointer?.pointerId === event.pointerId) {
          cancelledPointer = null;
        }
        cleanupDrag();
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
