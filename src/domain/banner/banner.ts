import type {
  BannerSource,
  BannerTheme,
  PluginData,
  ThemeId
} from "../data/types";

export const BANNER_THEME_IDS: readonly ThemeId[] = [
  "klein-blue",
  "watercolor-journal",
  "celestial-orbit",
  "minimal-paper",
  "archive-observatory",
  "cosmic-cartography"
];

const DEFAULT_BANNER_PRESENTATION: Readonly<Record<ThemeId, Pick<
  BannerTheme,
  "height" | "focalPoint"
>>> = {
  "klein-blue": { height: "standard", focalPoint: { x: 50, y: 50 } },
  "watercolor-journal": { height: "tall", focalPoint: { x: 58, y: 46 } },
  "celestial-orbit": { height: "standard", focalPoint: { x: 50, y: 50 } },
  "minimal-paper": { height: "standard", focalPoint: { x: 50, y: 50 } },
  "archive-observatory": { height: "standard", focalPoint: { x: 50, y: 50 } },
  "cosmic-cartography": { height: "standard", focalPoint: { x: 50, y: 50 } }
};

export const getDefaultBannerTheme = (theme: ThemeId): BannerTheme => {
  const presentation = DEFAULT_BANNER_PRESENTATION[theme];
  return {
    sourceMode: "inherit",
    source: null,
    height: presentation.height,
    focalPoint: { ...presentation.focalPoint }
  };
};

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp"
]);

export type RemoteBannerSourceResult =
  | {
    readonly type: "valid";
    readonly source: Extract<BannerSource, { readonly type: "remote" }>;
  }
  | { readonly type: "invalid-url" }
  | { readonly type: "invalid-protocol" };

export interface ResolvedBanner {
  readonly source: BannerSource | null;
  readonly height: BannerTheme["height"];
  readonly focalPoint: BannerTheme["focalPoint"];
}

export const parseRemoteBannerSource = (
  value: string
): RemoteBannerSourceResult => {
  const normalized = value.trim();
  if (
    normalized.length < 8
    || normalized.length > 4096
  ) {
    return { type: "invalid-url" };
  }
  if (!/^[a-z][a-z\d+.-]*:\/\//iu.test(normalized)) {
    return { type: "invalid-url" };
  }
  if (!/^https?:\/\//iu.test(normalized)) {
    return { type: "invalid-protocol" };
  }
  let normalizedUrl = "";
  try {
    const parsed = new URL(normalized);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      || parsed.hostname === ""
    ) {
      return { type: "invalid-url" };
    }
    normalizedUrl = parsed.toString();
  } catch {
    return { type: "invalid-url" };
  }
  return {
    type: "valid",
    source: {
      type: "remote",
      value: normalizedUrl
    }
  };
};

export const isSupportedBannerImagePath = (path: string): boolean => {
  const pathParts = path.split("/");
  const fileName = pathParts[pathParts.length - 1] ?? "";
  const extensionParts = fileName.split(".");
  const extension = fileName.includes(".")
    ? extensionParts[extensionParts.length - 1]?.toLocaleLowerCase() ?? ""
    : "";
  return SUPPORTED_IMAGE_EXTENSIONS.has(extension);
};

export const getBannerTheme = (
  banner: PluginData["banner"],
  theme: ThemeId
): BannerTheme => banner.themes[theme] ?? getDefaultBannerTheme(theme);

export const resolveBanner = (
  banner: PluginData["banner"],
  theme: ThemeId
): ResolvedBanner => {
  const themeSettings = getBannerTheme(banner, theme);
  return {
    source: themeSettings.sourceMode === "override"
      ? themeSettings.source
      : banner.globalSource,
    height: themeSettings.height,
    focalPoint: themeSettings.focalPoint
  };
};

const remapPath = (
  path: string,
  oldPath: string,
  newPath: string,
  directory: boolean
): string => {
  if (path === oldPath) {
    return newPath;
  }
  if (directory && path.startsWith(`${oldPath}/`)) {
    return `${newPath}${path.slice(oldPath.length)}`;
  }
  return path;
};

const remapSource = (
  source: BannerSource | null,
  oldPath: string,
  newPath: string,
  directory: boolean
): BannerSource | null => {
  if (source?.type !== "vault") {
    return source;
  }
  const value = remapPath(source.value, oldPath, newPath, directory);
  return value === source.value
    ? source
    : {
      ...source,
      value
    };
};

export const remapBannerVaultPaths = (
  banner: PluginData["banner"],
  oldPath: string,
  newPath: string,
  directory: boolean
): PluginData["banner"] => {
  const globalSource = remapSource(
    banner.globalSource,
    oldPath,
    newPath,
    directory
  );
  let changed = globalSource !== banner.globalSource;
  const themes = Object.fromEntries(Object.entries(banner.themes).map(
    ([theme, settings]) => {
      const source = remapSource(
        settings.source,
        oldPath,
        newPath,
        directory
      );
      changed ||= source !== settings.source;
      return [
        theme,
        source === settings.source
          ? settings
          : {
            ...settings,
            source
          }
      ];
    }
  ));
  return changed
    ? {
      title: banner.title,
      subtitle: banner.subtitle,
      globalSource,
      themes
    }
    : banner;
};
