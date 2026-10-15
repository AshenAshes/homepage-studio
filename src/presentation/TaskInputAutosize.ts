import type { Component } from "obsidian";

export function attachTaskInputAutosize(input: HTMLTextAreaElement, scope: Component): () => void {
  const resize = (): void => {
    input.setCssProps({ "--task-editor-height": "auto" });
    const style = input.ownerDocument.defaultView?.getComputedStyle(input);
    const border = style ? parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth) : 0;
    input.setCssProps({ "--task-editor-height": `${input.scrollHeight + border}px` });
  };
  let lastWidth = input.clientWidth;
  const widthObserver = new ResizeObserver(() => {
    if (input.clientWidth !== lastWidth) { lastWidth = input.clientWidth; resize(); }
  });
  widthObserver.observe(input);
  scope.register(() => widthObserver.disconnect());
  resize();
  scope.registerDomEvent(input, "input", resize);
  return resize;
}
