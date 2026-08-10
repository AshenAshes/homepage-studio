export interface ShapeValidationError {
  readonly path: string;
  readonly message: string;
}

type JsonRecord = Record<string, unknown>;

const THEMES = new Set([
  "klein-blue",
  "watercolor-journal",
  "celestial-orbit",
  "minimal-paper",
  "archive-observatory",
  "cosmic-cartography"
]);
const MODULES = new Set([
  "heatmap",
  "journal",
  "tasks",
  "current-plan",
  "file-groups"
]);
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const DATE_KEY = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const childPath = (path: string, property: string | number): string =>
  `${path}/${String(property).replace(/~/g, "~0").replace(/\//g, "~1")}`;

export const validatePluginDataShape = (
  input: unknown
): readonly ShapeValidationError[] => {
  const errors: ShapeValidationError[] = [];
  const error = (path: string, message: string): void => {
    errors.push({ path: path === "" ? "/" : path, message });
  };
  const object = (
    value: unknown,
    path: string,
    required: readonly string[],
    allowed: readonly string[] | null
  ): JsonRecord | undefined => {
    if (!isRecord(value)) {
      error(path, "must be an object");
      return undefined;
    }
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        error(childPath(path, key), "is required");
      }
    }
    if (allowed !== null) {
      const allowedKeys = new Set(allowed);
      for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
          error(childPath(path, key), "is not allowed");
        }
      }
    }
    return value;
  };
  const array = (value: unknown, path: string): unknown[] | undefined => {
    if (!Array.isArray(value)) {
      error(path, "must be an array");
      return undefined;
    }
    return value as unknown[];
  };
  const string = (
    value: unknown,
    path: string,
    minimum = 0,
    maximum = Number.MAX_SAFE_INTEGER
  ): string | undefined => {
    if (typeof value !== "string") {
      error(path, "must be a string");
      return undefined;
    }
    if (value.length < minimum || value.length > maximum) {
      error(path, `length must be between ${minimum} and ${maximum}`);
    }
    return value;
  };
  const enumeration = (
    value: unknown,
    path: string,
    allowed: ReadonlySet<unknown>
  ): void => {
    if (!allowed.has(value)) {
      error(path, "must be one of the allowed values");
    }
  };
  const integer = (
    value: unknown,
    path: string,
    minimum: number,
    maximum: number
  ): void => {
    if (!Number.isInteger(value) || typeof value !== "number") {
      error(path, "must be an integer");
      return;
    }
    if (value < minimum || value > maximum) {
      error(path, `must be between ${minimum} and ${maximum}`);
    }
  };
  const number = (
    value: unknown,
    path: string,
    minimum: number,
    maximum: number
  ): void => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      error(path, "must be a number");
      return;
    }
    if (value < minimum || value > maximum) {
      error(path, `must be between ${minimum} and ${maximum}`);
    }
  };
  const boolean = (value: unknown, path: string): void => {
    if (typeof value !== "boolean") {
      error(path, "must be a boolean");
    }
  };
  const unique = (values: readonly unknown[], path: string): void => {
    if (new Set(values.map((value) => JSON.stringify(value))).size !== values.length) {
      error(path, "must not contain duplicate items");
    }
  };
  const stableId = (value: unknown, path: string): void => {
    const id = string(value, path, 1, 100);
    if (id !== undefined && !STABLE_ID.test(id)) {
      error(path, "must be a stable ID");
    }
  };
  const vaultPath = (value: unknown, path: string): void => {
    const candidate = string(value, path, 1, 1024);
    if (candidate !== undefined && /^[\\/]/.test(candidate)) {
      error(path, "must be relative to the vault");
    }
  };
  const nullableVaultPath = (value: unknown, path: string): void => {
    if (value !== null) {
      vaultPath(value, path);
    }
  };

  const validatePeriod = (value: unknown, path: string): void => {
    const period = object(
      value,
      path,
      ["id", "label", "startMinute", "endMinute"],
      ["id", "label", "startMinute", "endMinute"]
    );
    if (period === undefined) {
      return;
    }
    stableId(period.id, childPath(path, "id"));
    string(period.label, childPath(path, "label"), 1, 200);
    integer(period.startMinute, childPath(path, "startMinute"), 0, 1439);
    integer(period.endMinute, childPath(path, "endMinute"), 1, 2880);
  };
  const validatePeriodList = (value: unknown, path: string): void => {
    array(value, path)?.forEach((period, index) => {
      validatePeriod(period, childPath(path, index));
    });
  };
  const validateBannerSource = (
    value: unknown,
    path: string,
    nullable: boolean
  ): void => {
    if (nullable && value === null) {
      return;
    }
    const source = object(value, path, ["type", "value"], ["type", "value"]);
    if (source === undefined) {
      return;
    }
    enumeration(source.type, childPath(path, "type"), new Set(["vault", "remote"]));
    if (source.type === "vault") {
      vaultPath(source.value, childPath(path, "value"));
    } else if (source.type === "remote") {
      const remote = string(source.value, childPath(path, "value"), 8, 4096);
      if (remote !== undefined && !/^https?:\/\//.test(remote)) {
        error(childPath(path, "value"), "must use HTTP or HTTPS");
      }
    }
  };

  const rootKeys = [
    "schemaVersion",
    "locale",
    "theme",
    "appearanceMode",
    "startup",
    "layouts",
    "journal",
    "tasks",
    "plans",
    "banner",
    "fileGroups",
    "heatmap"
  ] as const;
  const root = object(input, "", rootKeys, rootKeys);
  if (root === undefined) {
    return errors;
  }

  if (root.schemaVersion !== 1) {
    error("/schemaVersion", "must equal 1");
  }
  enumeration(root.locale, "/locale", new Set(["auto", "zh-cn", "en"]));
  enumeration(root.theme, "/theme", THEMES);
  enumeration(root.appearanceMode, "/appearanceMode", new Set(["auto", "light", "dark"]));

  const startup = object(
    root.startup,
    "/startup",
    ["openOnStartup", "openWhenWorkspaceEmpty"],
    ["openOnStartup", "openWhenWorkspaceEmpty"]
  );
  if (startup !== undefined) {
    boolean(startup.openOnStartup, "/startup/openOnStartup");
    boolean(startup.openWhenWorkspaceEmpty, "/startup/openWhenWorkspaceEmpty");
  }

  const layouts = object(root.layouts, "/layouts", [], null);
  if (layouts !== undefined) {
    if (Object.keys(layouts).length > 6) {
      error("/layouts", "must contain at most 6 themes");
    }
    for (const [theme, value] of Object.entries(layouts)) {
      if (!THEMES.has(theme)) {
        error(childPath("/layouts", theme), "theme ID is not allowed");
      }
      const path = childPath("/layouts", theme);
      const layout = object(
        value,
        path,
        ["moduleOrder", "hiddenModules", "sizes", "bannerVisible"],
        ["moduleOrder", "hiddenModules", "sizes", "bannerVisible"]
      );
      if (layout === undefined) {
        continue;
      }
      const order = array(layout.moduleOrder, childPath(path, "moduleOrder"));
      if (order !== undefined) {
        if (order.length !== 5) {
          error(childPath(path, "moduleOrder"), "must contain exactly 5 modules");
        }
        unique(order, childPath(path, "moduleOrder"));
        order.forEach((module, index) => {
          enumeration(module, childPath(childPath(path, "moduleOrder"), index), MODULES);
        });
      }
      const hidden = array(layout.hiddenModules, childPath(path, "hiddenModules"));
      if (hidden !== undefined) {
        if (hidden.length > 5) {
          error(childPath(path, "hiddenModules"), "must contain at most 5 modules");
        }
        unique(hidden, childPath(path, "hiddenModules"));
        hidden.forEach((module, index) => {
          enumeration(module, childPath(childPath(path, "hiddenModules"), index), MODULES);
        });
      }
      const sizes = object(
        layout.sizes,
        childPath(path, "sizes"),
        [],
        [...MODULES]
      );
      if (sizes !== undefined) {
        for (const [module, size] of Object.entries(sizes)) {
          enumeration(
            size,
            childPath(childPath(path, "sizes"), module),
            new Set(["compact", "standard", "expanded"])
          );
        }
      }
      boolean(layout.bannerVisible, childPath(path, "bannerVisible"));
    }
  }

  const journal = object(
    root.journal,
    "/journal",
    ["filePath", "viewMode"],
    ["filePath", "viewMode"]
  );
  if (journal !== undefined) {
    nullableVaultPath(journal.filePath, "/journal/filePath");
    enumeration(journal.viewMode, "/journal/viewMode", new Set(["edit", "preview"]));
  }

  const tasks = object(root.tasks, "/tasks", ["filePath", "showCompleted"], [
    "filePath",
    "showCompleted"
  ]);
  if (tasks !== undefined) {
    nullableVaultPath(tasks.filePath, "/tasks/filePath");
    boolean(tasks.showCompleted, "/tasks/showCompleted");
  }

  const plans = object(
    root.plans,
    "/plans",
    [
      "activeMode",
      "selectedDailyTemplateId",
      "selectedWeeklyTemplateId",
      "dailyTemplates",
      "weeklyTemplates"
    ],
    [
      "activeMode",
      "selectedDailyTemplateId",
      "selectedWeeklyTemplateId",
      "dailyTemplates",
      "weeklyTemplates"
    ]
  );
  if (plans !== undefined) {
    enumeration(plans.activeMode, "/plans/activeMode", new Set(["daily", "weekly"]));
    if (plans.selectedDailyTemplateId !== null) {
      stableId(plans.selectedDailyTemplateId, "/plans/selectedDailyTemplateId");
    }
    if (plans.selectedWeeklyTemplateId !== null) {
      stableId(plans.selectedWeeklyTemplateId, "/plans/selectedWeeklyTemplateId");
    }
    array(plans.dailyTemplates, "/plans/dailyTemplates")?.forEach((value, index) => {
      const path = `/plans/dailyTemplates/${index}`;
      const template = object(value, path, ["id", "name", "periods"], [
        "id",
        "name",
        "periods"
      ]);
      if (template !== undefined) {
        stableId(template.id, `${path}/id`);
        string(template.name, `${path}/name`, 1, 100);
        validatePeriodList(template.periods, `${path}/periods`);
      }
    });
    array(plans.weeklyTemplates, "/plans/weeklyTemplates")?.forEach((value, index) => {
      const path = `/plans/weeklyTemplates/${index}`;
      const template = object(value, path, ["id", "name", "days"], [
        "id",
        "name",
        "days"
      ]);
      if (template === undefined) {
        return;
      }
      stableId(template.id, `${path}/id`);
      string(template.name, `${path}/name`, 1, 100);
      const weekdays = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday"
      ];
      const days = object(template.days, `${path}/days`, weekdays, weekdays);
      if (days !== undefined) {
        for (const day of weekdays) {
          validatePeriodList(days[day], `${path}/days/${day}`);
        }
      }
    });
  }

  const banner = object(root.banner, "/banner", [
    "title",
    "subtitle",
    "globalSource",
    "themes"
  ], [
    "title",
    "subtitle",
    "globalSource",
    "themes"
  ]);
  if (banner !== undefined) {
    if (banner.title !== null) {
      string(banner.title, "/banner/title", 0, 200);
    }
    if (banner.subtitle !== null) {
      string(banner.subtitle, "/banner/subtitle", 0, 300);
    }
    validateBannerSource(banner.globalSource, "/banner/globalSource", true);
    const themes = object(banner.themes, "/banner/themes", [], null);
    if (themes !== undefined) {
      if (Object.keys(themes).length > 6) {
        error("/banner/themes", "must contain at most 6 themes");
      }
      for (const [theme, value] of Object.entries(themes)) {
        const path = childPath("/banner/themes", theme);
        if (!THEMES.has(theme)) {
          error(path, "theme ID is not allowed");
        }
        const setting = object(
          value,
          path,
          ["sourceMode", "source", "height", "focalPoint"],
          ["sourceMode", "source", "height", "focalPoint"]
        );
        if (setting === undefined) {
          continue;
        }
        enumeration(setting.sourceMode, `${path}/sourceMode`, new Set([
          "inherit",
          "override"
        ]));
        validateBannerSource(setting.source, `${path}/source`, true);
        if (setting.sourceMode === "inherit" && setting.source !== null) {
          error(`${path}/source`, "must be null when sourceMode is inherit");
        }
        if (setting.sourceMode === "override" && setting.source === null) {
          error(`${path}/source`, "must be set when sourceMode is override");
        }
        enumeration(setting.height, `${path}/height`, new Set([
          "compact",
          "standard",
          "tall"
        ]));
        const focalPoint = object(
          setting.focalPoint,
          `${path}/focalPoint`,
          ["x", "y"],
          ["x", "y"]
        );
        if (focalPoint !== undefined) {
          number(focalPoint.x, `${path}/focalPoint/x`, 0, 100);
          number(focalPoint.y, `${path}/focalPoint/y`, 0, 100);
        }
      }
    }
  }

  array(root.fileGroups, "/fileGroups")?.forEach((value, groupIndex) => {
    const path = `/fileGroups/${groupIndex}`;
    const group = object(value, path, ["id", "name", "entries"], [
      "id",
      "name",
      "entries"
    ]);
    if (group === undefined) {
      return;
    }
    stableId(group.id, `${path}/id`);
    string(group.name, `${path}/name`, 1, 100);
    array(group.entries, `${path}/entries`)?.forEach((entryValue, entryIndex) => {
      const entryPath = `${path}/entries/${entryIndex}`;
      const entry = object(entryValue, entryPath, ["id", "path"], ["id", "path"]);
      if (entry !== undefined) {
        stableId(entry.id, `${entryPath}/id`);
        vaultPath(entry.path, `${entryPath}/path`);
      }
    });
  });

  const heatmap = object(
    root.heatmap,
    "/heatmap",
    [
      "history",
      "todaySession",
      "lastSaveTime",
      "sessionDate",
      "countType",
      "historyRetentionDays",
      "language",
      "preferences"
    ],
    [
      "history",
      "todaySession",
      "lastSaveTime",
      "sessionDate",
      "countType",
      "historyRetentionDays",
      "language",
      "preferences"
    ]
  );
  if (heatmap !== undefined) {
    const history = object(heatmap.history, "/heatmap/history", [], null);
    if (history !== undefined) {
      for (const [date, value] of Object.entries(history)) {
        const path = childPath("/heatmap/history", date);
        if (!DATE_KEY.test(date)) {
          error(path, "property name must be a date key");
        }
        const stats = object(value, path, ["totalWords", "files"], [
          "totalWords",
          "files"
        ]);
        if (stats !== undefined) {
          integer(stats.totalWords, `${path}/totalWords`, 0, Number.MAX_SAFE_INTEGER);
          const files = object(stats.files, `${path}/files`, [], null);
          if (files !== undefined) {
            for (const [filePath, contribution] of Object.entries(files)) {
              if (filePath.length === 0) {
                error(`${path}/files`, "file paths must not be empty");
              }
              integer(
                contribution,
                childPath(`${path}/files`, filePath),
                0,
                Number.MAX_SAFE_INTEGER
              );
            }
          }
        }
      }
    }
    const session = object(heatmap.todaySession, "/heatmap/todaySession", [], null);
    if (session !== undefined) {
      for (const [filePath, value] of Object.entries(session)) {
        const path = childPath("/heatmap/todaySession", filePath);
        if (filePath.length === 0) {
          error(path, "file path must not be empty");
        }
        const stats = object(value, path, ["initial", "current"], [
          "initial",
          "current"
        ]);
        if (stats !== undefined) {
          integer(stats.initial, `${path}/initial`, 0, Number.MAX_SAFE_INTEGER);
          integer(stats.current, `${path}/current`, 0, Number.MAX_SAFE_INTEGER);
        }
      }
    }
    integer(heatmap.lastSaveTime, "/heatmap/lastSaveTime", 0, Number.MAX_SAFE_INTEGER);
    const sessionDate = string(heatmap.sessionDate, "/heatmap/sessionDate");
    if (sessionDate !== undefined && sessionDate !== "" && !DATE_KEY.test(sessionDate)) {
      error("/heatmap/sessionDate", "must be empty or a date key");
    }
    enumeration(heatmap.countType, "/heatmap/countType", new Set(["char", "word"]));
    integer(
      heatmap.historyRetentionDays,
      "/heatmap/historyRetentionDays",
      0,
      36500
    );
    enumeration(heatmap.language, "/heatmap/language", new Set(["auto", "zh", "en"]));
    const preferences = object(
      heatmap.preferences,
      "/heatmap/preferences",
      ["excludeFolders", "dateRange", "startOfWeek", "thresholds"],
      ["excludeFolders", "dateRange", "startOfWeek", "thresholds"]
    );
    if (preferences !== undefined) {
      const excluded = array(
        preferences.excludeFolders,
        "/heatmap/preferences/excludeFolders"
      );
      excluded?.forEach((value, index) => {
        vaultPath(value, `/heatmap/preferences/excludeFolders/${index}`);
      });
      if (excluded !== undefined) {
        unique(excluded, "/heatmap/preferences/excludeFolders");
      }
      const range = object(
        preferences.dateRange,
        "/heatmap/preferences/dateRange",
        ["type"],
        ["type", "days", "year"]
      );
      if (range !== undefined) {
        enumeration(range.type, "/heatmap/preferences/dateRange/type", new Set([
          "latestDays",
          "fixedYear"
        ]));
        if (range.type === "latestDays") {
          if (!Object.prototype.hasOwnProperty.call(range, "days")) {
            error("/heatmap/preferences/dateRange/days", "is required");
          }
          if (Object.prototype.hasOwnProperty.call(range, "year")) {
            error("/heatmap/preferences/dateRange/year", "is not allowed");
          }
          integer(range.days, "/heatmap/preferences/dateRange/days", 1, 3650);
        } else if (range.type === "fixedYear") {
          if (!Object.prototype.hasOwnProperty.call(range, "year")) {
            error("/heatmap/preferences/dateRange/year", "is required");
          }
          if (Object.prototype.hasOwnProperty.call(range, "days")) {
            error("/heatmap/preferences/dateRange/days", "is not allowed");
          }
          integer(range.year, "/heatmap/preferences/dateRange/year", 1970, 9999);
        }
      }
      enumeration(preferences.startOfWeek, "/heatmap/preferences/startOfWeek", new Set([
        0,
        1,
        6
      ]));
      const thresholds = array(
        preferences.thresholds,
        "/heatmap/preferences/thresholds"
      );
      if (thresholds !== undefined) {
        if (thresholds.length !== 3) {
          error("/heatmap/preferences/thresholds", "must contain exactly 3 values");
        }
        thresholds.forEach((value, index) => {
          integer(value, `/heatmap/preferences/thresholds/${index}`, 1, Number.MAX_SAFE_INTEGER);
        });
      }
    }
  }

  return errors;
};
