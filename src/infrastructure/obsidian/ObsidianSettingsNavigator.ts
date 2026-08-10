import type { App } from "obsidian";
import type {
  HomepageSettingsSection,
  SettingsNavigationPort,
  SettingsSectionRequestPort
} from "../../application/ports/SettingsNavigation";
import { HOMEPAGE_PLUGIN_ID } from "../../constants";

interface ObsidianSettingsManager {
  open(): void;
  openTabById(pluginId: string): void;
}

type AppWithSettings = App & {
  readonly setting?: ObsidianSettingsManager;
};

export class ObsidianSettingsNavigator implements
SettingsNavigationPort,
SettingsSectionRequestPort {
  private requestedSection: HomepageSettingsSection | null = null;

  public constructor(private readonly app: App) {}

  public open(section?: HomepageSettingsSection): void {
    this.requestedSection = section ?? null;
    const settings = (this.app as AppWithSettings).setting;
    if (settings === undefined) {
      return;
    }
    settings.open();
    settings.openTabById(HOMEPAGE_PLUGIN_ID);
  }

  public consumeRequestedSection(): HomepageSettingsSection | null {
    const section = this.requestedSection;
    this.requestedSection = null;
    return section;
  }
}
