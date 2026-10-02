export type DiffFileEntry = {
  path: string;
  rawContent: string;
};

export function matchPathPattern(query: string, target: string): boolean {
  if (query === "") {
    return true;
  }
  if (target === "") {
    return false;
  }

  const pattern = query
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(pattern, "i").test(target);
}

export function filterDiffFiles(files: DiffFileEntry[], pathQuery: string, textQuery: string): DiffFileEntry[] {
  const pq = pathQuery.trim();
  const tq = textQuery.trim().toLowerCase();

  if (!pq && !tq) {
    return files;
  }

  return files.filter((file) => {
    const pathMatch = !pq || matchPathPattern(pq, file.path);
    const textMatch = !tq || file.rawContent.toLowerCase().includes(tq);
    return pathMatch && textMatch;
  });
}
