import {
  Component,
  setIcon
} from "obsidian";
import type { HomepageSettingsSection } from "../application/ports/SettingsNavigation";
import type {
  HomepageModuleViewModel,
  HomepageShellViewModel
} from "../application/view-models/HomepageShellViewModel";
import type { TaskTarget } from "../domain/tasks/taskSource";
import {
  attachAccessibleLabel,
  attachTooltipAccessibleLabel
} from "./accessibility";
import {
  attachFileEntryReorderController,
  type FileEntryReorderMoveRequest,
  type FileEntryReorderMoveResult
} from "./FileEntryReorderController";
import {
  attachTaskReorderController,
  type TaskReorderItem,
  type TaskReorderMoveRequest,
  type TaskReorderMoveResult,
  type TaskReorderScope
} from "./TaskReorderController";

interface HomepageShellActions {
  openSettings(section?: HomepageSettingsSection): void;
  openFile(path: string, newPane: boolean): void;
  moveJournalDate(offsetDays: number): void;
  updateJournalDraft(content: string): void;
  flushJournalDraft(): void;
  setJournalViewMode(viewMode: "edit" | "preview"): void;
  reloadJournalDraft(): void;
  deleteJournalEntry(): void;
  addTask(text: string): Promise<boolean>;
  updateTaskAddDraft(text: string): void;
  beginTaskEdit(target: TaskTarget, text: string): void;
  updateTaskEditDraft(text: string): void;
  saveTaskEdit(): Promise<boolean>;
  cancelTaskEdit(): void;
  beginTextInputInteraction(): void;
  endTextInputInteraction(focusTarget?: "task-add"): void;
  setTaskCompleted(
    target: TaskTarget,
    completed: boolean
  ): Promise<boolean>;
  archiveTask(target: TaskTarget): Promise<boolean>;
  archiveCompletedTasks(): Promise<boolean>;
  unarchiveTask(target: TaskTarget): Promise<boolean>;
  setTaskArchiveVisible(visible: boolean): void;
  showMoreTasks(): void;
  showMoreArchivedTasks(): void;
  beginTaskDrag(sourceRevision: number, cancel: () => void): void;
  commitTaskDrag(): void;
  endTaskDrag(): void;
  reorderTask(
    request: TaskReorderMoveRequest
  ): Promise<TaskReorderMoveResult>;
  announceTaskMove(announcement: string): void;
  showMoreFileGroupEntries(): void;
  beginFileGroupEntryDrag(): void;
  endFileGroupEntryDrag(): void;
  getAllFileGroups(): FileGroupModuleViewModel | null;
  moveFileGroupEntry(
    request: FileEntryReorderMoveRequest,
    announcement: string
  ): FileEntryReorderMoveResult;
  reloadTaskSource(): void;
  openTaskSource(path: string): void;
  deleteTask(target: TaskTarget, text: string): void;
  renderMarkdown(
    content: string,
    path: string,
    container: HTMLElement,
    scope: Component
  ): void;
}

type FileGroupModuleViewModel = NonNullable<
HomepageModuleViewModel["fileGroups"]
>;
type FileGroupEntryViewModel =
  FileGroupModuleViewModel["groups"][number]["entries"][number];

const renderIcon = (
  container: HTMLElement,
  icon: string,
  className: string
): void => {
  const iconEl = container.createSpan({
    cls: className,
    attr: {
      "aria-hidden": "true"
    }
  });
  setIcon(iconEl, icon);
};

const formatAlphabeticIndex = (index: number): string => {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
};

const BANNER_LOAD_TIMEOUT_MS = 8_000;

const renderCelestialBannerArt = (container: HTMLElement): void => {
  const svg = container.createSvg("svg", {
    cls: "homepage-studio-celestial-orbits",
    attr: {
      viewBox: "0 0 1200 220",
      preserveAspectRatio: "xMidYMid slice",
      focusable: "false",
      "aria-hidden": "true"
    }
  });
  for (let radius = 30; radius <= 170; radius += 20) {
    svg.createSvg("circle", {
      cls: "homepage-studio-celestial-orbit",
      attr: {
        cx: 816,
        cy: 110,
        r: radius,
        "vector-effect": "non-scaling-stroke"
      }
    });
  }
  const nodeOrbit = svg.createSvg("g", {
    cls: "homepage-studio-celestial-node-orbit"
  });
  nodeOrbit.createSvg("circle", {
    cls: "homepage-studio-celestial-orbit-node",
    attr: {
      cx: 926,
      cy: 110,
      r: 3.5
    }
  });
};

/** The Cosmic Cartography Banner is entirely local SVG/CSS art. */
const renderCosmicBannerArt = (container: HTMLElement): void => {
  const svg = container.createSvg("svg", {
    cls: "homepage-studio-cosmic-orbits",
    attr: {
      viewBox: "0 0 1200 240",
      preserveAspectRatio: "xMidYMid slice",
      focusable: "false",
      "aria-hidden": "true"
    }
  });
  const majorOrbit = svg.createSvg("path", {
    cls: "homepage-studio-cosmic-orbit",
    attr: {
      d: "M -100 300 A 400 400 0 0 1 900 -100",
      fill: "none"
    }
  });
  // Obsidian 1.13 passes `cls` through DOMTokenList.add.  Keep each class
  // as a separate token so a composite class string cannot abort rendering.
  majorOrbit.classList.add("homepage-studio-cosmic-orbit-major");
  for (const [cx, cy, rx, ry, dash] of [
    [700, 120, 300, 80, "4 6"],
    [800, 100, 200, 50, "3 5"],
    [600, 160, 350, 100, "2 8"]
  ] as const) {
    svg.createSvg("ellipse", {
      cls: "homepage-studio-cosmic-orbit",
      attr: {
        cx,
        cy,
        rx,
        ry,
        "stroke-dasharray": dash,
        fill: "none"
      }
    });
  }
  const starField = svg.createSvg("g", {
    cls: "homepage-studio-cosmic-stars"
  });
  const stars = [
    [850, 80, 0.8], [870, 90, 1], [860, 75, 0.6], [880, 85, 0.7],
    [840, 95, 0.9], [890, 70, 0.5], [830, 88, 0.8], [900, 95, 0.6],
    [875, 100, 0.7], [855, 65, 0.5], [910, 80, 0.6], [845, 105, 0.9],
    [895, 75, 0.7], [865, 110, 0.5], [920, 88, 0.6], [835, 70, 0.8],
    [905, 100, 0.5], [878, 60, 0.7], [848, 115, 0.6], [925, 92, 0.8],
    [815, 78, 0.5], [888, 105, 0.7], [862, 55, 0.6], [932, 85, 0.5],
    [822, 92, 0.7]
  ] as const;
  for (const [cx, cy, r] of stars) {
    starField.createSvg("circle", {
      cls: "homepage-studio-cosmic-star",
      attr: { cx, cy, r }
    });
  }
  const anchor = svg.createSvg("g", {
    cls: "homepage-studio-cosmic-anchor"
  });
  anchor.createSvg("circle", { attr: { cx: 870, cy: 85, r: 5 } });
  anchor.createSvg("circle", { attr: { cx: 870, cy: 85, r: 8, fill: "none" } });
};

interface CosmicEdgeMotif {
  family: string;
  position: string;
  variant: string;
  paths: readonly string[];
  ellipses: readonly (readonly [number, number, number, number, number])[];
  rings: readonly (readonly [number, number, number])[];
  halos: readonly (readonly [number, number, number])[];
  anchors: readonly (readonly [number, number, number])[];
  points: readonly (readonly [number, number, number])[];
}

const COSMIC_EDGE_MOTIFS = [
  {
    family: "orbital-core",
    position: "left-high",
    variant: "orbital-core-drift",
    paths: ["M-26 146 A156 156 0 0 1 224 -20"],
    ellipses: [[126, 78, 108, 35, -11], [144, 72, 72, 22, 7]],
    rings: [[148, 69, 10]],
    halos: [[148, 69, 17]],
    anchors: [[148, 69, 5.5]],
    points: [[28, 66, 1], [47, 102, 1.5], [68, 43, 1], [84, 118, 1.25], [103, 52, 1], [129, 111, 1.5], [158, 42, 1], [177, 96, 1.25], [198, 55, 1], [218, 108, 1.5], [111, 84, 0.75], [188, 78, 0.75]]
  },
  {
    family: "orbital-core",
    position: "right-mid-high",
    variant: "orbital-core-tilt",
    paths: ["M18 -8 A190 190 0 0 0 258 142"],
    ellipses: [[112, 86, 94, 29, 19], [96, 92, 61, 18, 4]],
    rings: [[76, 100, 9]],
    halos: [[76, 100, 15]],
    anchors: [[76, 100, 4.5]],
    points: [[29, 78, 1.25], [42, 48, 0.75], [55, 116, 1], [91, 54, 1.5], [113, 125, 1], [138, 62, 1.25], [161, 112, 0.75], [184, 77, 1.5], [207, 101, 1], [223, 57, 1.25]]
  },
  {
    family: "orbital-core",
    position: "left-mid-low",
    variant: "orbital-core-sparse",
    paths: [],
    ellipses: [[128, 79, 113, 31, 14], [139, 85, 68, 19, -9]],
    rings: [[182, 72, 8]],
    halos: [[182, 72, 14]],
    anchors: [[182, 72, 4]],
    points: [[22, 89, 1], [51, 54, 1.25], [75, 115, 0.75], [105, 60, 1], [129, 101, 1.5], [159, 48, 0.75], [202, 96, 1], [225, 65, 1.25]]
  },
  {
    family: "orbital-core",
    position: "right-deep",
    variant: "orbital-core-cluster",
    paths: ["M-12 12 A170 170 0 0 1 252 126"],
    ellipses: [[114, 80, 89, 34, -24], [126, 76, 59, 20, -24]],
    rings: [[82, 92, 10]],
    halos: [[82, 92, 16]],
    anchors: [[82, 92, 5]],
    points: [[34, 108, 1], [46, 76, 1.5], [58, 119, 0.75], [67, 54, 1], [93, 58, 1.25], [105, 111, 1], [119, 47, 0.75], [137, 103, 1.5], [154, 65, 1], [176, 91, 0.75], [198, 51, 1.25], [218, 84, 1]]
  },
  {
    family: "orbital-core",
    position: "bottom-offset",
    variant: "orbital-core-offset",
    paths: [],
    ellipses: [[118, 82, 112, 36, -14], [105, 82, 68, 20, 9]],
    rings: [[88, 86, 10]],
    halos: [[88, 86, 17]],
    anchors: [[88, 86, 5.5]],
    points: [[17, 65, 1], [34, 109, 1.25], [52, 47, 0.75], [72, 120, 1.5], [97, 54, 1], [126, 112, 1.25], [151, 49, 1], [177, 98, 1.5], [204, 61, 0.75], [225, 112, 1]]
  },
  {
    family: "orbital-core",
    position: "bottom-full",
    variant: "orbital-core-open",
    paths: [],
    ellipses: [[126, 80, 104, 32, 8], [150, 74, 68, 20, -6], [132, 83, 44, 13, 16]],
    rings: [[172, 68, 9]],
    halos: [[172, 68, 15]],
    anchors: [[172, 68, 4.5]],
    points: [[27, 79, 1], [45, 49, 1.25], [63, 111, 0.75], [88, 58, 1.5], [112, 116, 1], [137, 46, 0.75], [158, 105, 1.25], [187, 91, 1], [204, 48, 1.5], [224, 101, 0.75], [194, 120, 1]]
  }
] satisfies readonly CosmicEdgeMotif[];

const renderCosmicEdgeMotif = (
  container: HTMLElement,
  motif: CosmicEdgeMotif
): void => {
  const svg = container.createSvg("svg", {
    cls: "homepage-studio-cosmic-background-svg",
    attr: {
      viewBox: "0 0 240 160",
      preserveAspectRatio: "xMidYMid meet",
      focusable: "false",
      "aria-hidden": "true",
      "data-family": motif.family,
      "data-position": motif.position,
      "data-variant": motif.variant
    }
  });
  for (const d of motif.paths) {
    svg.createSvg("path", {
      cls: "homepage-studio-cosmic-background-segment",
      attr: { d }
    });
  }
  for (const [cx, cy, rx, ry, rotation] of motif.ellipses) {
    svg.createSvg("ellipse", {
      cls: "homepage-studio-cosmic-background-orbit",
      attr: {
        cx,
        cy,
        rx,
        ry,
        transform: `rotate(${rotation} ${cx} ${cy})`
      }
    });
  }
  for (const [cx, cy, r] of motif.halos) {
    svg.createSvg("circle", {
      cls: "homepage-studio-cosmic-background-halo",
      attr: { cx, cy, r }
    });
  }
  for (const [cx, cy, r] of motif.rings) {
    svg.createSvg("circle", {
      cls: "homepage-studio-cosmic-background-ring",
      attr: { cx, cy, r }
    });
  }
  for (const [cx, cy, r] of motif.anchors) {
    svg.createSvg("circle", {
      cls: "homepage-studio-cosmic-background-anchor",
      attr: { cx, cy, r }
    });
  }
  for (const [cx, cy, r] of motif.points) {
    svg.createSvg("circle", {
      cls: "homepage-studio-cosmic-background-point",
      attr: { cx, cy, r }
    });
  }
};

/** Static side constellations; unlike the demo, this never uses Canvas. */
const renderCosmicBackgroundArt = (container: HTMLElement): void => {
  for (const motif of COSMIC_EDGE_MOTIFS) {
    if (!motif.position.startsWith("bottom-")) {
      renderCosmicEdgeMotif(container, motif);
    }
  }
};

const renderCosmicBottomArt = (container: HTMLElement): void => {
  for (const motif of COSMIC_EDGE_MOTIFS) {
    if (motif.position.startsWith("bottom-")) {
      renderCosmicEdgeMotif(container, motif);
    }
  }
};

const renderArchiveBannerArt = (container: HTMLElement): void => {
  const svg = container.createSvg("svg", {
    cls: "homepage-studio-archive-banner-backdrop",
    attr: {
      viewBox: "0 0 1000 200",
      preserveAspectRatio: "none",
      focusable: "false",
      "aria-hidden": "true"
    }
  });
  svg.createSvg("path", {
    cls: "homepage-studio-archive-mountain",
    attr: {
      d: "M0,200 L0,150 L150,80 L250,130 L400,40 L550,140 L700,90 L850,160 L1000,100 L1000,200 Z",
      "vector-effect": "non-scaling-stroke"
    }
  });
};

/**
 * Demo5 draws its topographic survey outside the Banner, behind the whole
 * archive page. Keeping that layer separate is important: a custom Banner
 * image must replace only the Banner art, not the page's paper geometry.
 */
const renderArchiveBackgroundArt = (container: HTMLElement): void => {
  const svg = container.createSvg("svg", {
    cls: "homepage-studio-archive-background-svg",
    attr: {
      viewBox: "0 0 1000 1000",
      preserveAspectRatio: "xMidYMid slice",
      focusable: "false",
      "aria-hidden": "true"
    }
  });
  const topography = svg.createSvg("g", {
    cls: "homepage-studio-archive-background-topography"
  });
  for (const path of [
    "M-100,500 Q 200,400 400,600 T 900,400 Q 1100,500 1200,300",
    "M-100,550 Q 200,450 400,650 T 900,450 Q 1100,550 1200,350",
    "M-100,600 Q 200,500 400,700 T 900,500 Q 1100,600 1200,400"
  ]) {
    topography.createSvg("path", {
      cls: "homepage-studio-archive-background-topography-line",
      attr: {
        d: path,
        fill: "none",
        "vector-effect": "non-scaling-stroke"
      }
    });
  }
  for (const radius of [150, 180]) {
    topography.createSvg("circle", {
      cls: "homepage-studio-archive-background-topography-circle",
      attr: {
        cx: 850,
        cy: 200,
        r: radius,
        fill: "none",
        ...(radius === 150 ? { "stroke-dasharray": "2 4" } : {}),
        "vector-effect": "non-scaling-stroke"
      }
    });
  }
  for (const transform of [
    "scale(0.5) translate(200, 100)",
    "scale(0.3) translate(800, 400)",
    "scale(0.4) translate(900, 250)"
  ]) {
    topography.createSvg("path", {
      cls: "homepage-studio-archive-background-squiggle",
      attr: {
        d: "M200,100 Q 210,90 220,100 Q 210,95 200,100 M220,100 Q 230,90 240,100 Q 230,95 220,100",
        fill: "none",
        transform,
        "vector-effect": "non-scaling-stroke"
      }
    });
  }
};

interface BannerImageRenderState {
  sourceKey: string | null;
  image: HTMLImageElement | null;
  loaded: boolean;
}

const bannerImageStates = new WeakMap<HTMLElement, BannerImageRenderState>();

const clearBannerImageRenderState = (
  renderState: BannerImageRenderState
): void => {
  renderState.image?.removeAttribute("src");
  renderState.image?.remove();
  renderState.sourceKey = null;
  renderState.image = null;
  renderState.loaded = false;
};

export const clearHomepageBannerImageState = (
  container: HTMLElement
): void => {
  const renderState = bannerImageStates.get(container);
  if (renderState !== undefined) {
    clearBannerImageRenderState(renderState);
    bannerImageStates.delete(container);
  }
};

const renderBannerImage = (
  banner: HTMLElement,
  imageSource: NonNullable<HomepageShellViewModel["banner"]["image"]>,
  scope: Component,
  renderState: BannerImageRenderState
): void => {
  const sourceKey = `${imageSource.sourceType}:${imageSource.url}`;
  const reuseImage = renderState.sourceKey === sourceKey
    && renderState.image !== null;
  if (!reuseImage) {
    clearBannerImageRenderState(renderState);
  }
  const image = reuseImage && renderState.image !== null
    ? renderState.image
    : banner.createEl("img", {
      cls: "homepage-studio-banner-image",
      attr: {
        alt: "",
        "aria-hidden": "true",
        draggable: "false",
        loading: "lazy",
        decoding: "async",
        fetchpriority: "low"
      }
    });
  if (reuseImage) {
    banner.appendChild(image);
  } else {
    renderState.sourceKey = sourceKey;
    renderState.image = image;
  }
  const defaultArt = banner.querySelector<HTMLElement>(
    ".homepage-studio-banner-art"
  );
  const archiveBanner = banner.getAttribute("data-archive-art") !== null
    || banner.closest(
      '.homepage-studio[data-theme="archive-observatory"]'
    ) !== null;
  if (imageSource.sourceType === "vault") {
    image.addClass("is-vault-source");
  }
  if (archiveBanner) {
    banner.setAttribute("data-archive-art", "custom");
    defaultArt?.setAttribute("hidden", "");
    banner.querySelector<HTMLElement>(
      ".homepage-studio-archive-banner-circle"
    )?.setAttribute("hidden", "");
  } else if (imageSource.sourceType === "vault") {
    defaultArt?.setAttribute("hidden", "");
  }
  const previouslyLoaded = renderState.loaded;
  if (previouslyLoaded) {
    image.addClass("is-loaded");
  }
  banner.setAttribute(
    "data-image-state",
    previouslyLoaded ? "loaded" : "loading"
  );
  banner.setAttribute("data-image-source", imageSource.sourceType);
  const targetWindow = banner.ownerDocument.defaultView;
  let active = true;
  let timeoutHandle: number | null = null;
  const clearLoadTimeout = (): void => {
    if (targetWindow !== null && timeoutHandle !== null) {
      targetWindow.clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  };
  const fallback = (): void => {
    if (!active) {
      return;
    }
    active = false;
    clearLoadTimeout();
    if (renderState.image === image) {
      clearBannerImageRenderState(renderState);
    } else {
      image.removeAttribute("src");
      image.remove();
    }
    banner.setAttribute("data-image-state", "fallback");
    banner.removeAttribute("data-image-source");
    defaultArt?.removeAttribute("hidden");
    if (archiveBanner) {
      banner.setAttribute("data-archive-art", "default");
      banner.querySelector<HTMLElement>(
        ".homepage-studio-archive-banner-circle"
      )?.removeAttribute("hidden");
    }
  };
  const reveal = async (): Promise<void> => {
    if (imageSource.sourceType === "vault") {
      clearLoadTimeout();
    }
    try {
      if (typeof image.decode === "function") {
        await image.decode();
      }
    } catch {
      fallback();
      return;
    }
    if (!active || !image.isConnected) {
      return;
    }
    renderState.loaded = true;
    banner.setAttribute("data-image-state", "loaded");
    image.addClass("is-loaded");
  };
  scope.registerDomEvent(image, "load", () => {
    void reveal();
  });
  scope.registerDomEvent(image, "error", fallback);
  if (
    targetWindow !== null
    && !previouslyLoaded
    && imageSource.sourceType === "remote"
  ) {
    timeoutHandle = targetWindow.setTimeout(
      fallback,
      BANNER_LOAD_TIMEOUT_MS
    );
  }
  scope.register(() => {
    active = false;
    clearLoadTimeout();
    if (renderState.image !== image) {
      image.removeAttribute("src");
    }
  });
  if (!reuseImage) {
    image.src = imageSource.url;
  }
};

type HomepagePlan = NonNullable<HomepageModuleViewModel["plan"]>;

const renderArchivePlan = (
  section: HTMLElement,
  plan: HomepagePlan
): void => {
  const archivePlan = section.createDiv({
    cls: "homepage-studio-archive-plan",
    attr: {
      "data-plan-state": plan.state
    }
  });
  const timeline = archivePlan.createDiv({
    cls: "homepage-studio-archive-plan-timeline"
  });
  if (plan.schedule.length === 0) {
    timeline.createEl("p", {
      cls: "homepage-studio-archive-plan-empty",
      text: plan.emptyScheduleLabel
    });
    return;
  }
  const currentIndex = plan.schedule.findIndex(
    (item) => item.state === "current"
  );
  let startIndex = currentIndex >= 0 ? Math.max(0, currentIndex - 1) : 0;
  if (currentIndex < 0) {
    for (let index = plan.schedule.length - 1; index >= 0; index -= 1) {
      if (plan.schedule[index]?.state === "past") {
        startIndex = index;
        break;
      }
    }
  }
  timeline.setAttribute("role", "list");
  attachAccessibleLabel(timeline, archivePlan, plan.scheduleLabel);
  const visibleSchedule = plan.schedule.slice(startIndex);
  for (const item of visibleSchedule) {
    const row = timeline.createDiv({
      cls: "homepage-studio-archive-plan-item",
      attr: {
        "data-state": item.state,
        role: "listitem",
        ...(item.state === "current" ? { "aria-current": "step" } : {})
      }
    });
    row.createSpan({
      cls: "homepage-studio-archive-plan-time",
      text: item.timeRangeLabel.replace(/—/gu, "-")
    });
    const content = row.createDiv({
      cls: "homepage-studio-archive-plan-content"
    });
    content.createEl("h3", {
      cls: "homepage-studio-archive-plan-label",
      text: item.label
    });
    content.createSpan({
      cls: "homepage-studio-archive-plan-status",
      text: item.stateLabel
    });
  }
};

const renderCosmicPlan = (
  section: HTMLElement,
  plan: HomepagePlan
): void => {
  const cosmicPlan = section.createDiv({
    cls: "homepage-studio-cosmic-plan",
    attr: {
      "data-plan-state": plan.state
    }
  });
  cosmicPlan.createSpan({
    cls: "homepage-studio-cosmic-plan-template",
    text: plan.templateLabel
  });
  const current = cosmicPlan.createDiv({
    cls: "homepage-studio-cosmic-plan-current",
    attr: {
      "data-plan-state": plan.state
    }
  });
  current.createEl("h3", {
    cls: "homepage-studio-cosmic-plan-primary",
    text: plan.primaryLabel
  });
  current.createSpan({
    cls: "homepage-studio-cosmic-plan-current-time",
    text: plan.timeRangeLabel.replace(/—/gu, "-")
  });
  if (plan.progress !== null) {
    const progressPercent = Math.max(
      0,
      Math.min(100, Math.floor(plan.progress * 100))
    );
    const progressTrack = current.createDiv({
      cls: "homepage-studio-cosmic-plan-progress",
      attr: {
        role: "progressbar",
        "aria-valuemin": "0",
        "aria-valuemax": "100",
        "aria-valuenow": progressPercent.toString(),
        "data-progress": progressPercent.toString()
      }
    });
    attachAccessibleLabel(progressTrack, current, plan.statusLabel);
    const fill = progressTrack.createDiv({
      cls: "homepage-studio-cosmic-plan-progress-fill",
      attr: { "aria-hidden": "true" }
    });
    fill.style.width = `${progressPercent}%`;
    const dot = progressTrack.createDiv({
      cls: "homepage-studio-cosmic-plan-progress-dot",
      attr: { "aria-hidden": "true" }
    });
    dot.style.left = `${progressPercent}%`;
    current.createSpan({
      cls: "homepage-studio-cosmic-plan-progress-pct",
      text: `${progressPercent}%`,
      attr: { "aria-hidden": "true" }
    });
  }
  const timeline = cosmicPlan.createEl("ol", {
    cls: "homepage-studio-cosmic-plan-timeline"
  });
  attachAccessibleLabel(timeline, cosmicPlan, plan.scheduleLabel);
  if (plan.schedule.length === 0) {
    timeline.createEl("li", {
      cls: "homepage-studio-cosmic-plan-empty",
      text: plan.emptyScheduleLabel
    });
    return;
  }
  const currentIndex = plan.schedule.findIndex(
    (item) => item.state === "current"
  );
  let previousPastIndex = -1;
  const pastSearchEnd = currentIndex >= 0
    ? currentIndex - 1
    : plan.schedule.length - 1;
  for (let index = pastSearchEnd; index >= 0; index -= 1) {
    if (plan.schedule[index]?.state === "past") {
      previousPastIndex = index;
      break;
    }
  }
  const visibleSchedule = plan.schedule.filter((item, index) => (
    item.state !== "past" || index === previousPastIndex
  ));
  for (const item of visibleSchedule) {
    const row = timeline.createEl("li", {
      cls: "homepage-studio-cosmic-plan-item",
      attr: {
        "data-state": item.state,
        ...(item.state === "current" ? { "aria-current": "step" } : {})
      }
    });
    row.createSpan({
      cls: "homepage-studio-cosmic-plan-item-time",
      text: item.timeRangeLabel.replace(/—/gu, "-")
    });
    row.createSpan({
      cls: "homepage-studio-cosmic-plan-item-label",
      text: item.label
    });
    row.createSpan({
      cls: "homepage-studio-cosmic-plan-item-status",
      text: item.stateLabel
    });
  }
};

const renderStandardPlan = (
  section: HTMLElement,
  planModel: HomepagePlan
): void => {
  const plan = section.createDiv({
    cls: "homepage-studio-current-plan",
    attr: {
      "data-plan-state": planModel.state
    }
  });
  plan.createSpan({
    cls: "homepage-studio-plan-template",
    text: planModel.templateLabel
  });
  const active = plan.createDiv({
    cls: "homepage-studio-plan-active"
  });
  const activeHeading = active.createDiv({
    cls: "homepage-studio-plan-active-heading"
  });
  activeHeading.createEl("h3", {
    cls: "homepage-studio-plan-primary",
    text: planModel.primaryLabel
  });
  activeHeading.createSpan({
    cls: "homepage-studio-plan-range",
    text: planModel.timeRangeLabel
  });
  if (planModel.progress !== null) {
    active.createEl("progress", {
      cls: "homepage-studio-plan-progress",
      attr: {
        max: "1",
        value: planModel.progress.toString()
      }
    });
  }
  const activeMeta = active.createDiv({
    cls: "homepage-studio-plan-active-meta"
  });
  const status = activeMeta.createSpan({
    cls: "homepage-studio-plan-status",
    text: planModel.statusLabel
  });
  if (planModel.state === "idle") {
    status.setAttribute("aria-hidden", "true");
  }
  if (planModel.remainingLabel !== null) {
    activeMeta.createSpan({
      cls: "homepage-studio-plan-remaining",
      text: planModel.remainingLabel
    });
  }

  const next = plan.createDiv({
    cls: "homepage-studio-plan-next"
  });
  next.createSpan({
    cls: "homepage-studio-plan-next-title",
    text: planModel.nextTitle
  });
  next.createSpan({
    cls: "homepage-studio-plan-next-label",
    text: planModel.nextLabel
  });
  const nextTime = next.createSpan({
    cls: "homepage-studio-plan-next-time"
  });
  if (planModel.nextDayLabel !== null) {
    nextTime.createSpan({
      cls: "homepage-studio-plan-next-day",
      text: planModel.nextDayLabel
    });
  }
  nextTime.createSpan({
    text: planModel.nextTimeLabel
  });

  const schedule = plan.createEl("details", {
    cls: "homepage-studio-plan-schedule"
  });
  schedule.createEl("summary", {
    text: planModel.scheduleLabel
  });
  if (planModel.schedule.length === 0) {
    schedule.createEl("p", {
      cls: "homepage-studio-plan-schedule-empty",
      text: planModel.emptyScheduleLabel
    });
    return;
  }
  const list = schedule.createEl("ol", {
    cls: "homepage-studio-plan-schedule-list"
  });
  for (const item of planModel.schedule) {
    const row = list.createEl("li", {
      cls: "homepage-studio-plan-schedule-item",
      attr: {
        "data-state": item.state
      }
    });
    row.createSpan({
      cls: "homepage-studio-plan-schedule-time",
      text: item.timeRangeLabel
    });
    row.createSpan({
      cls: "homepage-studio-plan-schedule-label",
      text: item.label
    });
    row.createSpan({
      cls: "homepage-studio-plan-schedule-state",
      text: item.stateLabel
    });
  }
};

const renderPlanContent = (
  section: HTMLElement,
  plan: HomepagePlan,
  theme: HomepageShellViewModel["theme"]
): void => {
  if (theme === "cosmic-cartography") {
    renderCosmicPlan(section, plan);
    return;
  }
  if (theme === "archive-observatory") {
    renderArchivePlan(section, plan);
    return;
  }
  renderStandardPlan(section, plan);
};

const renderArchivePlanUnavailable = (
  section: HTMLElement,
  module: HomepageModuleViewModel,
  actions: HomepageShellActions,
  scope: Component
): void => {
  const plan = section.createDiv({
    cls: "homepage-studio-archive-plan",
    attr: {
      "data-plan-state": module.state
    }
  });
  const emptyState = plan.createDiv({
    cls: "homepage-studio-archive-plan-empty-state"
  });
  renderIcon(
    emptyState,
    module.emptyState.icon,
    "homepage-studio-archive-plan-empty-icon"
  );
  emptyState.createEl("h3", {
    cls: "homepage-studio-archive-plan-empty-title",
    text: module.emptyState.title
  });
  emptyState.createEl("p", {
    cls: "homepage-studio-archive-plan-empty-description",
    text: module.emptyState.description
  });
  const action = emptyState.createEl("button", {
    cls: "homepage-studio-archive-plan-empty-action",
    text: module.emptyState.actionLabel,
    attr: {
      type: "button"
    }
  });
  scope.registerDomEvent(action, "click", () => {
    actions.openSettings(module.emptyState.settingsSection);
  });
};

const renderModule = (
  container: HTMLElement,
  module: HomepageModuleViewModel,
  actions: HomepageShellActions,
  scope: Component,
  theme: HomepageShellViewModel["theme"],
  selectionHost: HTMLElement
): void => {
  const titleId = `homepage-studio-module-${module.id}-title`;
  const section = container.createEl("section", {
    cls: "homepage-studio-module",
    attr: {
      "aria-labelledby": titleId,
      "data-module": module.id,
      "data-size": module.size,
      "data-state": module.state
    }
  });
  const header = section.createDiv({
    cls: "homepage-studio-module-header"
  });
  const titleGroup = header.createDiv({
    cls: "homepage-studio-module-title-group"
  });
  titleGroup.createSpan({
    cls: "homepage-studio-module-title-marker",
    attr: {
      "aria-hidden": "true"
    }
  });
  renderIcon(
    titleGroup,
    module.icon,
    "homepage-studio-module-title-icon"
  );
  titleGroup.createEl("h2", {
    cls: "homepage-studio-module-title",
    text: module.title,
    attr: {
      id: titleId
    }
  });
  const headerControls = header.createDiv({
    cls: "homepage-studio-module-controls"
  });
  if (
    theme === "archive-observatory"
    && module.state === "ready"
    && module.plan !== undefined
  ) {
    headerControls.createSpan({
      cls: "homepage-studio-archive-plan-template",
      text: module.plan.templateLabel
    });
  }
  if (module.state === "ready" && module.tasks !== undefined) {
    const controls = headerControls.createDiv({
      cls: "homepage-studio-task-header-controls"
    });
    if (module.tasks.archiveAllLabel !== null) {
      const archiveAll = controls.createEl("button", {
        cls: "homepage-studio-task-header-button",
        text: module.tasks.archiveAllLabel,
        attr: { type: "button" }
      });
      scope.registerDomEvent(archiveAll, "click", () => {
        archiveAll.disabled = true;
        void actions.archiveCompletedTasks().then((applied) => {
          if (!applied) {
            archiveAll.disabled = false;
          }
        });
      });
    }
    if (module.tasks.archiveToggleLabel !== null) {
      const archiveToggle = controls.createEl("button", {
        cls: "homepage-studio-task-header-button",
        text: module.tasks.archiveToggleLabel,
        attr: {
          type: "button",
          "aria-expanded": module.tasks.archiveVisible.toString()
        }
      });
      scope.registerDomEvent(archiveToggle, "click", () => {
        actions.setTaskArchiveVisible(!module.tasks?.archiveVisible);
      });
    }
    controls.createSpan({
      cls: "homepage-studio-task-progress",
      text: module.tasks.progressLabel
    });
  }
  if (module.state === "ready" && module.fileGroups !== undefined) {
    const manage = headerControls.createEl("button", {
      cls: "homepage-studio-file-groups-manage",
      text: module.fileGroups.manageLabel,
      attr: { type: "button" }
    });
    scope.registerDomEvent(manage, "click", () => {
      actions.openSettings("file-groups");
    });
  }
  if (module.state === "ready" && module.heatmap !== undefined) {
    const heatmap = section.createDiv({
      cls: "homepage-studio-heatmap"
    });
    const summary = heatmap.createDiv({
      cls: "homepage-studio-heatmap-summary"
    });
    const range = summary.createSpan({
      cls: "homepage-studio-heatmap-range",
      text: module.heatmap.rangeLabel
    });
    range.setAttribute("aria-hidden", "true");
    const today = summary.createDiv({
      cls: "homepage-studio-heatmap-today"
    });
    today.createSpan({
      cls: "homepage-studio-heatmap-today-label",
      text: module.heatmap.todayLabel
    });
    today.createEl("strong", {
      cls: "homepage-studio-heatmap-today-value",
      text: module.heatmap.todayValue
    });
    const viewport = heatmap.createDiv({
      cls: "homepage-studio-heatmap-viewport"
    });
    const calendar = viewport.createDiv({
      cls: "homepage-studio-heatmap-calendar"
    });
    const weekdayLabels = calendar.createDiv({
      cls: "homepage-studio-heatmap-weekdays",
      attr: {
        "aria-hidden": "true"
      }
    });
    weekdayLabels.createSpan({
      cls: "homepage-studio-heatmap-weekday-spacer"
    });
    for (const label of module.heatmap.weekdayLabels) {
      weekdayLabels.createSpan({
        cls: "homepage-studio-heatmap-weekday",
        text: label
      });
    }
    const calendarContent = calendar.createDiv({
      cls: "homepage-studio-heatmap-calendar-content"
    });
    const monthLabels = calendarContent.createDiv({
      cls: "homepage-studio-heatmap-months",
      attr: {
        "aria-hidden": "true"
      }
    });
    for (const week of module.heatmap.weeks) {
      const monthSlot = monthLabels.createSpan({
        cls: "homepage-studio-heatmap-month-slot"
      });
      if (week.monthLabel !== "") {
        monthSlot.createSpan({
          cls: "homepage-studio-heatmap-month",
          text: week.monthLabel
        });
      }
    }
    const grid = calendarContent.createDiv({
      cls: "homepage-studio-heatmap-grid",
      attr: {
        role: "grid"
      }
    });
    attachAccessibleLabel(grid, calendarContent, module.heatmap.gridLabel);
    const cells = module.heatmap.cells;
    let activeIndex = Math.max(
      0,
      cells.findIndex((cell) => cell.isToday)
    );
    const selectedDateAttribute =
      "data-homepage-studio-heatmap-selected-date";
    const persistedDateKey = selectionHost.getAttribute(
      selectedDateAttribute
    );
    const persistedIndex = persistedDateKey === null
      ? -1
      : cells.findIndex((cell) => cell.dateKey === persistedDateKey);
    let selectedIndex: number | null = persistedIndex >= 0
      ? persistedIndex
      : null;
    const buttons: HTMLButtonElement[] = [];
    const legend = heatmap.createDiv({
      cls: "homepage-studio-heatmap-legend",
      attr: {
        "aria-hidden": "true"
      }
    });
    legend.createSpan({
      cls: "homepage-studio-heatmap-legend-label",
      text: "LESS"
    });
    for (const level of [0, 1, 2, 3, 4]) {
      legend.createSpan({
        cls: "homepage-studio-heatmap-cell",
        attr: {
          "data-level": level.toString()
        }
      });
    }
    legend.createSpan({
      cls: "homepage-studio-heatmap-legend-label",
      text: "MORE"
    });
    const detail = heatmap.createEl("section", {
      cls: "homepage-studio-heatmap-detail",
      attr: {
        "aria-live": "polite",
        "data-open": "false"
      }
    });
    let detailScope: Component | null = null;
    scope.register(() => {
      detailScope?.unload();
    });

    const renderDetails = (index: number): void => {
      const cell = cells[index];
      if (cell === undefined) {
        return;
      }
      detailScope?.unload();
      detailScope = new Component();
      detail.empty();
      const detailHeader = detail.createDiv({
        cls: "homepage-studio-heatmap-detail-header"
      });
      const detailDate = detailHeader.createDiv({
        cls: "homepage-studio-heatmap-detail-date"
      });
      if (
        theme !== "archive-observatory"
        && theme !== "cosmic-cartography"
      ) {
        renderIcon(
          detailDate,
          "calendar-days",
          "homepage-studio-heatmap-detail-icon"
        );
      }
      detailDate.createSpan({
        cls: "homepage-studio-heatmap-detail-date-label",
        text: cell.details.dateLabel
      });
      const detailHighlight = detailHeader.createDiv({
        cls: "homepage-studio-heatmap-detail-highlight"
      });
      if (
        theme !== "archive-observatory"
        && theme !== "cosmic-cartography"
      ) {
        renderIcon(
          detailHighlight,
          "pen-line",
          "homepage-studio-heatmap-detail-icon"
        );
      }
      detailHighlight.createEl("strong", {
        cls: "homepage-studio-heatmap-detail-total",
        text: [
          cell.details.totalLabel,
          cell.details.state === "files"
            ? cell.details.fileCountLabel
            : cell.details.statusMessage
        ].filter(Boolean).join(" · ")
      });
      if (cell.details.state !== "files") {
        detail.setAttribute("data-state", cell.details.state);
        return;
      }
      detail.setAttribute("data-state", "files");
      const fileList = detail.createEl("ul", {
        cls: "homepage-studio-heatmap-detail-files"
      });
      for (const file of cell.details.files) {
        const item = fileList.createEl("li");
        const fileButton = item.createEl("button", {
          cls: "homepage-studio-heatmap-file",
          attr: {
            type: "button"
          }
        });
        attachAccessibleLabel(fileButton, fileButton, file.accessibleLabel);
        fileButton.createSpan({
          cls: "homepage-studio-heatmap-file-title",
          text: file.title
        });
        fileButton.createSpan({
          cls: "homepage-studio-heatmap-file-value",
          text: file.contributionLabel
        });
        detailScope.registerDomEvent(fileButton, "click", (event) => {
          actions.openFile(file.path, event.ctrlKey || event.metaKey);
        });
        detailScope.registerDomEvent(fileButton, "auxclick", (event) => {
          if (event.button === 1) {
            event.preventDefault();
            actions.openFile(file.path, true);
          }
        });
      }
    };

    const selectCell = (index: number, moveFocus: boolean): void => {
      const nextButton = buttons[index];
      const previousButton = selectedIndex === null
        ? undefined
        : buttons[selectedIndex];
      const previousActiveButton = buttons[activeIndex];
      if (nextButton === undefined) {
        return;
      }
      if (selectedIndex === index) {
        selectedIndex = null;
        selectionHost.removeAttribute(selectedDateAttribute);
        nextButton.removeAttribute("data-selected");
        nextButton.setAttribute("aria-pressed", "false");
        nextButton.tabIndex = 0;
        activeIndex = index;
        detail.setAttribute("data-open", "false");
        detail.removeAttribute("data-state");
        detailScope?.unload();
        detailScope = null;
        detail.empty();
        if (moveFocus) {
          nextButton.focus();
        }
        return;
      }
      previousButton?.removeAttribute("data-selected");
      previousButton?.setAttribute("aria-pressed", "false");
      if (previousActiveButton !== undefined) {
        previousActiveButton.tabIndex = -1;
      }
      activeIndex = index;
      selectedIndex = index;
      const selectedCell = cells[index];
      if (selectedCell !== undefined) {
        selectionHost.setAttribute(
          selectedDateAttribute,
          selectedCell.dateKey
        );
      }
      nextButton.setAttribute("data-selected", "true");
      nextButton.setAttribute("aria-pressed", "true");
      nextButton.tabIndex = 0;
      detail.setAttribute("data-open", "true");
      renderDetails(index);
      if (moveFocus) {
        nextButton.focus();
      }
    };

    const cellIndexes = new Map(
      cells.map((cell, index) => [cell.dateKey, index])
    );
    const coordinateIndexes = new Map(
      cells.map((cell, index) => [
        `${cell.weekIndex}:${cell.weekdayIndex}`,
        index
      ])
    );
    const getCellIndex = (target: EventTarget | null): number | null => {
      if (!(target instanceof Element)) {
        return null;
      }
      const button = target.closest<HTMLElement>(
        ".homepage-studio-heatmap-cell"
      );
      if (button === null || !grid.contains(button)) {
        return null;
      }
      const dateKey = button.dataset.date;
      return dateKey === undefined
        ? null
        : cellIndexes.get(dateKey) ?? null;
    };
    scope.registerDomEvent(grid, "click", (event) => {
      const index = getCellIndex(event.target);
      if (index !== null) {
        selectCell(index, true);
      }
    });
    scope.registerDomEvent(grid, "keydown", (event) => {
      const index = getCellIndex(event.target);
      const cell = index === null ? undefined : cells[index];
      if (cell === undefined) {
        return;
      }
      const coordinateOffsets: Readonly<
        Record<string, readonly [number, number]>
      > = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0]
      };
      const offset = coordinateOffsets[event.key];
      if (offset === undefined) {
        return;
      }
      const nextIndex = coordinateIndexes.get([
        cell.weekIndex + offset[0],
        cell.weekdayIndex + offset[1]
      ].join(":"));
      if (nextIndex === undefined) {
        return;
      }
      event.preventDefault();
      selectCell(nextIndex, true);
    });
    const weeksFragment = createFragment();
    for (const week of module.heatmap.weeks) {
      const weekColumn = weeksFragment.createDiv({
        cls: "homepage-studio-heatmap-week",
        attr: {
          role: "presentation"
        }
      });
      for (const cell of week.cells) {
        if (cell === null) {
          weekColumn.createSpan({
            cls: "homepage-studio-heatmap-placeholder",
            attr: {
              "aria-hidden": "true"
            }
          });
          continue;
        }
        const index = cellIndexes.get(cell.dateKey);
        if (index === undefined) {
          continue;
        }
        const button = weekColumn.createEl("button", {
          cls: "homepage-studio-heatmap-cell",
          attr: {
            type: "button",
            role: "gridcell",
            "aria-pressed": "false",
            "data-date": cell.dateKey,
            "data-level": cell.level.toString(),
            ...(cell.isToday ? { "data-today": "true" } : {})
          }
        });
        attachAccessibleLabel(button, button, cell.accessibleLabel);
        button.tabIndex = index === activeIndex ? 0 : -1;
        buttons[index] = button;
      }
    }
    grid.appendChild(weeksFragment);
    if (selectedIndex !== null) {
      activeIndex = selectedIndex;
      const selectedButton = buttons[selectedIndex];
      selectedButton?.setAttribute("data-selected", "true");
      selectedButton?.setAttribute("aria-pressed", "true");
      if (selectedButton !== undefined) {
        selectedButton.tabIndex = 0;
      }
      detail.setAttribute("data-open", "true");
      renderDetails(selectedIndex);
    } else {
      renderDetails(activeIndex);
    }
    return;
  }

  if (module.state === "ready" && module.plan !== undefined) {
    renderPlanContent(section, module.plan, theme);
    return;
  }

  if (module.state === "ready" && module.journal !== undefined) {
    const journal = section.createDiv({
      cls: "homepage-studio-journal"
    });
    const toolbar = journal.createDiv({
      cls: "homepage-studio-journal-toolbar"
    });
    const navigation = toolbar.createDiv({
      cls: "homepage-studio-journal-navigation"
    });
    const previous = navigation.createEl("button", {
      cls: "homepage-studio-journal-icon-button",
      attr: {
        type: "button"
      }
    });
    attachTooltipAccessibleLabel(previous, module.journal.previousLabel);
    renderIcon(
      previous,
      "chevron-left",
      "homepage-studio-journal-button-icon"
    );
    const date = navigation.createEl("time", {
      cls: "homepage-studio-journal-date-group",
      attr: {
        datetime: module.journal.dateKey
      }
    });
    date.createSpan({
      cls: "homepage-studio-journal-date",
      text: module.journal.dateLabel
    });
    date.createSpan({
      cls: "homepage-studio-journal-weekday",
      text: module.journal.weekdayLabel
    });
    const next = navigation.createEl("button", {
      cls: "homepage-studio-journal-icon-button",
      attr: {
        type: "button",
        ...(module.journal.canMoveNext ? {} : { disabled: "" })
      }
    });
    attachTooltipAccessibleLabel(next, module.journal.nextLabel);
    renderIcon(
      next,
      "chevron-right",
      "homepage-studio-journal-button-icon"
    );
    scope.registerDomEvent(previous, "click", () => {
      actions.moveJournalDate(-1);
    });
    scope.registerDomEvent(next, "click", () => {
      actions.moveJournalDate(1);
    });

    const modes = toolbar.createDiv({
      cls: "homepage-studio-journal-modes",
      attr: {
        role: "group"
      }
    });
    for (const mode of ["edit", "preview"] as const) {
      const modeButton = modes.createEl("button", {
        cls: "homepage-studio-journal-mode",
        text: mode === "edit"
          ? module.journal.editLabel
          : module.journal.previewLabel,
        attr: {
          type: "button",
          "aria-pressed": (
            module.journal.viewMode === mode
          ).toString(),
          "data-active": (
            module.journal.viewMode === mode
          ).toString()
        }
      });
      scope.registerDomEvent(modeButton, "click", () => {
        actions.setJournalViewMode(mode);
      });
    }
    const deleteEntry = toolbar.createEl("button", {
      cls: "homepage-studio-journal-delete",
      text: module.journal.deleteLabel,
      attr: {
        type: "button",
        ...(module.journal.canDelete ? {} : { disabled: "" })
      }
    });
    scope.registerDomEvent(deleteEntry, "click", () => {
      actions.deleteJournalEntry();
    });

    if (module.journal.conflict !== null) {
      const conflict = journal.createDiv({
        cls: "homepage-studio-journal-conflict",
        attr: {
          role: "alert"
        }
      });
      conflict.createEl("strong", {
        cls: "homepage-studio-journal-conflict-title",
        text: module.journal.conflict.title
      });
      conflict.createEl("p", {
        cls: "homepage-studio-journal-conflict-description",
        text: module.journal.conflict.description
      });
      const conflictActions = conflict.createDiv({
        cls: "homepage-studio-journal-conflict-actions"
      });
      const reload = conflictActions.createEl("button", {
        text: module.journal.conflict.reloadLabel,
        attr: { type: "button" }
      });
      const openSource = conflictActions.createEl("button", {
        text: module.journal.conflict.openSourceLabel,
        attr: { type: "button" }
      });
      scope.registerDomEvent(reload, "click", () => {
        actions.reloadJournalDraft();
      });
      scope.registerDomEvent(openSource, "click", () => {
        actions.openFile(module.journal?.path ?? "", false);
      });
    }

    const journalEditorWrapper = journal.createDiv({
      cls: "homepage-studio-journal-editor-wrapper"
    });
    if (module.journal.viewMode === "edit") {
      const editor = journalEditorWrapper.createEl("textarea", {
        cls: "homepage-studio-journal-editor",
        attr: {
          spellcheck: "true"
        }
      });
      attachAccessibleLabel(editor, journal, module.journal.editorLabel);
      editor.value = module.journal.content;
      let isComposing = false;
      scope.registerDomEvent(editor, "compositionstart", () => {
        isComposing = true;
      });
      scope.registerDomEvent(editor, "compositionend", () => {
        isComposing = false;
        actions.beginTextInputInteraction();
        actions.updateJournalDraft(editor.value);
      });
      scope.registerDomEvent(editor, "focus", () => {
        actions.beginTextInputInteraction();
      });
      scope.registerDomEvent(editor, "input", () => {
        actions.beginTextInputInteraction();
        if (!isComposing) {
          actions.updateJournalDraft(editor.value);
        }
      });
      scope.registerDomEvent(editor, "blur", () => {
        if (isComposing) {
          isComposing = false;
          actions.updateJournalDraft(editor.value);
        }
        actions.flushJournalDraft();
      });
    } else {
      const preview = journalEditorWrapper.createDiv({
        cls: "homepage-studio-journal-preview"
      });
      if (module.journal.content === "") {
        preview.createEl("p", {
          cls: "homepage-studio-journal-preview-empty",
          text: module.journal.emptyPreviewLabel
        });
      } else {
        actions.renderMarkdown(
          module.journal.content,
          module.journal.path,
          preview,
          scope
        );
      }
    }
    return;
  }

  if (module.state === "ready" && module.tasks !== undefined) {
    const taskModel = module.tasks;
    const tasks = section.createDiv({
      cls: "homepage-studio-tasks"
    });
    const reorderLive = tasks.createDiv({
      cls: "homepage-studio-task-reorder-live",
      attr: {
        role: "status",
        "aria-live": "polite"
      }
    });
    const reorderItems = new Map<HTMLElement, TaskReorderItem>();
    let activeList: HTMLElement | null = null;
    let archiveSection: HTMLElement | null = null;
    let archiveList: HTMLElement | null = null;
    let showMore: HTMLButtonElement | null = null;
    let showMoreArchive: HTMLButtonElement | null = null;
    const activeScope = (completed: boolean): TaskReorderScope =>
      completed ? "active-completed" : "active-incomplete";
    const registerReorderItem = (
      row: HTMLElement,
      body: HTMLElement,
      item: {
        readonly target: TaskTarget;
        readonly text: string;
      },
      itemScope: TaskReorderScope,
      key: string,
      temporary: boolean
    ): void => {
      row.addClass("homepage-studio-task-reorder-item");
      row.setAttribute("data-task-reorder-key", key);
      if (temporary) {
        row.setAttribute("data-task-reorder-temporary", "true");
        row.setAttribute("inert", "");
      }
      body.addClass("homepage-studio-task-reorder-surface");
      reorderItems.set(row, {
        target: item.target,
        text: item.text,
        scope: itemScope
      });
    };
    if (module.tasks.conflict !== null) {
      const conflict = tasks.createDiv({
        cls: "homepage-studio-task-conflict"
      });
      conflict.createEl("strong", {
        cls: "homepage-studio-task-conflict-title",
        text: module.tasks.conflict.title
      });
      conflict.createEl("p", {
        cls: "homepage-studio-task-conflict-description",
        text: module.tasks.conflict.description
      });
      if (module.tasks.conflict.draftText !== null) {
        conflict.createEl("pre", {
          cls: "homepage-studio-task-conflict-draft",
          text: module.tasks.conflict.draftText,
          attr: {
            tabindex: "0",
            "aria-label": module.tasks.conflict.draftLabel
          }
        });
      }
      const conflictActions = conflict.createDiv({
        cls: "homepage-studio-task-conflict-actions"
      });
      const reload = conflictActions.createEl("button", {
        cls: "homepage-studio-task-conflict-button",
        text: module.tasks.conflict.reloadLabel,
        attr: { type: "button" }
      });
      const openSource = conflictActions.createEl("button", {
        cls: "homepage-studio-task-conflict-button",
        text: module.tasks.conflict.openSourceLabel,
        attr: { type: "button" }
      });
      scope.registerDomEvent(reload, "click", () => {
        actions.reloadTaskSource();
      });
      scope.registerDomEvent(openSource, "click", () => {
        actions.openTaskSource(module.tasks?.path ?? "");
      });
    }

    if (module.tasks.items.length === 0) {
      tasks.createEl("p", {
        cls: "homepage-studio-task-empty",
        text: module.tasks.emptyLabel
      });
    } else {
      const list = tasks.createEl("ul", {
        cls: "homepage-studio-task-list homepage-studio-task-reorder-list"
      });
      activeList = list;
      attachAccessibleLabel(list, tasks, module.tasks.listLabel);
      for (const [itemIndex, item] of module.tasks.items.entries()) {
        const row = list.createEl("li", {
          cls: "homepage-studio-task",
          attr: {
            "data-completed": item.completed.toString(),
            "data-editing": (item.editingText !== null).toString()
          }
        });
        const checkbox = row.createEl("button", {
          cls: "homepage-studio-task-checkbox",
          attr: {
            type: "button",
            role: "checkbox",
            "aria-checked": item.completed.toString(),
            "data-checked": item.completed.toString()
          }
        });
        attachTooltipAccessibleLabel(checkbox, item.checkboxLabel);
        checkbox.disabled = item.editingText !== null;
        const body = row.createDiv({
          cls: "homepage-studio-task-body"
        });
        registerReorderItem(
          row,
          body,
          item,
          activeScope(item.completed),
          `active-${itemIndex}`,
          false
        );
        const rowActions = row.createDiv({
          cls: "homepage-studio-task-actions"
        });
        if (item.editingText === null) {
          const content = body.createDiv({
            cls: "homepage-studio-task-content"
          });
          actions.renderMarkdown(
            item.text,
            module.tasks.path,
            content,
            scope
          );
          if (item.recurrenceLabel !== null) {
            body.createSpan({
              cls: "homepage-studio-task-recurrence",
              text: item.recurrenceLabel,
              attr: { "aria-hidden": "true" }
            });
          }
          const edit = rowActions.createEl("button", {
            cls: "homepage-studio-task-icon-button",
            attr: {
              type: "button"
            }
          });
          attachTooltipAccessibleLabel(edit, item.editLabel);
          renderIcon(edit, "pencil", "homepage-studio-task-action-icon");
          if (item.archiveLabel !== null) {
            const archive = rowActions.createEl("button", {
              cls: "homepage-studio-task-icon-button",
              attr: {
                type: "button"
              }
            });
            attachTooltipAccessibleLabel(archive, item.archiveLabel);
            renderIcon(
              archive,
              "archive",
              "homepage-studio-task-action-icon"
            );
            scope.registerDomEvent(archive, "click", () => {
              archive.disabled = true;
              void actions.archiveTask(item.target).then((applied) => {
                if (!applied) {
                  archive.disabled = false;
                }
              });
            });
          }
          const remove = rowActions.createEl("button", {
            cls: [
              "homepage-studio-task-icon-button",
              "homepage-studio-task-delete"
            ],
            attr: {
              type: "button"
            }
          });
          attachTooltipAccessibleLabel(remove, item.deleteLabel);
          renderIcon(remove, "x", "homepage-studio-task-action-icon");
          scope.registerDomEvent(edit, "click", () => {
            actions.beginTaskEdit(item.target, item.text);
          });
          scope.registerDomEvent(remove, "click", () => {
            actions.deleteTask(item.target, item.text);
          });
        } else {
          const editInput = body.createEl("input", {
            cls: "homepage-studio-task-edit-input",
            attr: {
              type: "text"
            }
          });
          attachAccessibleLabel(editInput, body, item.editLabel);
          editInput.value = item.editingText;
          const save = rowActions.createEl("button", {
            cls: "homepage-studio-task-text-button",
            text: item.saveLabel,
            attr: { type: "button" }
          });
          const cancel = rowActions.createEl("button", {
            cls: "homepage-studio-task-text-button",
            text: item.cancelLabel,
            attr: { type: "button" }
          });
          scope.registerDomEvent(editInput, "input", () => {
            actions.beginTextInputInteraction();
            actions.updateTaskEditDraft(editInput.value);
          });
          scope.registerDomEvent(editInput, "focus", () => {
            actions.beginTextInputInteraction();
          });
          scope.registerDomEvent(save, "click", () => {
            save.disabled = true;
            void actions.saveTaskEdit().then((applied) => {
              if (applied) {
                actions.endTextInputInteraction();
              } else {
                save.disabled = false;
                editInput.focus({ preventScroll: true });
              }
            });
          });
          scope.registerDomEvent(cancel, "click", () => {
            actions.cancelTaskEdit();
            actions.endTextInputInteraction();
          });
          editInput.focus({ preventScroll: true });
        }
        scope.registerDomEvent(checkbox, "click", () => {
          const completed = checkbox.dataset.checked !== "true";
          checkbox.dataset.checked = completed.toString();
          checkbox.setAttribute("aria-checked", completed.toString());
          row.setAttribute("data-pending", "true");
          checkbox.disabled = true;
          void actions.setTaskCompleted(item.target, completed).then((applied) => {
            row.removeAttribute("data-pending");
            if (!applied) {
              checkbox.dataset.checked = (!completed).toString();
              checkbox.setAttribute("aria-checked", (!completed).toString());
              checkbox.disabled = false;
            }
          });
        });
      }
    }

    if (module.tasks.hasMoreItems) {
      showMore = tasks.createEl("button", {
        cls: "homepage-studio-collection-more",
        text: module.tasks.showMoreLabel,
        attr: { type: "button" }
      });
      scope.registerDomEvent(showMore, "click", () => {
        actions.showMoreTasks();
      });
    }

    const addForm = tasks.createEl("form", {
      cls: "homepage-studio-task-add",
      attr: {
        "data-open": (module.tasks.addDraft !== "").toString()
      }
    });
    const addInput = addForm.createEl("input", {
      cls: "homepage-studio-task-add-input",
      attr: {
        type: "text",
        placeholder: module.tasks.addPlaceholder
      }
    });
    addInput.value = module.tasks.addDraft;
    attachAccessibleLabel(addInput, addForm, module.tasks.addPlaceholder);
    scope.registerDomEvent(addInput, "focus", () => {
      actions.beginTextInputInteraction();
    });
    scope.registerDomEvent(addInput, "input", () => {
      actions.beginTextInputInteraction();
      actions.updateTaskAddDraft(addInput.value);
    });
    const addButton = addForm.createEl("button", {
      cls: "homepage-studio-task-add-button",
      text: module.tasks.addLabel,
      attr: {
        type: "button",
        "aria-expanded": (module.tasks.addDraft !== "").toString()
      }
    });
    const setAddFormOpen = (open: boolean): void => {
      const restoreButtonFocus = !open
        && addInput.ownerDocument.activeElement === addInput;
      addForm.setAttribute("data-open", open.toString());
      addButton.setAttribute("aria-expanded", open.toString());
      if (open) {
        addInput.focus({ preventScroll: true });
      } else {
        addInput.value = "";
        actions.updateTaskAddDraft("");
        actions.endTextInputInteraction(
          restoreButtonFocus ? "task-add" : undefined
        );
      }
    };
    const submitNewTask = (): void => {
      const text = addInput.value.trim();
      if (text === "") {
        return;
      }
      addButton.disabled = true;
      void actions.addTask(text).then((applied) => {
        if (applied) {
          addInput.value = "";
          setAddFormOpen(false);
        }
        addButton.disabled = false;
      });
    };
    scope.registerDomEvent(addButton, "click", () => {
      if (addInput.value.trim() !== "") {
        submitNewTask();
        return;
      }
      if (addForm.getAttribute("data-open") !== "true") {
        setAddFormOpen(true);
        return;
      }
      setAddFormOpen(false);
    });
    scope.registerDomEvent(addForm, "submit", (event) => {
      event.preventDefault();
      if (addInput.value.trim() !== "") {
        submitNewTask();
        return;
      }
      if (addForm.getAttribute("data-open") !== "true") {
        setAddFormOpen(true);
      }
    });
    scope.registerDomEvent(addInput, "keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setAddFormOpen(false);
      }
    });

    if (module.tasks.archiveVisible) {
      const archive = tasks.createEl("section", {
        cls: "homepage-studio-task-archive"
      });
      archiveSection = archive;
      attachAccessibleLabel(archive, archive, module.tasks.archiveListLabel);
      if (module.tasks.archivedItems.length === 0) {
        archive.createEl("p", {
          cls: "homepage-studio-task-empty",
          text: module.tasks.archiveEmptyLabel
        });
      } else {
        archiveList = archive.createEl("ul", {
          cls: [
            "homepage-studio-task-list",
            "homepage-studio-task-archive-list",
            "homepage-studio-task-reorder-list"
          ]
        });
        for (const [itemIndex, item] of module.tasks.archivedItems.entries()) {
          const row = archiveList.createEl("li", {
            cls: [
              "homepage-studio-task",
              "homepage-studio-task-archived"
            ]
          });
          renderIcon(
            row,
            "archive",
            "homepage-studio-task-archive-icon"
          );
          const body = row.createDiv({
            cls: "homepage-studio-task-body"
          });
          registerReorderItem(
            row,
            body,
            item,
            "archive",
            `archive-${itemIndex}`,
            false
          );
          actions.renderMarkdown(
            item.text,
            module.tasks.path,
            body,
            scope
          );
          const restore = row.createEl("button", {
            cls: "homepage-studio-task-icon-button",
            attr: {
              type: "button"
            }
          });
          attachTooltipAccessibleLabel(restore, item.unarchiveLabel);
          renderIcon(
            restore,
            "archive-restore",
            "homepage-studio-task-action-icon"
          );
          scope.registerDomEvent(restore, "click", () => {
            restore.disabled = true;
            void actions.unarchiveTask(item.target).then((applied) => {
              if (!applied) {
                restore.disabled = false;
              }
            });
          });
        }
      }
      if (module.tasks.hasMoreArchivedItems) {
        showMoreArchive = archive.createEl("button", {
          cls: "homepage-studio-collection-more",
          text: module.tasks.showMoreArchiveLabel,
          attr: { type: "button" }
        });
        scope.registerDomEvent(showMoreArchive, "click", () => {
          actions.showMoreArchivedTasks();
        });
      }
    }
    const renderTemporaryActiveTask = (
      item: (typeof taskModel.allItems)[number],
      itemIndex: number
    ): void => {
      if (activeList === null) {
        return;
      }
      const row = activeList.createEl("li", {
        cls: "homepage-studio-task",
        attr: {
          "data-completed": item.completed.toString(),
          "data-editing": "false"
        }
      });
      const checkbox = row.createEl("button", {
        cls: "homepage-studio-task-checkbox",
        attr: {
          type: "button",
          role: "checkbox",
          "aria-checked": item.completed.toString(),
          "data-checked": item.completed.toString(),
          disabled: ""
        }
      });
      attachTooltipAccessibleLabel(checkbox, item.checkboxLabel);
      const body = row.createDiv({
        cls: "homepage-studio-task-body"
      });
      registerReorderItem(
        row,
        body,
        item,
        activeScope(item.completed),
        `active-${itemIndex}`,
        true
      );
      const content = body.createDiv({
        cls: "homepage-studio-task-content"
      });
      actions.renderMarkdown(item.text, taskModel.path, content, scope);
      if (item.recurrenceLabel !== null) {
        body.createSpan({
          cls: "homepage-studio-task-recurrence",
          text: item.recurrenceLabel,
          attr: { "aria-hidden": "true" }
        });
      }
    };
    const renderTemporaryArchivedTask = (
      item: (typeof taskModel.allArchivedItems)[number],
      itemIndex: number
    ): void => {
      if (archiveList === null) {
        return;
      }
      const row = archiveList.createEl("li", {
        cls: [
          "homepage-studio-task",
          "homepage-studio-task-archived"
        ]
      });
      renderIcon(row, "archive", "homepage-studio-task-archive-icon");
      const body = row.createDiv({
        cls: "homepage-studio-task-body"
      });
      registerReorderItem(
        row,
        body,
        item,
        "archive",
        `archive-${itemIndex}`,
        true
      );
      actions.renderMarkdown(item.text, taskModel.path, body, scope);
    };
    const revealHiddenTasks = (itemScope: TaskReorderScope): void => {
      if (itemScope === "archive") {
        showMoreArchive?.remove();
        const renderedKeys = new Set([
          ...archiveList?.querySelectorAll<HTMLElement>(
            "[data-task-reorder-key]"
          ) ?? []
        ].map((row) => row.dataset.taskReorderKey));
        for (const [itemIndex, item] of taskModel.allArchivedItems.entries()) {
          const key = `archive-${itemIndex}`;
          if (!renderedKeys.has(key)) {
            renderTemporaryArchivedTask(item, itemIndex);
          }
        }
        return;
      }
      showMore?.remove();
      const renderedKeys = new Set([
        ...activeList?.querySelectorAll<HTMLElement>(
          "[data-task-reorder-key]"
        ) ?? []
      ].map((row) => row.dataset.taskReorderKey));
      for (const [itemIndex, item] of taskModel.allItems.entries()) {
        if (
          activeScope(item.completed) === itemScope
          && !renderedKeys.has(`active-${itemIndex}`)
        ) {
          renderTemporaryActiveTask(item, itemIndex);
        }
      }
    };
    const restoreVisibleTasks = (): void => {
      for (const temporary of tasks.querySelectorAll<HTMLElement>(
        '[data-task-reorder-temporary="true"]'
      )) {
        reorderItems.delete(temporary);
        temporary.remove();
      }
      if (showMore !== null && !showMore.isConnected) {
        tasks.insertBefore(showMore, addForm);
      }
      if (
        showMoreArchive !== null
        && !showMoreArchive.isConnected
        && archiveSection !== null
      ) {
        archiveSection.appendChild(showMoreArchive);
      }
    };
    attachTaskReorderController({
      container: tasks,
      scrollContainer: tasks.closest<HTMLElement>(".homepage-studio")
        ?? tasks,
      scope,
      enabled: taskModel.reorderEnabled,
      resolveItem: (element) => reorderItems.get(element) ?? null,
      move: (request) => actions.reorderTask(request),
      onPickup: (itemScope, cancel) => {
        actions.beginTaskDrag(taskModel.sourceRevision, cancel);
        revealHiddenTasks(itemScope);
      },
      onCommit: () => {
        actions.commitTaskDrag();
      },
      onFinish: () => {
        restoreVisibleTasks();
        actions.endTaskDrag();
      },
      formatMovedAnnouncement: (task, position) =>
        taskModel.moveAnnouncement
          .replace("{task}", task)
          .replace("{position}", position.toString()),
      onApplied: (announcement) => {
        reorderLive.setText(announcement);
        actions.announceTaskMove(announcement);
      },
      onRejected: () => undefined
    });
    return;
  }

  if (module.state === "ready" && module.fileGroups !== undefined) {
    const fileGroupModel = module.fileGroups;
    const fileGroups = section.createDiv({
      cls: "homepage-studio-file-groups"
    });
    attachAccessibleLabel(
      fileGroups,
      fileGroups,
      fileGroupModel.listLabel
    );
    const reorderLive = fileGroups.createDiv({
      cls: "homepage-studio-file-entry-reorder-live",
      attr: {
        role: "status",
        "aria-live": "polite"
      }
    });
    const groupLists = new Map<string, HTMLElement>();
    const renderFileEntry = (
      list: HTMLElement,
      entry: FileGroupEntryViewModel,
      entryIndex: number,
      temporary: boolean
    ): void => {
      const item = list.createEl("li", {
        cls: "homepage-studio-file-group-item homepage-studio-file-entry-reorder-item",
        attr: {
          "data-file-entry-id": entry.id,
          "data-file-entry-path": entry.path,
          "data-file-entry-state": entry.state,
          ...(temporary ? { "data-file-entry-temporary": "true" } : {})
        }
      });
      const reorderDescriptionId = [
        "homepage-studio-homepage-file-entry-reorder-description",
        entry.id
      ].join("-");
      item.createSpan({
        cls: "homepage-studio-file-entry-reorder-description",
        text: fileGroupModel.reorderEntryDescription.replace(
          "{path}",
          entry.path
        ),
        attr: { id: reorderDescriptionId }
      });
      const open = item.createEl("button", {
        cls: "homepage-studio-file-group-entry homepage-studio-file-entry-reorder-surface",
        attr: {
          type: "button",
          "data-state": entry.state,
          "aria-keyshortcuts": [
            "Alt+ArrowUp",
            "Alt+ArrowDown",
            "Alt+ArrowLeft",
            "Alt+ArrowRight",
            "Alt+Home",
            "Alt+End"
          ].join(" "),
          "aria-describedby": reorderDescriptionId,
          ...(theme === "archive-observatory" && entry.parentLabel !== null
            ? { "data-has-parent": "true" }
            : {})
        }
      });
      const primary = theme === "archive-observatory"
        ? open.createSpan({
          cls: "homepage-studio-file-group-entry-primary"
        })
        : open;
      if (theme === "archive-observatory") {
        primary.createSpan({
          cls: "homepage-studio-file-group-entry-index",
          text: `${String(entryIndex + 1).padStart(2, "0")}.`,
          attr: {
            "aria-hidden": "true"
          }
        });
      }
      primary.createSpan({
        cls: "homepage-studio-file-group-entry-name",
        text: entry.fileName
      });
      if (entry.parentLabel !== null) {
        open.createSpan({
          cls: "homepage-studio-file-group-entry-parent",
          text: entry.parentLabel,
          attr: {
            "aria-hidden": "true"
          }
        });
      }
      if (entry.statusLabel !== null) {
        open.createSpan({
          cls: "homepage-studio-file-group-entry-status",
          text: entry.statusLabel
        });
      }
      attachAccessibleLabel(
        open,
        item,
        entry.accessibleLabel
      );
    };
    const renderFileGroup = (
      group: FileGroupModuleViewModel["groups"][number],
      groupIndex: number,
      temporary: boolean
    ): HTMLElement => {
      const groupSection = fileGroups.createEl("section", {
        cls: "homepage-studio-file-group",
        attr: {
          "data-file-group-id": group.id,
          "data-file-group-name": group.name,
          ...(temporary ? { "data-file-group-temporary": "true" } : {})
        }
      });
      const groupTitle = groupSection.createEl("h3", {
        cls: "homepage-studio-file-group-title"
      });
      if (theme !== "archive-observatory") {
        groupTitle.createSpan({
          cls: "homepage-studio-file-group-title-marker",
          attr: {
            "aria-hidden": "true"
          }
        });
        groupTitle.createSpan({
          cls: "homepage-studio-file-group-title-index",
          text: theme === "cosmic-cartography"
            ? formatAlphabeticIndex(groupIndex)
            : `${String(groupIndex + 1).padStart(2, "0")} /`,
          attr: {
            "aria-hidden": "true",
            "data-file-group-index": theme === "cosmic-cartography"
              ? formatAlphabeticIndex(groupIndex)
              : String(groupIndex + 1).padStart(2, "0")
          }
        });
      }
      groupTitle.createSpan({
        cls: "homepage-studio-file-group-title-name",
        text: group.name
      });
      if (group.entries.length === 0) {
        groupSection.createEl("p", {
          cls: "homepage-studio-file-group-empty",
          text: fileGroupModel.emptyGroupLabel
        });
      }
      const list = groupSection.createEl("ul", {
        cls: "homepage-studio-file-group-list homepage-studio-file-entry-reorder-list"
      });
      groupLists.set(group.id, list);
      for (const [entryIndex, entry] of group.entries.entries()) {
        renderFileEntry(list, entry, entryIndex, temporary);
      }
      return list;
    };
    for (const [groupIndex, group] of fileGroupModel.groups.entries()) {
      renderFileGroup(group, groupIndex, false);
    }
    let showMore: HTMLButtonElement | null = null;
    if (fileGroupModel.hasMoreEntries) {
      showMore = fileGroups.createEl("button", {
        cls: "homepage-studio-collection-more",
        text: fileGroupModel.showMoreLabel,
        attr: { type: "button" }
      });
      scope.registerDomEvent(showMore, "click", () => {
        actions.showMoreFileGroupEntries();
      });
    }
    const revealHiddenEntries = (): void => {
      const expandedModel = actions.getAllFileGroups();
      if (expandedModel === null) {
        return;
      }
      showMore?.remove();
      for (const [groupIndex, group] of expandedModel.groups.entries()) {
        const list = groupLists.get(group.id)
          ?? renderFileGroup(group, groupIndex, true);
        const renderedEntryIds = new Set([
          ...list.querySelectorAll<HTMLElement>("[data-file-entry-id]")
        ].map((entry) => entry.dataset.fileEntryId));
        for (const [entryIndex, entry] of group.entries.entries()) {
          if (!renderedEntryIds.has(entry.id)) {
            renderFileEntry(list, entry, entryIndex, true);
          }
        }
      }
    };
    const restoreVisibleEntries = (): void => {
      for (const temporary of fileGroups.querySelectorAll(
        '[data-file-entry-temporary="true"]'
      )) {
        temporary.remove();
      }
      for (const temporaryGroup of fileGroups.querySelectorAll(
        '[data-file-group-temporary="true"]'
      )) {
        temporaryGroup.remove();
      }
      if (showMore !== null && !showMore.isConnected) {
        fileGroups.appendChild(showMore);
      }
    };
    attachFileEntryReorderController({
      container: fileGroups,
      scrollContainer: fileGroups.closest<HTMLElement>(".homepage-studio")
        ?? fileGroups,
      scope,
      enabled: true,
      move: (request, announcement) =>
        actions.moveFileGroupEntry(request, announcement),
      open: (path, newPane) => {
        actions.openFile(path, newPane);
      },
      onPickup: () => {
        actions.beginFileGroupEntryDrag();
        revealHiddenEntries();
      },
      onFinish: () => {
        restoreVisibleEntries();
        actions.endFileGroupEntryDrag();
      },
      onUnavailableOpen: (path) => {
        reorderLive.setText(
          fileGroupModel.unavailableEntryLabel.replace("{path}", path)
        );
      },
      formatMovedAnnouncement: (path, groupName, position) =>
        fileGroupModel.moveEntryAnnouncement
          .replace("{path}", path)
          .replace("{group}", groupName)
          .replace("{position}", position.toString()),
      onApplied: () => undefined,
      onRejected: (result) => {
        reorderLive.setText(result.type === "duplicate-path"
          ? fileGroupModel.duplicateEntryLabel
          : result.type === "not-found"
            ? fileGroupModel.missingEntryLabel
            : result.type === "blocked"
              ? fileGroupModel.unavailableLabel
              : "");
      }
    });
    return;
  }

  if (theme === "archive-observatory" && module.id === "current-plan") {
    renderArchivePlanUnavailable(section, module, actions, scope);
    return;
  }

  const emptyState = section.createDiv({
    cls: "homepage-studio-empty-state"
  });
  renderIcon(
    emptyState,
    module.emptyState.icon,
    "homepage-studio-empty-state-icon"
  );
  emptyState.createEl("h3", {
    cls: "homepage-studio-empty-state-title",
    text: module.emptyState.title
  });
  emptyState.createEl("p", {
    cls: "homepage-studio-empty-state-description",
    text: module.emptyState.description
  });
  const action = emptyState.createEl("button", {
    cls: "homepage-studio-empty-action",
    text: module.emptyState.actionLabel,
    attr: {
      type: "button"
    }
  });
  scope.registerDomEvent(action, "click", () => {
    actions.openSettings(module.emptyState.settingsSection);
  });
};

export const refreshHomepageTemporalContent = (
  container: HTMLElement,
  viewModel: HomepageShellViewModel
): void => {
  const temporal = viewModel.banner.temporal;
  if (temporal !== null) {
    container.querySelector<HTMLElement>(
      ".homepage-studio-coordinate"
    )?.setText(viewModel.theme === "minimal-paper"
      ? `${temporal.coordinateLabel} · ${temporal.timeLabel}`
      : temporal.coordinateLabel);
    const bannerDate = container.querySelector<HTMLElement>(
      ".homepage-studio-banner-date"
    );
    bannerDate?.setText(viewModel.theme === "archive-observatory"
      ? temporal.coordinateLabel
      : temporal.dateLabel);
    bannerDate?.setAttribute("datetime", temporal.dateKey);
    container.querySelector<HTMLElement>(
      ".homepage-studio-banner-weekday"
    )?.setText(temporal.weekdayLabel);
    container.querySelector<HTMLElement>(
      ".homepage-studio-banner-time"
    )?.setText(temporal.timeLabel);
  }
  const archiveMeta = container.querySelector<HTMLElement>(
    ".homepage-studio-archive-banner-meta-line"
  );
  archiveMeta?.setText(viewModel.archiveBannerMetaLabel ?? "");
  container.querySelector<HTMLElement>(
    ".homepage-studio-archive-footer-text"
  )?.setText(viewModel.archiveFooterLabel ?? "");

  const planModule = viewModel.modules.find(
    (module) => module.id === "current-plan"
  );
  const planSection = container.querySelector<HTMLElement>(
    '.homepage-studio-module[data-module="current-plan"]'
  );
  if (
    planModule?.state !== "ready"
    || planModule.plan === undefined
    || planSection === null
  ) {
    return;
  }
  const scheduleWasOpen = planSection.querySelector<HTMLDetailsElement>(
    ".homepage-studio-plan-schedule"
  )?.open ?? false;
  const header = planSection.querySelector<HTMLElement>(
    ":scope > .homepage-studio-module-header"
  );
  for (const child of [...planSection.children]) {
    if (child !== header) {
      child.remove();
    }
  }
  planSection.setAttribute("data-state", planModule.state);
  header?.querySelector<HTMLElement>(
    ".homepage-studio-archive-plan-template"
  )?.setText(planModule.plan.templateLabel);
  renderPlanContent(planSection, planModule.plan, viewModel.theme);
  const schedule = planSection.querySelector<HTMLDetailsElement>(
    ".homepage-studio-plan-schedule"
  );
  if (schedule !== null) {
    schedule.open = scheduleWasOpen;
  }
};

export const renderHomepageShell = (
  container: HTMLElement,
  viewModel: HomepageShellViewModel,
  actions: HomepageShellActions,
  scope: Component
): void => {
  const bannerImageState = bannerImageStates.get(container) ?? {
    sourceKey: null,
    image: null,
    loaded: false
  };
  bannerImageStates.set(container, bannerImageState);
  if (viewModel.banner.image === null) {
    clearBannerImageRenderState(bannerImageState);
  }
  const shell = container.createDiv({
    cls: "homepage-studio-shell"
  });
  const shellDocument = shell.ownerDocument;
  const shellWindow = shellDocument.defaultView;
  let shellIntersectsViewport = true;
  const syncMotionVisibility = (): void => {
    const pageVisible = shellDocument.visibilityState === "visible"
      && shellIntersectsViewport;
    container.setAttribute("data-page-visible", pageVisible.toString());
    container.setAttribute(
      "data-cosmic-page-visible",
      pageVisible.toString()
    );
    shell.setAttribute("data-page-visible", pageVisible.toString());
    shell.setAttribute(
      "data-cosmic-page-visible",
      pageVisible.toString()
    );
    shell.querySelector(".homepage-studio-banner")?.setAttribute(
      "data-page-visible",
      pageVisible.toString()
    );
  };
  syncMotionVisibility();
  scope.registerDomEvent(
    shellDocument,
    "visibilitychange",
    syncMotionVisibility
  );
  if (shellWindow?.IntersectionObserver !== undefined) {
    const observer = new shellWindow.IntersectionObserver((entries) => {
      const entry = entries[0];
      shellIntersectsViewport = entry?.isIntersecting ?? false;
      syncMotionVisibility();
    });
    observer.observe(shell);
    scope.register(() => {
      observer.disconnect();
    });
  }
  if (viewModel.theme === "cosmic-cartography") {
    const backgroundArt = shell.createDiv({
      cls: "homepage-studio-cosmic-background",
      attr: {
        "aria-hidden": "true"
      }
    });
    renderCosmicBackgroundArt(backgroundArt);
  }
  const masthead = shell.createEl("header", {
    cls: "homepage-studio-masthead"
  });
  const identity = masthead.createDiv({
    cls: "homepage-studio-identity"
  });
  identity.createSpan({
    cls: "homepage-studio-klein-mark",
    attr: {
      "aria-hidden": "true"
    }
  });
  const identityCopy = identity.createDiv({
    cls: "homepage-studio-identity-copy"
  });
  identityCopy.createEl("h1", {
    cls: "homepage-studio-title",
    text: viewModel.title
  });
  identityCopy.createSpan({
    cls: "homepage-studio-control-label",
    text: viewModel.controlLabel,
    attr: {
      "aria-hidden": "true"
    }
  });

  const mastheadControls = masthead.createDiv({
    cls: "homepage-studio-masthead-controls"
  });
  if (viewModel.banner.temporal !== null) {
    mastheadControls.createSpan({
      cls: "homepage-studio-coordinate",
      text: viewModel.theme === "minimal-paper"
        ? `${viewModel.banner.temporal.coordinateLabel} · ${viewModel.banner.temporal.timeLabel}`
        : viewModel.banner.temporal.coordinateLabel,
      attr: {
        "aria-hidden": "true"
      }
    });
  }
  const settingsButton = mastheadControls.createEl("button", {
    cls: "homepage-studio-settings-button clickable-icon",
    attr: {
      type: "button"
    }
  });
  attachTooltipAccessibleLabel(settingsButton, viewModel.settingsLabel);
  renderIcon(
    settingsButton,
    "settings",
    "homepage-studio-settings-icon"
  );
  scope.registerDomEvent(settingsButton, "click", () => {
    actions.openSettings();
  });

  if (viewModel.banner.visible) {
    const banner = shell.createDiv({
      cls: "homepage-studio-banner",
      attr: {
        "data-height": viewModel.banner.height,
        "data-image-state": "default",
        ...(viewModel.theme === "archive-observatory"
          ? {
            "data-archive-art": viewModel.banner.image === null
              ? "default"
              : "custom"
          }
          : {})
      }
    });
    banner.style.setProperty(
      "--homepage-banner-focus-x",
      `${viewModel.banner.focalPoint.x}%`
    );
    banner.style.setProperty(
      "--homepage-banner-focus-y",
      `${viewModel.banner.focalPoint.y}%`
    );
    const bannerArt = banner.createDiv({
      cls: "homepage-studio-banner-art",
      attr: {
        "aria-hidden": "true"
      }
    });
    bannerArt.createDiv({
      cls: "homepage-studio-banner-architecture"
    });
    if (viewModel.theme === "celestial-orbit") {
      renderCelestialBannerArt(bannerArt);
    } else if (viewModel.theme === "archive-observatory") {
      renderArchiveBannerArt(bannerArt);
      const bannerMeta = banner.createDiv({
        cls: "homepage-studio-archive-banner-meta",
        attr: {
          "aria-hidden": "true"
        }
      });
      bannerMeta.createSpan({
        cls: "homepage-studio-archive-banner-meta-line",
        text: viewModel.archiveBannerMetaLabel ?? ""
      });
      bannerMeta.createSpan({
        cls: "homepage-studio-archive-banner-meta-line",
        text: viewModel.archiveBannerStatusLabel ?? ""
      });
      banner.createDiv({
        cls: "homepage-studio-archive-banner-circle",
        attr: {
          "aria-hidden": "true"
        }
      });
    } else if (viewModel.theme === "cosmic-cartography") {
      renderCosmicBannerArt(bannerArt);
      shell.setAttribute("data-cosmic-window-focused", "true");
      if (shellWindow !== null) {
        scope.registerDomEvent(shellWindow, "blur", () => {
          shell.setAttribute("data-cosmic-window-focused", "false");
        });
        scope.registerDomEvent(shellWindow, "focus", () => {
          shell.setAttribute("data-cosmic-window-focused", "true");
        });
      }
    }
    if (viewModel.banner.image !== null) {
      renderBannerImage(
        banner,
        viewModel.banner.image,
        scope,
        bannerImageState
      );
    }
    const bannerContent = banner.createDiv({
      cls: "homepage-studio-banner-content"
    });
    if (
      viewModel.banner.title !== ""
      || viewModel.banner.subtitle !== ""
    ) {
      const bannerTitleGroup = bannerContent.createDiv({
        cls: "homepage-studio-banner-title-group"
      });
      if (viewModel.banner.title !== "") {
        bannerTitleGroup.createEl("p", {
          cls: "homepage-studio-banner-title",
          text: viewModel.banner.title
        });
      }
      if (viewModel.theme === "archive-observatory") {
        bannerTitleGroup.createDiv({
          cls: "homepage-studio-archive-banner-line",
          attr: {
            "aria-hidden": "true"
          }
        });
      }
      if (viewModel.banner.subtitle !== "") {
        bannerTitleGroup.createSpan({
          cls: "homepage-studio-banner-subtitle",
          text: viewModel.banner.subtitle,
          attr: {
            "aria-hidden": "true"
          }
        });
      }
    }
    if (viewModel.banner.temporal !== null) {
      const temporal = bannerContent.createDiv({
        cls: "homepage-studio-banner-temporal"
      });
      temporal.createEl("time", {
        cls: "homepage-studio-banner-date",
        text: viewModel.theme === "archive-observatory"
          ? viewModel.banner.temporal.coordinateLabel
          : viewModel.banner.temporal.dateLabel,
        attr: {
          datetime: viewModel.banner.temporal.dateKey
        }
      });
      temporal.createSpan({
        cls: "homepage-studio-banner-weekday",
        text: viewModel.banner.temporal.weekdayLabel
      });
      temporal.createSpan({
        cls: "homepage-studio-banner-time",
        text: viewModel.banner.temporal.timeLabel
      });
    }
    syncMotionVisibility();
  }

  const modules = shell.createDiv({
    cls: "homepage-studio-modules",
    attr: {
      role: "region"
    }
  });
  if (viewModel.theme === "archive-observatory") {
    const backgroundArt = modules.createDiv({
      cls: "homepage-studio-archive-background-art",
      attr: {
        "aria-hidden": "true"
      }
    });
    renderArchiveBackgroundArt(backgroundArt);
    modules.prepend(backgroundArt);
  }
  attachAccessibleLabel(modules, modules, viewModel.modulesLabel);
  for (const module of viewModel.modules) {
    renderModule(
      modules,
      module,
      actions,
      scope,
      viewModel.theme,
      container
    );
  }
  if (viewModel.theme === "cosmic-cartography") {
    const bottomArt = shell.createDiv({
      cls: "homepage-studio-cosmic-bottom-art",
      attr: {
        "aria-hidden": "true"
      }
    });
    renderCosmicBottomArt(bottomArt);
  }
  if (viewModel.theme === "archive-observatory") {
    const footer = shell.createEl("footer", {
      cls: "homepage-studio-archive-footer",
      attr: {
        "aria-hidden": "true"
      }
    });
    footer.createSpan({
      cls: "homepage-studio-archive-footer-text",
      text: viewModel.archiveFooterLabel ?? ""
    });
    footer.createSpan({
      cls: "homepage-studio-archive-footer-circle"
    });
    footer.createSpan({
      cls: "homepage-studio-archive-footer-coordinate",
      text: viewModel.archiveFooterCoordinate ?? ""
    });
  }
  container.createDiv({
    cls: "homepage-studio-scroll-spacer",
    attr: {
      "aria-hidden": "true"
    }
  });
};
