import { useState, useEffect } from "react";
import {
  type FileInput,
  type LayerSummary,
  type FileLayerResult,
  classifyFiles,
  computeSummary,
  LAYER_LABELS,
  LAYER_COLORS,
} from "./change-surface";

type Props = {
  files: FileInput[];
};

export function ChangeSurface({ files }: Props) {
  const [summary, setSummary] = useState<LayerSummary[]>([]);
  const [classified, setClassified] = useState<FileLayerResult[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    const results = classifyFiles(files);
    setClassified(results);
    setSummary(computeSummary(results));
  }, [files]);

  if (files.length === 0) {
    return <div className="change-surface-empty">変更ファイルなし</div>;
  }

  const maxPercentage = summary.length > 0 ? summary[0].percentage : 0;

  return (
    <div className="change-surface">
      <div className="change-surface-header">
        <span className="change-surface-title">Change Surface</span>
        <button
          type="button"
          className="change-surface-debug-btn"
          onClick={() => setShowDebug(!showDebug)}
        >
          {showDebug ? "Hide" : "Debug"}
        </button>
      </div>

      <div className="change-surface-bars">
        {summary.map((s) => (
          <div key={s.layer} className="change-surface-row">
            <span className="change-surface-label">{LAYER_LABELS[s.layer]}</span>
            <div className="change-surface-bar-wrap">
              <div
                className="change-surface-bar"
                style={{
                  width: `${(s.percentage / maxPercentage) * 100}%`,
                  background: LAYER_COLORS[s.layer],
                }}
              />
            </div>
            <span className="change-surface-pct">{s.percentage}%</span>
          </div>
        ))}
      </div>

      {summary.length > 1 && (
        <div className="change-surface-flow">
          {summary.map((s, i) => (
            <span key={s.layer}>
              {i > 0 && <span className="change-surface-arrow"> → </span>}
              <span style={{ color: LAYER_COLORS[s.layer] }}>{LAYER_LABELS[s.layer]}</span>
            </span>
          ))}
        </div>
      )}

      {showDebug && (
        <div className="change-surface-debug">
          <table className="change-surface-debug-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Layer</th>
                <th>Lines</th>
              </tr>
            </thead>
            <tbody>
              {classified.map((f) => (
                <tr key={f.path}>
                  <td className="change-surface-debug-path">{f.path}</td>
                  <td>
                    <span
                      className="change-surface-layer-badge"
                      style={{ background: LAYER_COLORS[f.primaryLayer] }}
                    >
                      {LAYER_LABELS[f.primaryLayer]}
                    </span>
                  </td>
                  <td>{f.changedLines}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
