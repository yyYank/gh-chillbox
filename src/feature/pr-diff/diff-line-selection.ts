// 行番号のクリックで選んでいる範囲。anchorIdx は最初にクリックした行で、Shift+クリックの起点になる
export type LineSelection = { path: string; anchorIdx: number; focusIdx: number };

export function clickLine(
  current: LineSelection | null,
  path: string,
  idx: number,
  shift: boolean,
): LineSelection | null {
  if (shift && current && current.path === path) {
    return { path, anchorIdx: current.anchorIdx, focusIdx: idx };
  }
  const isSameSingleLine = !shift && current?.path === path && current.anchorIdx === idx && current.focusIdx === idx;
  if (isSameSingleLine) {
    return null;
  }
  return { path, anchorIdx: idx, focusIdx: idx };
}

export function selectionRange(sel: LineSelection): [number, number] {
  return sel.anchorIdx <= sel.focusIdx ? [sel.anchorIdx, sel.focusIdx] : [sel.focusIdx, sel.anchorIdx];
}

export function isLineSelected(sel: LineSelection | null, path: string, idx: number): boolean {
  if (!sel || sel.path !== path) {
    return false;
  }
  const [lo, hi] = selectionRange(sel);
  return lo <= idx && idx <= hi;
}
