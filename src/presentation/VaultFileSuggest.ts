import {
  AbstractInputSuggest,
  TFile,
  type App
} from "obsidian";

export class VaultFileSuggest extends AbstractInputSuggest<TFile> {
  public constructor(
    app: App,
    input: HTMLInputElement,
    private readonly onChoose: (path: string) => void,
    private readonly accepts: (file: TFile) => boolean = () => true
  ) {
    super(app, input);
    this.limit = 100;
  }

  protected getSuggestions(query: string): TFile[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return this.app.vault.getFiles()
      .filter((file) => this.accepts(file))
      .filter((file) =>
        normalizedQuery === ""
        || file.path.toLocaleLowerCase().includes(normalizedQuery))
      .slice(0, this.limit);
  }

  public renderSuggestion(file: TFile, element: HTMLElement): void {
    element.setText(file.path);
  }

  public override selectSuggestion(
    file: TFile,
    _event: MouseEvent | KeyboardEvent
  ): void {
    this.setValue(file.path);
    this.onChoose(file.path);
    this.close();
  }
}
