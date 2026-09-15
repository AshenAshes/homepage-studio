/** UTC arithmetic keeps calendar days independent of daylight-saving changes. */
export const journalDate = (key: string): Date => new Date(`${key}T00:00:00Z`);

export const journalDateKey = (date: Date): string => date.toISOString().split("T")[0] ?? "";

export const isJournalDateKey = (key: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(key) || key < "0001-01-01") return false;
  const date = journalDate(key);
  return Number.isFinite(date.getTime()) && journalDateKey(date) === key;
};

export const shiftJournalDay = (key: string, offset: number): string => {
  const date = journalDate(key);
  date.setUTCDate(date.getUTCDate() + offset);
  return journalDateKey(date);
};

export const journalMonthDays = (month: string): readonly string[] => {
  const first = `${month}-01`;
  const offset = (journalDate(first).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => shiftJournalDay(first, index - offset));
};
