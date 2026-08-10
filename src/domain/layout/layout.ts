import type {
  Layout,
  ModuleId,
  ModuleSize,
  PluginData,
  ThemeId
} from "../data/types";

export const HOMEPAGE_MODULE_IDS: readonly ModuleId[] = [
  "heatmap",
  "current-plan",
  "journal",
  "tasks",
  "file-groups"
];

const DEFAULT_MODULE_SIZES: Readonly<Record<ModuleId, ModuleSize>> = {
  heatmap: "expanded",
  "current-plan": "compact",
  journal: "expanded",
  tasks: "compact",
  "file-groups": "expanded"
};

const WATERCOLOR_MODULE_ORDER: readonly ModuleId[] = [
  "heatmap",
  "current-plan",
  "journal",
  "tasks",
  "file-groups"
];

const CELESTIAL_MODULE_ORDER: readonly ModuleId[] = [
  "current-plan",
  "heatmap",
  "journal",
  "tasks",
  "file-groups"
];

const CELESTIAL_MODULE_SIZES: Readonly<Record<ModuleId, ModuleSize>> = {
  heatmap: "expanded",
  "current-plan": "compact",
  journal: "expanded",
  tasks: "compact",
  "file-groups": "expanded"
};

const MINIMAL_PAPER_MODULE_ORDER: readonly ModuleId[] = [
  "heatmap",
  "journal",
  "current-plan",
  "tasks",
  "file-groups"
];

const MINIMAL_PAPER_MODULE_SIZES: Readonly<Record<ModuleId, ModuleSize>> = {
  heatmap: "expanded",
  journal: "expanded",
  "current-plan": "compact",
  tasks: "compact",
  "file-groups": "expanded"
};

const ARCHIVE_OBSERVATORY_MODULE_ORDER: readonly ModuleId[] = [
  "heatmap",
  "journal",
  "current-plan",
  "tasks",
  "file-groups"
];

const ARCHIVE_OBSERVATORY_MODULE_SIZES: Readonly<Record<ModuleId, ModuleSize>> = {
  heatmap: "expanded",
  journal: "expanded",
  "current-plan": "compact",
  tasks: "expanded",
  "file-groups": "expanded"
};

/**
 * The Cosmic Cartography board follows demo6's editorial reading order:
 * schedule + journal, then the full-width activity map, followed by tasks
 * and file constellations.  It deliberately has its own descriptor so a
 * theme switch never mutates another theme's saved layout.
 */
const COSMIC_CARTOGRAPHY_MODULE_ORDER: readonly ModuleId[] = [
  "current-plan",
  "journal",
  "heatmap",
  "tasks",
  "file-groups"
];

const COSMIC_CARTOGRAPHY_MODULE_SIZES: Readonly<Record<ModuleId, ModuleSize>> = {
  heatmap: "expanded",
  "current-plan": "compact",
  journal: "expanded",
  tasks: "compact",
  "file-groups": "expanded"
};

const createDefaultLayout = (
  moduleOrder: readonly ModuleId[],
  bannerVisible = true,
  sizes: Readonly<Record<ModuleId, ModuleSize>> = DEFAULT_MODULE_SIZES
): Layout => ({
  moduleOrder: [...moduleOrder],
  hiddenModules: [],
  sizes: { ...sizes },
  bannerVisible
});

const DEFAULT_LAYOUTS: Readonly<Record<ThemeId, Layout>> = {
  "klein-blue": createDefaultLayout(HOMEPAGE_MODULE_IDS),
  "watercolor-journal": createDefaultLayout(WATERCOLOR_MODULE_ORDER),
  "celestial-orbit": createDefaultLayout(
    CELESTIAL_MODULE_ORDER,
    true,
    CELESTIAL_MODULE_SIZES
  ),
  "minimal-paper": createDefaultLayout(
    MINIMAL_PAPER_MODULE_ORDER,
    false,
    MINIMAL_PAPER_MODULE_SIZES
  ),
  "archive-observatory": createDefaultLayout(
    ARCHIVE_OBSERVATORY_MODULE_ORDER,
    true,
    ARCHIVE_OBSERVATORY_MODULE_SIZES
  ),
  "cosmic-cartography": createDefaultLayout(
    COSMIC_CARTOGRAPHY_MODULE_ORDER,
    true,
    COSMIC_CARTOGRAPHY_MODULE_SIZES
  )
};

export const getDefaultLayout = (theme: ThemeId): Layout => {
  const layout = DEFAULT_LAYOUTS[theme];
  return {
    ...layout,
    moduleOrder: [...layout.moduleOrder],
    hiddenModules: [...layout.hiddenModules],
    sizes: { ...layout.sizes }
  };
};

export const getLayout = (
  layouts: PluginData["layouts"],
  theme: ThemeId
): Layout => {
  const defaults = getDefaultLayout(theme);
  const stored = layouts[theme];
  return stored === undefined
    ? defaults
    : {
      ...stored,
      bannerVisible: theme === "minimal-paper"
        ? false
        : stored.bannerVisible,
      sizes: {
        ...defaults.sizes,
        ...stored.sizes
      }
    };
};

export const setModuleVisibility = (
  layout: Layout,
  module: ModuleId,
  visible: boolean
): Layout => {
  const hiddenModules = visible
    ? layout.hiddenModules.filter((candidate) => candidate !== module)
    : layout.hiddenModules.includes(module)
      ? [...layout.hiddenModules]
      : [...layout.hiddenModules, module];
  return {
    ...layout,
    hiddenModules
  };
};

export const setModuleSize = (
  layout: Layout,
  module: ModuleId,
  size: ModuleSize
): Layout => ({
  ...layout,
  sizes: {
    ...layout.sizes,
    [module]: size
  }
});

export const moveModule = (
  layout: Layout,
  module: ModuleId,
  offset: -1 | 1
): Layout | null => {
  const index = layout.moduleOrder.indexOf(module);
  const target = index + offset;
  if (
    index < 0
    || target < 0
    || target >= layout.moduleOrder.length
  ) {
    return null;
  }
  const moduleOrder = [...layout.moduleOrder];
  const adjacent = moduleOrder[target];
  if (adjacent === undefined) {
    return null;
  }
  moduleOrder[index] = adjacent;
  moduleOrder[target] = module;
  return {
    ...layout,
    moduleOrder
  };
};
