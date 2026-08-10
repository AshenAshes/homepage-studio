import type { PluginData } from "./types";

const DEFAULT_DATA: PluginData = {
  schemaVersion: 1,
  locale: "auto",
  theme: "klein-blue",
  appearanceMode: "auto",
  startup: {
    openOnStartup: false,
    openWhenWorkspaceEmpty: true
  },
  layouts: {},
  journal: {
    filePath: null,
    viewMode: "edit"
  },
  tasks: {
    filePath: null,
    showCompleted: true
  },
  plans: {
    activeMode: "daily",
    selectedDailyTemplateId: null,
    selectedWeeklyTemplateId: null,
    dailyTemplates: [],
    weeklyTemplates: []
  },
  banner: {
    title: null,
    subtitle: null,
    globalSource: null,
    themes: {}
  },
  fileGroups: [],
  heatmap: {
    history: {},
    todaySession: {},
    lastSaveTime: 0,
    sessionDate: "",
    countType: "char",
    historyRetentionDays: 0,
    language: "auto",
    preferences: {
      excludeFolders: [],
      dateRange: {
        type: "latestDays",
        days: 365
      },
      startOfWeek: 0,
      thresholds: [200, 1000, 3000]
    }
  }
};

export const createDefaultPluginData = (): PluginData =>
  structuredClone(DEFAULT_DATA);
