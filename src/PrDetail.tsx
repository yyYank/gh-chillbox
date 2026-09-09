import { useState, useEffect } from "react";
import { marked } from "marked";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { FileTree } from "./FileTree";

marked.setOptions({ gfm: true, breaks: true });

type PrDetailData = {
  number: number;
  title: string;
  body: string;
  files: { path: string; additions: number; deletions: number }[];
};

type Props = {
  repo: string;
  prNumber: number;
  onBack: () => void;
};

export function PrDetail({ repo, prNumber, onBack }: Props) {
  const storagePrefix = `gh-chillbox:${repo}:${prNumber}`;
  const [data, setData] = useState<PrDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filesOpen, setFilesOpen] = useState(() => {
    try { return localStorage.getItem(`${storagePrefix}:filesOpen`) !== "false"; } catch { return true; }
  });
  const [bodyOpen, setBodyOpen] = useState(() => {
    try { return localStorage.getItem(`${storagePrefix}:bodyOpen`) !== "false"; } catch { return true; }
  });

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ repo, number: String(prNumber) });
    fetch(`/api/pr-detail?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "取得に失敗しました"))
      .finally(() => setLoading(false));
  }, [repo, prNumber]);

  const bodyHtml = data?.body ? marked.parse(data.body) : "";

  return (
    <div className="pr-detail">
      <button type="button" className="pr-detail-back" onClick={onBack}>
        <ArrowLeft size={16} />
        一覧に戻る
      </button>

      {loading && <div className="pr-detail-loading">読み込み中…</div>}
      {error && <div className="error">{error}</div>}

      {data && (
        <>
          <h2 className="pr-detail-title">
            {data.title}{" "}
            <a
              className="pr-detail-number"
              href={`https://github.com/${repo}/pull/${data.number}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              #{data.number}
            </a>
          </h2>

          <div className="pr-detail-section">
            <button
              type="button"
              className="pr-detail-accordion"
              onClick={() => {
                const next = !filesOpen;
                setFilesOpen(next);
                try { localStorage.setItem(`${storagePrefix}:filesOpen`, String(next)); } catch {}
              }}
            >
              {filesOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              変更ファイル ({data.files.length})
            </button>
            {filesOpen && (
              <div className="pr-detail-tree-wrap">
                <FileTree files={data.files} storagePrefix={storagePrefix} />
              </div>
            )}
          </div>

          <div className="pr-detail-section">
            <button
              type="button"
              className="pr-detail-accordion"
              onClick={() => {
                const next = !bodyOpen;
                setBodyOpen(next);
                try { localStorage.setItem(`${storagePrefix}:bodyOpen`, String(next)); } catch {}
              }}
            >
              {bodyOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              本文
            </button>
            {bodyOpen && (
              data.body ? (
                <div
                  className="pr-detail-body markdown-body"
                  dangerouslySetInnerHTML={{ __html: bodyHtml as string }}
                />
              ) : (
                <p className="pr-detail-empty">本文なし</p>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
