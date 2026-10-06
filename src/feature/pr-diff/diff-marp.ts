import { marked, type Token } from "marked";

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

// Marp は front matter に marp: true がないとスライドとして扱わない。
// また --- の区切りがない md は 1 枚に収まらずはみ出すので、見出しでスライドを分ける
export function withMarpDirective(md: string): string {
  const match = md.match(FRONT_MATTER);
  const frontMatter = match?.[1] ?? "";
  const missing = [
    /^marp\s*:\s*true\s*$/m.test(frontMatter) ? null : "marp: true",
    /^headingDivider\s*:/m.test(frontMatter) ? null : "headingDivider: 2",
  ].filter((d): d is string => d !== null);
  if (!match) {
    return `---\n${missing.join("\n")}\n---\n\n${md}`;
  }
  if (missing.length === 0) {
    return md;
  }
  return md.replace(/^---\r?\n/, `---\n${missing.join("\n")}\n`);
}

// 1 枚のスライドに収まる行数の目安(1280x720・既定テーマの本文サイズから見積もった値)
const DEFAULT_MAX_LINES = 14;
// 1 行に入る文字幅の目安(全角を 1、半角を 0.5 として数える)
const LINE_WIDTH = 40;

function wrappedLines(text: string, lineWidth: number): number {
  return text.split("\n").reduce((sum, line) => {
    let width = 0;
    for (const ch of line) {
      width += ch.charCodeAt(0) > 0xff ? 1 : 0.5;
    }
    return sum + Math.max(1, Math.ceil(width / lineWidth));
  }, 0);
}

// ブロックが占める行数のおおまかな見積もり。下の余白として 1 行を足す
function estimateLines(token: Token, lineWidth: number): number {
  switch (token.type) {
    case "space":
    case "hr":
      return 0;
    case "html":
      return token.raw.trimStart().startsWith("<!--") ? 0 : wrappedLines(token.raw.trim(), lineWidth) + 1;
    case "heading":
      return token.depth === 1 ? 2.5 : 2;
    case "code":
      return token.raw.trim().split("\n").length + 1;
    case "table":
      return (token.raw.trim().split("\n").length - 1) * 1.5 + 1;
    default:
      return wrappedLines(token.raw.trim(), lineWidth) + 1;
  }
}

type SplitOptions = {
  maxLines?: number;
  // 既定の文字サイズに対する倍率。大きいほど 1 枚に入る量が減る
  scale?: number;
};

// 見出し(headingDivider: 2)や --- で分けても 1 枚に収まらない節を、ブロックの境目で続きのスライドに分ける
export function splitLongSections(md: string, { maxLines = DEFAULT_MAX_LINES, scale = 1 }: SplitOptions = {}): string {
  const budget = maxLines / scale;
  const lineWidth = LINE_WIDTH / scale;
  const frontMatter = md.match(FRONT_MATTER)?.[0] ?? "";
  let out = frontMatter;
  let used = 0;
  let hasBody = false;
  for (const token of marked.lexer(md.slice(frontMatter.length))) {
    if (token.type === "hr" || (token.type === "heading" && token.depth <= 2)) {
      used = 0;
      hasBody = false;
    }
    const lines = estimateLines(token, lineWidth);
    // 見出しだけが取り残されないよう、本文があるスライドでだけ分ける。
    // 表は描画時に縮小して 1 枚に収めるので、本文の後に来たら常に新しいスライドから始める
    if (lines > 0 && hasBody && (used + lines > budget || token.type === "table")) {
      out = `${out.trimEnd()}\n\n---\n\n`;
      used = 0;
    }
    out += token.raw;
    used += lines;
    if (lines > 0 && token.type !== "heading") {
      hasBody = true;
    }
  }
  return out;
}

// スライドを delta 枚だけめくった先の番号。最初と最後で止める
export function stepSlide(index: number, delta: number, count: number): number {
  return Math.max(0, Math.min(count - 1, index + delta));
}

// 縮小すると折り返しが変わって大きさが比例しないため、実際に fits で試しながら二分探索する。
// min までは収まるものとして扱う
export function largestFittingScale(fits: (scale: number) => boolean, min = 0.05, steps = 10): number {
  if (fits(1)) {
    return 1;
  }
  let lo = min;
  let hi = 1;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}
