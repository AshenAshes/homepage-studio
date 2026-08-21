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
  readonly scope: Component;
  readonly enabled: boolean;
  readonly move: (
    request: FileEntryReorderMoveRequest
  ) => FileEntryReorderMoveResult;
  readonly open: (path: string, newPane: boolean) => void;
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
  readonly state: string;
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

const readGroups = (container: HTMLElement): readonly ReorderGroup[] => [
  ...container.querySelectorAll<HTMLElement>("[data-file-group-id]")
].map((element) => ({
  element,
  groupId: element.dataset.fileGroupId ?? "",
  name: element.dataset.fileGroupName ?? "",
  items: [
    ...element.querySelectorAll<HTMLElement>(
      ".homepage-studio-file-entry-reorder-item"
    )
  ].map((item) => ({
    element: item,
    entryId: item.dataset.fileEntryId ?? "",
    path: item.dataset.fileEntryPath ?? "",
    state: item.dataset.fileEntryState ?? "ready"
  }))
}));

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
  let suppressNextClick = false;
  const targetWindow = options.container.ownerDocument.defaultView;

  const clearGroupStates = (): void => {
    for (const group of groups) {
      group.element.removeAttribute("data-file-entry-drop-state");
    }
  };

  const cleanupDrag = (): void => {
    if (drag === null) {
      return;
    }
    targetWindow?.clearTimeout(drag.timer);
    drag.ghost?.remove();
    drag.slot?.remove();
    drag.sourceItem.element.removeClass(
      "homepage-studio-file-entry-reorder-source"
    );
    clearGroupStates();
    drag = null;
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
    clearGroupStates();
    drag.drop = null;
    drag.rejectedGroupId = null;
    const hit = options.container.ownerDocument.elementFromPoint?.(x, y)
      ?? null;
    const targetElement = hit?.closest<HTMLElement>("[data-file-group-id]")
      ?? null;
    const targetGroup = groups.find(
      (group) => group.element === targetElement
    );
    if (targetGroup === undefined) {
      return;
    }
    if (targetGroup.items.some((item) =>
      item.entryId !== drag?.sourceItem.entryId
      && item.path === drag?.sourceItem.path
    )) {
      targetGroup.element.setAttribute(
        "data-file-entry-drop-state",
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
      const distance = Math.abs(y - (rect.top + rect.height / 2));
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
      const before = y < nearest.rect.top + nearest.rect.height / 2;
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

  const activateDrag = (): void => {
    if (drag === null || drag.active) {
      return;
    }
    const sourceRow = drag.sourceItem.element.querySelector<HTMLElement>(
      ".homepage-studio-file-group-entry-setting"
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
    drag.slot = options.container.createDiv({
      cls: "homepage-studio-file-entry-reorder-slot",
      attr: {
        "aria-hidden": "true",
        inert: ""
      }
    });
    drag.slot.appendChild(sourceRow.cloneNode(true));
    drag.slot.remove();
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
    const result = options.move({
      sourceGroupId: current.sourceGroup.groupId,
      entryId: current.sourceItem.entryId,
      target: drop.target
    });
    if (result.type === "applied") {
      options.onApplied(
        current.sourceItem.entryId,
        options.formatMovedAnnouncement(
          current.sourceItem.path,
          drop.targetGroup.name,
          drop.position
        )
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
        cleanupDrag();
      }
    }
  );
  options.scope.register(() => {
    cleanupDrag();
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
        if (
          drag !== null
          || event.button !== 0
          || event.ctrlKey
          || event.metaKey
          || targetWindow === null
        ) {
          return;
        }
        const rect = surface.getBoundingClientRect();
        const pending = {
          sourceGroup: group,
          sourceItem: item,
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
        setDrop(event.clientX, event.clientY);
      });
      options.scope.registerDomEvent(surface, "pointerup", (event) => {
        if (drag === null || event.pointerId !== drag.pointerId) {
          return;
        }
        const shouldSuppressClick = drag.active || drag.movedBeyondThreshold;
        if (shouldSuppressClick) {
          event.preventDefault();
          suppressNextClick = true;
        }
        finishDrag();
      });
      options.scope.registerDomEvent(surface, "pointercancel", () => {
        cleanupDrag();
      });
      options.scope.registerDomEvent(surface, "click", (event) => {
        if (suppressNextClick) {
          suppressNextClick = false;
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (item.state === "ready") {
          options.open(item.path, event.ctrlKey || event.metaKey);
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
          && item.state === "ready"
        ) {
          event.preventDefault();
          options.open(item.path, false);
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
        const result = options.move({
          sourceGroupId: group.groupId,
          entryId: item.entryId,
          target: resolved.target
        });
        if (result.type === "applied") {
          options.onApplied(
            item.entryId,
            options.formatMovedAnnouncement(
              item.path,
              resolved.targetGroup.name,
              resolved.position
            )
          );
          return;
        }
        options.onRejected(result, resolved.targetGroup.groupId);
      });
    }
  }
};
