import {
  normalizePath,
  TFile,
  type App
} from "obsidian";
import type { BannerResourcePort } from
  "../../application/HomepageApplicationFacade";
import { isSupportedBannerImagePath } from
  "../../domain/banner/banner";

export class ObsidianBannerResource implements BannerResourcePort {
  public constructor(private readonly app: App) {}

  public getVaultResourceUrl(path: string): string | null {
    const normalizedPath = normalizePath(path);
    if (!isSupportedBannerImagePath(normalizedPath)) {
      return null;
    }
    const file = this.app.vault.getAbstractFileByPath(normalizedPath);
    return file instanceof TFile
      ? this.app.vault.getResourcePath(file)
      : null;
  }
}
