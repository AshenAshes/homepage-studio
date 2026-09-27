import type {
  Layout,
  LayoutRow,
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
  return migrateLayout({ ...layout, moduleOrder: [...layout.moduleOrder],
    hiddenModules: [...layout.hiddenModules], sizes: { ...layout.sizes } }, theme);
};

export const getLayout = (
  layouts: PluginData["layouts"],
  theme: ThemeId
): Layout => {
  const defaults = getDefaultLayout(theme);
  const stored = layouts[theme];
  return stored === undefined ? defaults : stored.board === undefined
    ? migrateLayout({ ...stored, sizes: { ...DEFAULT_LAYOUTS[theme].sizes, ...stored.sizes } }, theme)
    : { ...structuredClone(stored), bannerVisible: theme === "minimal-paper" ? false : stored.bannerVisible };

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

export const WIDTH_UNITS: Readonly<Record<ModuleSize, number>> = { compact: 5, standard: 7, expanded: 12 };

type MutableRow = { columns: { size: ModuleSize; modules: ModuleId[] }[] };
const copyRows = (layout: Layout): MutableRow[] => layout.board?.rows.map((row) => ({
  columns: row.columns.map((column) => ({ size: column.size, modules: [...column.modules] }))
})) ?? [];

const withRows = (layout: Layout, rows: MutableRow[]): Layout => {
  const clean = rows.map((row) => ({ columns: row.columns.filter((column) => column.modules.length > 0) }))
    .filter((row) => row.columns.length > 0);
  const sizes = { ...layout.sizes };
  for (const row of clean) for (const column of row.columns) for (const module of column.modules) sizes[module] = column.size;
  return { ...layout, moduleOrder: clean.flatMap((row) => row.columns.flatMap((column) => column.modules)),
    sizes, board: { version: 1, rows: clean } };
};

/** Converts legacy effective widths once; old size labels had theme-specific meanings. */
export const migrateLayout = (layout: Layout, theme: ThemeId): Layout => {
  if (layout.board !== undefined) return structuredClone(layout);
  const sizes: Partial<Record<ModuleId, ModuleSize>> = {};
  const oldWidth = (module: ModuleId): number => {
    const size = layout.sizes[module] ?? "standard";
    if (theme === "archive-observatory") return module === "journal" ? 7 : module === "current-plan" ? 5 : 12;
    if ((theme === "watercolor-journal" || theme === "celestial-orbit") && module === "file-groups") return 12;
    if (theme === "cosmic-cartography" && module === "heatmap") return 12;
    if (size === "expanded" && ((theme === "klein-blue" && module === "file-groups")
      || (theme === "minimal-paper" && (module === "heatmap" || module === "file-groups")))) return 12;
    return size === "compact" ? 5 : size === "standard" ? 6 : 7;
  };
  for (const module of layout.moduleOrder) sizes[module] = oldWidth(module) === 12 ? "expanded" : oldWidth(module) === 5 ? "compact" : "standard";
  for (let i = 0; i < layout.moduleOrder.length - 1; i++) {
    const first = layout.moduleOrder[i]; const second = layout.moduleOrder[i + 1];
    if (first && second && oldWidth(first) === 6 && oldWidth(second) === 6) {
      sizes[first] = "compact"; sizes[second] = "standard"; i++;
    }
  }
  const rows: MutableRow[] = [];
  for (const module of layout.moduleOrder) {
    const size = sizes[module] ?? "standard";
    const last = rows[rows.length - 1];
    // Preserve the old paper composition as ordinary stacks, not a module-specific CSS rule.
    const paperStack = theme === "minimal-paper" && layout.sizes.journal === "expanded"
      && last?.columns.some((column) => column.modules.includes("journal"))
      && size === "compact" && last.columns.length === 2;
    if (paperStack && last) {
      last.columns.find((column) => column.size === "compact")?.modules.push(module);
    } else if (last && last.columns.reduce((sum, column) => sum + WIDTH_UNITS[column.size], 0) + WIDTH_UNITS[size] <= 12) {
      last.columns.push({ size, modules: [module] });
    } else rows.push({ columns: [{ size, modules: [module] }] });
  }
  return withRows({ ...layout, bannerVisible: theme === "minimal-paper" ? false : layout.bannerVisible }, rows);
};

export const visibleLayoutRows = (layout: Layout): readonly LayoutRow[] => (layout.board?.rows ?? [])
  .map((row) => ({ columns: row.columns.map((column) => ({ ...column,
    modules: column.modules.filter((module) => !layout.hiddenModules.includes(module)) })) }))
  .filter((row) => row.columns.some((column) => column.modules.length > 0));

export const setModuleSize = (layout: Layout, module: ModuleId, size: ModuleSize): Layout => {
  const rows = copyRows(layout);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]; if (!row) continue;
    const column = row.columns.find((item) => item.modules.includes(module));
    if (!column) continue;
    column.size = size;
    if (row.columns.reduce((sum, item) => sum + WIDTH_UNITS[item.size], 0) > 12) {
      row.columns = row.columns.filter((item) => item !== column);
      rows.splice(i + 1, 0, { columns: [column] });
    }
    break;
  }
  return withRows(layout, rows);
};

export type LayoutPlacement = "above" | "below" | "left" | "right" | "row-before" | "row-after";
export const placeLayoutModule = (layout: Layout, module: ModuleId, target: ModuleId | null, placement: LayoutPlacement): Layout | null => {
  if (module === target) return null;
  const rows = copyRows(layout);
  for (const row of rows) for (const column of row.columns) column.modules = column.modules.filter((item) => item !== module);
  const moved = { ...layout, hiddenModules: layout.hiddenModules.filter((item) => item !== module) };
  const ownSize = layout.sizes[module] ?? "standard";
  if (target === null) {
    const row = { columns: [{ size: ownSize, modules: [module] }] };
    if (placement === "row-before") rows.unshift(row); else rows.push(row);
    return withRows(moved, rows);
  }
  const rowIndex = rows.findIndex((row) => row.columns.some((column) => column.modules.includes(target)));
  const row = rows[rowIndex]; if (!row) return null;
  const columnIndex = row.columns.findIndex((column) => column.modules.includes(target));
  const column = row.columns[columnIndex]; if (!column) return null;
  if (placement === "above" || placement === "below") {
    column.modules.splice(column.modules.indexOf(target) + (placement === "below" ? 1 : 0), 0, module);
  } else if (placement === "row-before" || placement === "row-after") {
    rows.splice(rowIndex + (placement === "row-after" ? 1 : 0), 0, { columns: [{ size: ownSize, modules: [module] }] });
  } else {
    row.columns = row.columns.filter((item) => item.modules.length > 0);
    if (row.columns.reduce((sum, item) => sum + WIDTH_UNITS[item.size], 0) + WIDTH_UNITS[ownSize] > 12) return null;
    row.columns.splice(row.columns.indexOf(column) + (placement === "right" ? 1 : 0), 0, { size: ownSize, modules: [module] });
  }
  return withRows(moved, rows);
};

export const moveModule = (layout: Layout, module: ModuleId, offset: -1 | 1): Layout | null => {
  const index = layout.moduleOrder.indexOf(module); const adjacent = layout.moduleOrder[index + offset];
  if (!adjacent) return null;
  const rows = copyRows(layout);
  for (const row of rows) for (const column of row.columns) column.modules = column.modules.map((item) =>
    item === module ? adjacent : item === adjacent ? module : item);
  return withRows(layout, rows);
};
