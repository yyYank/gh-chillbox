import type { GoDocItem } from "./godoc";

export type SymbolChange = "added" | "modified" | "removed" | "unchanged";

export type DiffedGoDocItem = GoDocItem & {
  change: SymbolChange;
  changedParts: ("signature" | "doc")[];
};

// head の並び順を保ち、base にだけあるシンボルは末尾に removed として足す
export function diffGoDocItems(base: GoDocItem[], head: GoDocItem[]): DiffedGoDocItem[] {
  const key = (i: GoDocItem) => `${i.kind}:${i.name}`;
  const baseByKey = new Map(base.map((i) => [key(i), i]));
  const headKeys = new Set(head.map(key));

  const current = head.map((i): DiffedGoDocItem => {
    const before = baseByKey.get(key(i));
    if (!before) {
      return { ...i, change: "added", changedParts: [] };
    }
    const changedParts: DiffedGoDocItem["changedParts"] = [];
    if (before.decl !== i.decl) {
      changedParts.push("signature");
    }
    if (before.docText !== i.docText) {
      changedParts.push("doc");
    }
    return { ...i, change: changedParts.length > 0 ? "modified" : "unchanged", changedParts };
  });
  const removed = base
    .filter((i) => !headKeys.has(key(i)))
    .map((i): DiffedGoDocItem => ({ ...i, change: "removed", changedParts: [] }));

  return [...current, ...removed];
}
