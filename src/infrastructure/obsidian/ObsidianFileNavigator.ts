import type { App } from "obsidian";
import type { FileNavigationPort } from "../../application/ports/FileNavigation";

export class ObsidianFileNavigator implements FileNavigationPort {
  public constructor(private readonly app: App) {}

  public open(path: string, newPane: boolean): Promise<void> {
    return this.app.workspace.openLinkText(
      path,
      "",
      newPane ? "split" : false
    );
  }
}
