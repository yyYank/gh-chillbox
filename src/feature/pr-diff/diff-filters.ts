export type DiffFileEntry = {
  path: string;
  rawContent: string;
};

export function fuzzyMatch(query: string, target: string): boolean {
  if (query === "") return true;
  if (target === "") return false;

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function filterDiffFiles(
  files: DiffFileEntry[],
  pathQuery: string,
  textQuery: string,
): DiffFileEntry[] {
  const pq = pathQuery.trim();
  const tq = textQuery.trim().toLowerCase();

  if (!pq && !tq) return files;

  return files.filter((file) => {
    const pathMatch = !pq || fuzzyMatch(pq, file.path);
    const textMatch = !tq || file.rawContent.toLowerCase().includes(tq);
    return pathMatch && textMatch;
  });
}
