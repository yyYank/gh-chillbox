export type PaneVisibility = { left: boolean; right: boolean };

// 両ペインが同時に消えると何も操作できなくなるため、隠す側と反対のペインを必ず表示する
export function toggleLeft(v: PaneVisibility): PaneVisibility {
  return v.left ? { left: false, right: true } : { ...v, left: true };
}

export function toggleRight(v: PaneVisibility): PaneVisibility {
  return v.right ? { left: true, right: false } : { ...v, right: true };
}

export function gridColumns(v: PaneVisibility, splitRatio: number): string {
  return v.left && v.right ? `${splitRatio}% 6px 1fr` : "1fr";
}

export type RightTab = "chat" | "diff" | "insight";

// リロード後も最後に選んだ右ペインのタブに戻す。保存値が無い・壊れているときは diff
export function parseRightTab(raw: string | null): RightTab {
  return raw === "chat" || raw === "insight" || raw === "diff" ? raw : "diff";
}
