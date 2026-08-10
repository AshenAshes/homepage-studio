import {
  AbstractInputSuggest,
  TFile,
  type App
} from "obsidian";

export class MarkdownFileSuggest extends AbstractInputSuggest<TFile> {
  public constructor(
    app: App,
    input: HTMLInputElement,
    private readonly onChoose: (path: string) => void
  ) {
    super(app, input);
    this.limit = 50;
  }

  protected getSuggestions(query: string): TFile[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return this.app.vault.getMarkdownFiles()
      .filter((file) => normalizedQuery === ""
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
