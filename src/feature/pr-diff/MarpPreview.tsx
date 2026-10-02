import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Marp } from "@marp-team/marp-core";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { splitLongSections, withMarpDirective } from "./diff-marp";
import { DEFAULT_FONT_SIZE } from "./diff-font-size";
import { renderMermaidBlocks } from "../mermaid/render-mermaid";

type Props = {
  repo: string;
  prNumber: number;
  path: string;
  fontSize: number;
};

// Marp 既定テーマの本文の文字サイズ
const THEME_FONT_SIZE = 29;

type FullState = { loading: boolean; error: string | null; content: string | null };

type Rendered = { html: string; css: string };

// スライドの見た目をアプリ側の CSS から切り離すため、Shadow DOM の中に描画する
const LIST_STYLE = `
  :host { display: block; }
  svg[data-marpit-svg] {
    display: block;
    width: 100%;
    height: auto;
    margin: 0 0 16px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  }
`;

const SINGLE_STYLE = `
  :host { display: block; width: 100%; height: 100%; }
  div.marpit { width: 100%; height: 100%; }
  svg[data-marpit-svg] { display: block; width: 100%; height: 100%; }
`;

// mermaid の図をスライドの中に収める
const MERMAID_STYLE = `
  pre[data-rendered] { background: none; padding: 0; text-align: center; }
  pre[data-rendered] svg { max-width: 100%; max-height: 560px; height: auto; }
`;

// mermaid のコードブロックを図(SVG)に置き換えた html を返す
async function withMermaidDiagrams(rendered: Rendered): Promise<Rendered> {
  const div = document.createElement("div");
  div.innerHTML = rendered.html;
  const blocks = Array.from(div.querySelectorAll("code.language-mermaid"), (code) => code.parentElement).filter(
    (pre): pre is HTMLElement => pre != null,
  );
  await renderMermaidBlocks(blocks, "marp-mmd");
  return { ...rendered, html: div.innerHTML };
}

// index を渡すとそのスライドだけを表示する
function SlideHost({ rendered, index }: { rendered: Rendered; index?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const style = index == null ? LIST_STYLE : SINGLE_STYLE;
    root.innerHTML = `<style>${rendered.css}${style}${MERMAID_STYLE}</style>${rendered.html}`;
  }, [rendered, index]);

  useEffect(() => {
    const root = hostRef.current?.shadowRoot;
    if (!root || index == null) {
      return;
    }
    root.querySelectorAll<SVGElement>("svg[data-marpit-svg]").forEach((svg, i) => {
      svg.style.display = i === index ? "block" : "none";
    });
  }, [rendered, index]);

  return <div ref={hostRef} className={index == null ? undefined : "marp-overlay-slide"} />;
}

function SlideOverlay({ rendered, count, onClose }: { rendered: Rendered; count: number; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(count - 1, i + 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        setIndex((i) => Math.min(count - 1, i + 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [count, onClose]);

  return createPortal(
    <div className="marp-overlay">
      <SlideHost rendered={rendered} index={index} />
      <div className="marp-overlay-controls">
        <button type="button" onClick={prev} disabled={index === 0} title="前へ (←)">
          <ChevronLeft size={16} />
        </button>
        <span>
          {index + 1} / {count}
        </span>
        <button type="button" onClick={next} disabled={index >= count - 1} title="次へ (→)">
          <ChevronRight size={16} />
        </button>
        <button type="button" onClick={onClose} title="閉じる (Esc)">
          <X size={16} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

// markdown の文字列をスライドとして描画する。全画面表示のボタンも持つ
export function MarpSlides({ content, fontSize = DEFAULT_FONT_SIZE }: { content: string; fontSize?: number }) {
  const [fullscreen, setFullscreen] = useState(false);

  const rendered = useMemo(() => {
    const scale = fontSize / DEFAULT_FONT_SIZE;
    const { html, css } = new Marp().render(withMarpDirective(splitLongSections(content, { scale })));
    const fontCss = `div.marpit > svg > foreignObject > section { font-size: ${THEME_FONT_SIZE * scale}px; }`;
    return { html, css: css + fontCss };
  }, [content, fontSize]);
  const count = useMemo(() => rendered.html.match(/data-marpit-svg/g)?.length ?? 0, [rendered]);
  const [diagrams, setDiagrams] = useState<{ source: Rendered; result: Rendered } | null>(null);

  useEffect(() => {
    if (!rendered.html.includes("language-mermaid")) {
      return;
    }
    let cancelled = false;
    withMermaidDiagrams(rendered).then((result) => {
      if (!cancelled) {
        setDiagrams({ source: rendered, result });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [rendered]);
  // 図の描画が終わるまではコードのまま表示する
  const shown = diagrams?.source === rendered ? diagrams.result : rendered;

  return (
    <>
      <button type="button" className="marp-fullscreen-btn" onClick={() => setFullscreen(true)}>
        <Maximize2 size={12} /> 全画面
      </button>
      <SlideHost rendered={shown} />
      {fullscreen && <SlideOverlay rendered={shown} count={count} onClose={() => setFullscreen(false)} />}
    </>
  );
}

export function MarpPreview({ repo, prNumber, path, fontSize }: Props) {
  const [full, setFull] = useState<FullState>({ loading: true, error: null, content: null });

  useEffect(() => {
    setFull({ loading: true, error: null, content: null });
    const params = new URLSearchParams({ repo, number: String(prNumber), path });
    fetch(`/api/pr-file-content?${params}`)
      .then((res) =>
        res.json().then((d) => {
          if (!res.ok || d.error) {
            throw new Error(d.error ?? `API error: ${res.status}`);
          }
          setFull({ loading: false, error: null, content: d.content });
        }),
      )
      .catch((e) =>
        setFull({ loading: false, error: e instanceof Error ? e.message : "取得に失敗しました", content: null }),
      );
  }, [repo, prNumber, path]);

  return (
    <div className="diff-md-preview">
      {full.loading ? (
        <div className="diff-panel-status">ファイルを読み込み中…</div>
      ) : full.error ? (
        <div className="diff-panel-status diff-panel-error">{full.error}</div>
      ) : full.content != null ? (
        <MarpSlides content={full.content} fontSize={fontSize} />
      ) : null}
    </div>
  );
}
