import type { LocalePreference } from "../../domain/data/types";
import {
  getMessages,
  type Messages,
  type ResolvedLocale
} from "../../localization/messages";

export interface MessageProvider {
  getMessages(): Messages;
  subscribe(listener: () => void): () => void;
}

export class LocalizationService implements MessageProvider {
  private preference: LocalePreference = "auto";
  private readonly listeners = new Set<() => void>();

  public constructor(private readonly obsidianLocale: string) {}

  public getResolvedLocale(): ResolvedLocale {
    if (this.preference !== "auto") {
      return this.preference;
    }

    return this.obsidianLocale.toLowerCase().startsWith("zh")
      ? "zh-cn"
      : "en";
  }

  public getMessages(): Messages {
    return getMessages(this.getResolvedLocale());
  }

  public setPreference(preference: LocalePreference): void {
    if (this.preference === preference) {
      return;
    }

    this.preference = preference;
    for (const listener of this.listeners) {
      listener();
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
