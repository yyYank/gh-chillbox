export const DEFAULT_FONT_SIZE = 12;
const MIN_FONT_SIZE = 9;
const MAX_FONT_SIZE = 20;

export function stepFontSize(size: number, delta: 1 | -1): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size + delta));
}

export function parseFontSize(raw: string | null): number {
  const size = Number(raw);
  if (raw === null || !Number.isInteger(size) || size < MIN_FONT_SIZE || size > MAX_FONT_SIZE) {
    return DEFAULT_FONT_SIZE;
  }
  return size;
}
