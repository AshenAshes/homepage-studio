import { Component, setIcon } from "obsidian";
import type { HomepageModuleViewModel } from "../application/view-models/HomepageShellViewModel";
import { journalDate, journalMonthDays, shiftJournalDay } from "../domain/journal/calendar";

type Journal = NonNullable<HomepageModuleViewModel["journal"]>;

/** Anchored non-modal popover; month changes only replace the day cells. */
export class JournalCalendar extends Component {
  private readonly dialog: HTMLDivElement;
  public dismiss: () => void = () => {};

  public constructor(
    host: HTMLElement,
    journal: Journal,
    selectDate: (key: string) => Promise<boolean>,
    onClose: (restoreFocus: boolean) => void,
    anchor: HTMLElement = host.querySelector<HTMLElement>(".homepage-studio-journal-date-group") ?? host
  ) {
    super();
    this.load();
    const { labels, locale, todayKey, entryDates } = journal.calendar;
    const entries = new Set(entryDates);
    let displayedMonth = journal.dateKey.slice(0, 7);
    let focusedKey = journal.dateKey;
    let pending = false;
    const dialog = host.createDiv({
      cls: "homepage-studio-journal-calendar",
      attr: { role: "dialog", popover: "manual", "aria-label": labels.journalCalendarTitle }
    });
    this.dialog = dialog;
    this.register(() => {
      if (dialog.matches(":popover-open")) dialog.hidePopover();
      anchor.setAttribute("aria-expanded", "false");
      dialog.remove();
    });
    const doc = host.ownerDocument;
    const targetWindow = doc.defaultView;
    const position = (): void => {
      if (!dialog.matches(":popover-open")) return;
      const bounds = anchor.getBoundingClientRect();
      const width = doc.documentElement.clientWidth;
      const height = doc.documentElement.clientHeight;
      const gap = 8;
      const below = height - bounds.bottom - gap * 2;
      const above = bounds.top - gap * 2;
      const naturalHeight = dialog.scrollHeight + 2;
      const placeBelow = below >= naturalHeight || below >= above;
      const available = Math.max(0, placeBelow ? below : above);
      dialog.setCssProps({ "--journal-calendar-max-height": `${available}px` });
      const rect = dialog.getBoundingClientRect();
      const left = Math.max(gap, Math.min(bounds.left, width - rect.width - gap));
      const top = placeBelow ? bounds.bottom + gap : bounds.top - gap - rect.height;
      dialog.setCssProps({
        "--journal-calendar-left": `${left}px`,
        "--journal-calendar-top": `${Math.max(gap, top)}px`
      });
    };
    const toolbar = dialog.createDiv({ cls: "homepage-studio-calendar-toolbar" });
    const iconButton = (icon: string, label: string): HTMLButtonElement => {
      const button = toolbar.createEl("button", { attr: { type: "button", "aria-label": label } });
      setIcon(button, icon);
      return button;
    };
    const previous = iconButton("chevron-left", labels.journalCalendarPrevious);
    const month = toolbar.createEl("select", { attr: { "aria-label": labels.journalCalendarMonth } });
    const monthFormat = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" });
    for (let value = 1; value <= 12; value++) {
      const key = value.toString().padStart(2, "0");
      month.createEl("option", { value: key, text: monthFormat.format(journalDate(`2000-${key}-01`)) });
    }
    const year = toolbar.createEl("input", {
      attr: { type: "number", min: "1", max: "9999", step: "1", "aria-label": labels.journalCalendarYear }
    });
    const next = iconButton("chevron-right", labels.journalCalendarNext);
    const close = iconButton("x", labels.journalCalendarClose);
    const heading = dialog.createDiv({ cls: "homepage-studio-visually-hidden", attr: { "aria-live": "polite" } });
    const weekdays = dialog.createDiv({ cls: "homepage-studio-calendar-weekdays", attr: { "aria-hidden": "true" } });
    const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
    for (let index = 0; index < 7; index++) {
      weekdays.createSpan({ text: weekdayFormat.format(journalDate(shiftJournalDay("2024-01-01", index))) });
    }
    const grid = dialog.createDiv({ cls: "homepage-studio-calendar-days", attr: { role: "group", "aria-label": labels.journalCalendarTitle } });
    const footer = dialog.createDiv({ cls: "homepage-studio-calendar-footer" });
    footer.createSpan({ cls: "homepage-studio-calendar-legend", text: `• ${labels.journalCalendarEntry}` });
    const today = footer.createEl("button", { text: labels.journalCalendarToday, attr: { type: "button" } });
    const status = dialog.createDiv({ cls: "homepage-studio-calendar-status", attr: { role: "alert" } });
    const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" });
    const focusDay = (): void => {
      grid.querySelector<HTMLButtonElement>(`[data-date="${focusedKey}"]`)?.focus();
    };
    const render = (): void => {
      month.value = displayedMonth.slice(5);
      year.value = Number(displayedMonth.slice(0, 4)).toString();
      previous.disabled = displayedMonth === "0001-01";
      next.disabled = displayedMonth === "9999-12";
      heading.setText(`${month.options[month.selectedIndex]?.text ?? ""} ${year.value}`);
      grid.empty();
      for (const key of journalMonthDays(displayedMonth)) {
        const future = key > todayKey;
        const selected = key === journal.dateKey;
        const isToday = key === todayKey;
        const hasEntry = entries.has(key);
        const button = grid.createEl("button", {
          text: Number(key.slice(-2)).toString(),
          attr: {
            type: "button", "data-date": key,
            "data-outside": String(!key.startsWith(displayedMonth)),
            "data-entry": String(hasEntry), "aria-pressed": String(selected),
            "aria-label": [dateFormat.format(journalDate(key)),
              ...(selected ? [labels.journalCalendarSelected] : []),
              ...(isToday ? [labels.journalCalendarToday] : []),
              ...(hasEntry ? [labels.journalCalendarEntry] : []),
              ...(future ? [labels.journalCalendarFuture] : [])].join(", ")
          }
        });
        if (isToday) button.setAttribute("aria-current", "date");
        button.disabled = future || key < "0001-01-01" || key.length !== 10;
        button.tabIndex = key === focusedKey && !button.disabled ? 0 : -1;
      }
    };
    const showMonth = (value: string, focus: boolean): void => {
      displayedMonth = value;
      focusedKey = value === todayKey.slice(0, 7) ? todayKey : `${value}-01`;
      render();
      position();
      if (focus) focusDay();
    };
    const moveMonth = (offset: number): void => {
      const date = journalDate(`${displayedMonth}-01`);
      date.setUTCMonth(date.getUTCMonth() + offset);
      if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return;
      showMonth(date.toISOString().slice(0, 7), false);
    };
    const finish = (restoreFocus = true): void => {
      if (!this.dialog.matches(":popover-open") || pending) return;
      this.unload();
      onClose(restoreFocus);
    };
    this.dismiss = () => finish();
    this.registerDomEvent(previous, "click", () => moveMonth(-1));
    this.registerDomEvent(next, "click", () => moveMonth(1));
    this.registerDomEvent(month, "change", () => showMonth(`${displayedMonth.slice(0, 4)}-${month.value}`, false));
    this.registerDomEvent(year, "change", () => {
      if (!year.validity.valid || year.value === "") {
        year.value = Number(displayedMonth.slice(0, 4)).toString();
        return;
      }
      showMonth(`${Number(year.value).toString().padStart(4, "0")}-${displayedMonth.slice(5)}`, false);
    });
    this.registerDomEvent(today, "click", () => showMonth(todayKey.slice(0, 7), true));
    this.registerDomEvent(close, "click", () => finish());
    this.registerDomEvent(doc, "keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish();
      }
    });
    const closeOutside = (event: Event): void => {
      const path = event.composedPath();
      if (!path.includes(dialog) && !path.includes(anchor)) finish(false);
    };
    this.registerDomEvent(doc, "pointerdown", closeOutside, true);
    this.registerDomEvent(doc, "focusin", closeOutside);
    this.registerDomEvent(doc, "scroll", position, true);
    if (targetWindow !== null) this.registerDomEvent(targetWindow, "resize", position);
    this.registerDomEvent(grid, "click", (event) => {
      const target = event.target;
      if (!(target instanceof dialog.ownerDocument.defaultView!.HTMLElement)) return;
      const button = target.closest<HTMLButtonElement>("button[data-date]");
      const key = button?.getAttribute("data-date");
      if (!key || button?.disabled || pending) return;
      pending = true;
      dialog.setAttribute("aria-busy", "true");
      void (async () => {
        try {
          const selected = await selectDate(key);
          pending = false;
          if (selected) finish();
          else status.setText(labels.journalCalendarFailed);
        } catch {
          status.setText(labels.journalCalendarFailed);
        } finally {
          pending = false;
          dialog.removeAttribute("aria-busy");
          position();
        }
      })();
    });
    this.registerDomEvent(grid, "keydown", (event) => {
      const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      const offset = offsets[event.key];
      if (offset === undefined) return;
      event.preventDefault();
      const key = shiftJournalDay(focusedKey, offset);
      if (key > todayKey || key < "0001-01-01") return;
      focusedKey = key;
      displayedMonth = key.slice(0, 7);
      render();
      focusDay();
    });
    this.registerDomEvent(grid, "focusin", (event) => {
      const target = event.target;
      if (!(target instanceof dialog.ownerDocument.defaultView!.HTMLElement)) return;
      const key = target.getAttribute("data-date");
      if (key !== null) focusedKey = key;
    });
    render();
    anchor.setAttribute("aria-expanded", "true");
    dialog.showPopover();
    position();
    focusDay();
  }
}
