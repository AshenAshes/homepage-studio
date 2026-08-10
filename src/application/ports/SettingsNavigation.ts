export type HomepageSettingsSection =
  | "interface"
  | "layout"
  | "journal"
  | "tasks"
  | "plans"
  | "banner"
  | "file-groups"
  | "heatmap"
  | "data-management";

export interface SettingsNavigationPort {
  open(section?: HomepageSettingsSection): void;
}

export interface SettingsSectionRequestPort {
  consumeRequestedSection(): HomepageSettingsSection | null;
}
