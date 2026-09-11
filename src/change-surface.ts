export type Layer =
  | "ui"
  | "api"
  | "domain"
  | "data"
  | "db"
  | "test"
  | "config"
  | "docs"
  | "other";

export type LayerScore = Record<Layer, number>;

export type FileInput = {
  path: string;
  additions: number;
  deletions: number;
};

export type FileLayerResult = {
  path: string;
  changedLines: number;
  scores: LayerScore;
  primaryLayer: Layer;
};

export type LayerSummary = {
  layer: Layer;
  percentage: number;
  changedLines: number;
};

const LAYERS: Layer[] = ["ui", "api", "domain", "data", "db", "test", "config", "docs", "other"];

function emptyScores(): LayerScore {
  return Object.fromEntries(LAYERS.map((l) => [l, 0])) as LayerScore;
}

type Rule = { pattern: RegExp; layer: Layer; weight: number };

const PATH_RULES: Rule[] = [
  { pattern: /(?:^|\/)(components|views|widgets)\//, layer: "ui", weight: 3 },
  { pattern: /(?:^|\/)pages\//, layer: "ui", weight: 2 },
  { pattern: /(?:^|\/)(routes|handlers|controllers|endpoints|middleware)\//, layer: "api", weight: 3 },
  { pattern: /(?:^|\/)(api)\//, layer: "api", weight: 2 },
  { pattern: /(?:^|\/)(domain|entities)\//, layer: "domain", weight: 3 },
  { pattern: /(?:^|\/)(usecase|usecases|use-cases|use_cases|interactors)\//, layer: "domain", weight: 3 },
  { pattern: /(?:^|\/)(services|service)\//, layer: "domain", weight: 2 },
  { pattern: /(?:^|\/)(repository|repositories|repo)\//, layer: "data", weight: 3 },
  { pattern: /(?:^|\/)(dao|daos|store|stores|datasource)\//, layer: "data", weight: 3 },
  { pattern: /(?:^|\/)(migrations|migrate|seeds)\//, layer: "db", weight: 5 },
  { pattern: /(?:^|\/)__tests__\//, layer: "test", weight: 4 },
  { pattern: /(?:^|\/)(docs|documentation)\//, layer: "docs", weight: 3 },
];

const FILENAME_RULES: Rule[] = [
  { pattern: /\.test\.[jt]sx?$/, layer: "test", weight: 5 },
  { pattern: /\.spec\.[jt]sx?$/, layer: "test", weight: 5 },
  { pattern: /_test\.go$/, layer: "test", weight: 5 },
  { pattern: /^schema\.sql$/, layer: "db", weight: 5 },
  { pattern: /^package\.json$/, layer: "config", weight: 3 },
  { pattern: /^package-lock\.json$/, layer: "config", weight: 3 },
  { pattern: /^pnpm-lock\.yaml$/, layer: "config", weight: 3 },
  { pattern: /^yarn\.lock$/, layer: "config", weight: 3 },
  { pattern: /^tsconfig[^/]*\.json$/, layer: "config", weight: 3 },
  { pattern: /^go\.(mod|sum)$/, layer: "config", weight: 3 },
  { pattern: /^Cargo\.(toml|lock)$/, layer: "config", weight: 3 },
  { pattern: /^\.eslintrc/, layer: "config", weight: 3 },
  { pattern: /^\.prettierrc/, layer: "config", weight: 3 },
  { pattern: /^vite\.config\./, layer: "config", weight: 3 },
  { pattern: /^webpack\.config\./, layer: "config", weight: 3 },
  { pattern: /^Dockerfile$/, layer: "config", weight: 3 },
  { pattern: /^docker-compose/, layer: "config", weight: 3 },
];

const EXTENSION_RULES: Rule[] = [
  { pattern: /\.tsx$/, layer: "ui", weight: 1 },
  { pattern: /\.jsx$/, layer: "ui", weight: 1 },
  { pattern: /\.css$/, layer: "ui", weight: 2 },
  { pattern: /\.scss$/, layer: "ui", weight: 2 },
  { pattern: /\.vue$/, layer: "ui", weight: 2 },
  { pattern: /\.svelte$/, layer: "ui", weight: 2 },
  { pattern: /\.sql$/, layer: "db", weight: 2 },
  { pattern: /\.md$/, layer: "docs", weight: 3 },
  { pattern: /\.mdx$/, layer: "docs", weight: 3 },
];

type KeywordRule = { pattern: RegExp; layer: Layer; weight: number };

const KEYWORD_RULES: KeywordRule[] = [
  { pattern: /\bCREATE\s+TABLE\b/i, layer: "db", weight: 2 },
  { pattern: /\bALTER\s+TABLE\b/i, layer: "db", weight: 2 },
  { pattern: /\bDROP\s+TABLE\b/i, layer: "db", weight: 2 },
  { pattern: /\buseState\b/, layer: "ui", weight: 1 },
  { pattern: /\buseEffect\b/, layer: "ui", weight: 1 },
  { pattern: /\buseCallback\b/, layer: "ui", weight: 1 },
  { pattern: /\bclassName\b/, layer: "ui", weight: 1 },
  { pattern: /\brouter\b/i, layer: "api", weight: 1 },
  { pattern: /\bendpoint\b/i, layer: "api", weight: 1 },
  { pattern: /\bmiddleware\b/i, layer: "api", weight: 1 },
];

export function scoreFile(file: FileInput, diffContent?: string): FileLayerResult {
  const scores = emptyScores();
  const filename = file.path.split("/").pop() || "";

  for (const rule of PATH_RULES) {
    if (rule.pattern.test(file.path)) {
      scores[rule.layer] += rule.weight;
    }
  }

  for (const rule of FILENAME_RULES) {
    if (rule.pattern.test(filename)) {
      scores[rule.layer] += rule.weight;
    }
  }

  for (const rule of EXTENSION_RULES) {
    if (rule.pattern.test(filename)) {
      scores[rule.layer] += rule.weight;
    }
  }

  if (diffContent) {
    for (const rule of KEYWORD_RULES) {
      if (rule.pattern.test(diffContent)) {
        scores[rule.layer] += rule.weight;
      }
    }
  }

  let maxScore = 0;
  let primaryLayer: Layer = "other";
  for (const layer of LAYERS) {
    if (scores[layer] > maxScore) {
      maxScore = scores[layer];
      primaryLayer = layer;
    }
  }

  return {
    path: file.path,
    changedLines: file.additions + file.deletions,
    scores,
    primaryLayer,
  };
}

export function classifyFiles(files: FileInput[], diffMap?: Map<string, string>): FileLayerResult[] {
  return files.map((f) => scoreFile(f, diffMap?.get(f.path)));
}

export function computeSummary(classified: FileLayerResult[]): LayerSummary[] {
  if (classified.length === 0) return [];

  const totals: Record<Layer, number> = Object.fromEntries(
    LAYERS.map((l) => [l, 0])
  ) as Record<Layer, number>;

  let totalLines = 0;
  for (const file of classified) {
    totals[file.primaryLayer] += file.changedLines;
    totalLines += file.changedLines;
  }

  if (totalLines === 0) return [];

  return LAYERS
    .filter((l) => totals[l] > 0)
    .map((l) => ({
      layer: l,
      percentage: Math.round((totals[l] / totalLines) * 100),
      changedLines: totals[l],
    }))
    .sort((a, b) => b.percentage - a.percentage);
}

export const LAYER_LABELS: Record<Layer, string> = {
  ui: "UI",
  api: "API",
  domain: "Domain",
  data: "Data",
  db: "DB",
  test: "Test",
  config: "Config",
  docs: "Docs",
  other: "Other",
};

export const LAYER_COLORS: Record<Layer, string> = {
  ui: "#38bdf8",
  api: "#a78bfa",
  domain: "#34d399",
  data: "#fbbf24",
  db: "#f87171",
  test: "#94a3b8",
  config: "#fb923c",
  docs: "#67e8f9",
  other: "#6b7280",
};
