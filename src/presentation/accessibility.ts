let accessibleLabelSequence = 0;

export const removeHoverTooltipAttributes = (
  element: HTMLElement
): void => {
  element.removeAttribute("aria-label");
  element.removeAttribute("data-tooltip-position");
  element.removeAttribute("title");
};

export const attachAccessibleLabel = (
  element: HTMLElement,
  labelHost: HTMLElement,
  text: string
): HTMLSpanElement => {
  removeHoverTooltipAttributes(element);
  const id = `homepage-studio-accessible-label-${++accessibleLabelSequence}`;
  const label = labelHost.createSpan({
    cls: "homepage-studio-visually-hidden",
    text,
    attr: { id }
  });
  label.id = id;
  element.setAttribute("aria-labelledby", id);
  return label;
};

export const attachTooltipAccessibleLabel = (
  element: HTMLElement,
  text: string,
  position: "bottom" | "left" | "right" | "top" = "top"
): void => {
  removeHoverTooltipAttributes(element);
  element.removeAttribute("aria-labelledby");
  element.setAttribute("aria-label", text);
  element.setAttribute("data-tooltip-position", position);
};
