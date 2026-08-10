import type {
  App,
  WorkspaceItem,
  WorkspaceLeaf
} from "obsidian";
import type { HomepageWorkspacePort } from "../../application/HomepageApplicationFacade";
import type { DiagnosticRecorder } from "../../domain/diagnostics";
import { HOMEPAGE_VIEW_TYPE } from "../../constants";

export class WorkspaceController implements HomepageWorkspacePort {
  private opening: Promise<void> | null = null;

  public constructor(
    private readonly app: App,
    private readonly diagnostics: DiagnosticRecorder
  ) {}

  public async openHomepage(): Promise<void> {
    if (this.opening !== null) {
      return this.opening;
    }

    const operation = this.openHomepageOnce();
    this.opening = operation;
    try {
      await operation;
    } finally {
      if (this.opening === operation) {
        this.opening = null;
      }
    }
  }

  public hasHomepage(): boolean {
    return this.app.workspace.getLeavesOfType(HOMEPAGE_VIEW_TYPE).length > 0;
  }

  public hasCentralContentPage(): boolean {
    let hasContent = false;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (
        !hasContent
        && !this.isSidebarLeaf(leaf)
        && leaf.view.getViewType() !== "empty"
        && leaf.view.getViewType() !== HOMEPAGE_VIEW_TYPE
      ) {
        hasContent = true;
      }
    });
    return hasContent;
  }

  public onLayoutReady(callback: () => void): void {
    this.app.workspace.onLayoutReady(callback);
  }

  public subscribeLayoutChange(callback: () => void): () => void {
    const event = this.app.workspace.on("layout-change", callback);
    return () => {
      this.app.workspace.offref(event);
    };
  }

  private async openHomepageOnce(): Promise<void> {
    const homepageLeaves = this.app.workspace.getLeavesOfType(HOMEPAGE_VIEW_TYPE);
    const existingLeaf = homepageLeaves[0];

    if (existingLeaf !== undefined) {
      for (const duplicateLeaf of homepageLeaves.slice(1)) {
        duplicateLeaf.detach();
      }

      if (homepageLeaves.length > 1) {
        this.diagnostics.record({
          code: "VIEW-DUPLICATE-HOMEPAGE",
          messageKey: "diagnosticDuplicateHomepage",
          relatedPaths: [],
          severity: "warning",
          suggestedActionKey: "diagnosticReloadWorkspace"
        });
      }

      await this.app.workspace.revealLeaf(existingLeaf);
      return;
    }

    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({
      type: HOMEPAGE_VIEW_TYPE,
      active: true
    });
    await this.app.workspace.revealLeaf(leaf);
  }

  private isSidebarLeaf(leaf: WorkspaceLeaf): boolean {
    const visited = new Set<WorkspaceItem>();
    let item: WorkspaceItem | null = leaf;

    while (item !== null && !visited.has(item)) {
      if (
        item === this.app.workspace.leftSplit
        || item === this.app.workspace.rightSplit
      ) {
        return true;
      }
      if (item === this.app.workspace.rootSplit) {
        return false;
      }

      visited.add(item);
      item = item.parent ?? null;
    }

    return false;
  }
}
