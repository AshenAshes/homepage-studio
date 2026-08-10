export type WritingCountType = "char" | "word";

const LEGACY_WORD_PATTERN =
  /[a-zA-Z0-9_\u0392-\u03c9\u0400-\u04FF\u00E0-\u00FC]+|[\u4E00-\u9FFF\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\uac00-\ud7af]+/gu;

const isLegacyCjk = (character: string): boolean => {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) {
    return false;
  }

  return (
    (codePoint >= 0x4E00 && codePoint <= 0x9FFF)
    || (codePoint >= 0x3400 && codePoint <= 0x4DBF)
    || (codePoint >= 0xF900 && codePoint <= 0xFAFF)
    || (codePoint >= 0x3040 && codePoint <= 0x309F)
    || (codePoint >= 0x30A0 && codePoint <= 0x30FF)
    || (codePoint >= 0xAC00 && codePoint <= 0xD7AF)
    || (codePoint >= 0x20000 && codePoint <= 0x323AF)
  );
};

export const countLegacyWords = (text: string): number => {
  const matches = text.match(LEGACY_WORD_PATTERN);
  if (matches === null) {
    return 0;
  }

  return matches.reduce(
    (total, match) => total + (isLegacyCjk(match[0] ?? "") ? match.length : 1),
    0
  );
};

export const countWritingUnits = (
  text: string,
  countType: WritingCountType
): number => countType === "char" ? text.length : countLegacyWords(text);
