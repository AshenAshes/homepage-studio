import type { App } from "obsidian";

const isHtmlElement = (element: Element | null): element is HTMLElement => {
  const HtmlElement = element?.ownerDocument.defaultView?.HTMLElement;
  return HtmlElement !== undefined && element instanceof HtmlElement;
};

export const captureModalTrigger = (app: App): HTMLElement | null => {
  const documents = new Set<Document>([
    app.workspace.containerEl.ownerDocument
  ]);
  app.workspace.iterateAllLeaves((leaf) => {
    documents.add(leaf.getContainer().doc);
  });
  const orderedDocuments = [...documents].sort(
    (left, right) => Number(right.hasFocus()) - Number(left.hasFocus())
  );
  for (const ownerDocument of orderedDocuments) {
    const activeElement = ownerDocument.activeElement;
    if (
      isHtmlElement(activeElement)
      && activeElement !== ownerDocument.body
    ) {
      return activeElement;
    }
  }
  return null;
};

export const restoreModalTrigger = (trigger: HTMLElement | null): void => {
  if (
    trigger === null
    || !trigger.isConnected
    || trigger.matches(":disabled")
  ) {
    return;
  }
  trigger.focus();
};
