import {
  TFile,
  type App
} from "obsidian";
import {
  VaultFileSuggest,
  type VaultFileProvider
} from "./VaultFileSuggest";

export class MarkdownFileSuggest extends VaultFileSuggest {
  public constructor(
    app: App,
    input: HTMLInputElement,
    files: VaultFileProvider,
    onChoose: (path: string) => void
  ) {
    super(
      app,
      input,
      files,
      onChoose,
      (file: TFile) => file.extension.toLocaleLowerCase() === "md"
    );
    this.limit = 50;
  }
}
