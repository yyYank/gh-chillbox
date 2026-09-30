import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  groupByTag,
  schemaTypeLabel,
  visibleEndpoints,
  type ApiEndpoint,
  type EndpointChange,
  type Scope,
  type SpecFile,
} from "./api-preview";

const CHANGE_LABELS: Record<Exclude<EndpointChange, "unchanged">, string> = {
  added: "追加",
  modified: "変更",
  removed: "削除",
};

type Props = {
  repo: string;
  prNumber: number;
};

type LoadState = { loading: boolean; error: string | null; files: SpecFile[] | null };

const EMPTY: LoadState = { loading: false, error: null, files: null };

// 同じ参照が何度も出るスキーマで表示が膨らまないよう、ネストはここまで
const MAX_SCHEMA_DEPTH = 6;

export function ApiPreview({ repo, prNumber }: Props) {
  const [scope, setScope] = useState<Scope>("changed");
  const [states, setStates] = useState<Record<Scope, LoadState>>({ changed: EMPTY, all: EMPTY });
  const requested = useRef(new Set<Scope>());

  // 「全部」は切り替えたときに初めて取得する
  useEffect(() => {
    if (requested.current.has(scope)) return;
    requested.current.add(scope);
    setStates((s) => ({ ...s, [scope]: { loading: true, error: null, files: null } }));
    const params = new URLSearchParams({ repo, number: String(prNumber), scope });
    fetch(`/api/openapi?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setStates((s) => ({ ...s, [scope]: { loading: false, error: null, files: d.files ?? [] } }));
      })
      .catch((e) => {
        const error = e instanceof Error ? e.message : "読み込みに失敗しました";
        setStates((s) => ({ ...s, [scope]: { loading: false, error, files: null } }));
      });
  }, [scope, repo, prNumber]);

  const current = states[scope];

  return (
    <div className="api-preview">
      <div className="api-preview-scope">
        {(["changed", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`api-preview-scope-btn${scope === s ? " active" : ""}`}
            onClick={() => setScope(s)}
          >
            {s === "changed" ? "差分" : "全部"}
          </button>
        ))}
      </div>

      {current.loading && <div className="api-preview-empty">読み込み中…</div>}
      {current.error && <div className="error">{current.error}</div>}
      {current.files?.length === 0 && (
        <div className="api-preview-empty">
          {scope === "changed" ? "この PR で変更された OpenAPI ファイルはありません" : "OpenAPI ファイルが見つかりません"}
        </div>
      )}
      {current.files?.map((f) => <SpecView key={f.path} file={f} scope={scope} />)}
    </div>
  );
}

function SpecView({ file, scope }: { file: SpecFile; scope: Scope }) {
  const groups = groupByTag(visibleEndpoints(file.spec.endpoints, scope));
  return (
    <section className="api-spec">
      <header className="api-spec-header">
        <span className="api-spec-path">{file.path}</span>
        {file.changed && <span className="api-badge changed">変更</span>}
        <span className="api-badge">{file.spec.version === "2.0" ? "Swagger 2.0" : "OpenAPI 3.x"}</span>
      </header>
      {file.spec.title && <div className="api-spec-title">{file.spec.title}</div>}
      {groups.length === 0 && <div className="api-preview-empty">endpoint の変更はありません</div>}
      {groups.map((g) => (
        <div key={g.tag} className="api-tag-group">
          <div className="api-tag">{g.tag}</div>
          {g.endpoints.map((e) => <EndpointView key={`${e.method} ${e.path}`} endpoint={e} />)}
        </div>
      ))}
    </section>
  );
}

function EndpointView({ endpoint: e }: { endpoint: ApiEndpoint }) {
  const [open, setOpen] = useState(false);
  const method = e.method.toLowerCase();
  return (
    <div className={`api-endpoint method-${method} change-${e.change}`}>
      <button type="button" className="api-endpoint-summary" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className={`api-method method-${method}`}>{e.method}</span>
        <span className={`api-path${e.deprecated || e.change === "removed" ? " deprecated" : ""}`}>{e.path}</span>
        {e.change !== "unchanged" && (
          <span className={`api-badge change-${e.change}`}>{CHANGE_LABELS[e.change]}</span>
        )}
        {e.summary && <span className="api-summary">{e.summary}</span>}
      </button>

      {open && (
        <div className="api-endpoint-detail">
          {e.changedParts.length > 0 && (
            <div className="api-changed-parts">変更箇所: {e.changedParts.join(", ")}</div>
          )}
          {e.operationId && <div className="api-operation-id">operationId: <code>{e.operationId}</code></div>}
          {e.description && <p className="api-description">{e.description}</p>}

          {e.parameters.length > 0 && (
            <>
              <div className="api-section-title">Parameters</div>
              <table className="api-table">
                <tbody>
                  {e.parameters.map((p) => (
                    <tr key={`${p.in}:${p.name}`}>
                      <td>
                        <code>{p.name}</code>
                        {p.required && <span className="api-required">*</span>}
                      </td>
                      <td className="api-muted">{p.in}</td>
                      <td className="api-type">{schemaTypeLabel(p.schema)}</td>
                      <td>{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {e.requestBody && (
            <>
              <div className="api-section-title">
                Request body
                {e.requestBody.required && <span className="api-required">*</span>}
                {e.requestBody.contentType && <span className="api-muted"> {e.requestBody.contentType}</span>}
              </div>
              <SchemaView schema={e.requestBody.schema} depth={0} />
            </>
          )}

          {e.responses.length > 0 && (
            <>
              <div className="api-section-title">Responses</div>
              {e.responses.map((r) => (
                <div key={r.status} className="api-response">
                  <div>
                    <span className={`api-status status-${r.status[0]}`}>{r.status}</span>
                    {r.description && <span> {r.description}</span>}
                    {r.contentType && <span className="api-muted"> {r.contentType}</span>}
                  </div>
                  {r.schema !== undefined && <SchemaView schema={r.schema} depth={0} />}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SchemaView({ schema, depth }: { schema: unknown; depth: number }) {
  if (typeof schema !== "object" || schema === null) return null;
  const s = schema as Record<string, any>;
  const target = s.type === "array" && typeof s.items === "object" ? s.items : s;
  const props = target?.properties;
  if (typeof props !== "object" || props === null || depth >= MAX_SCHEMA_DEPTH) {
    return depth === 0 ? <div className="api-type">{schemaTypeLabel(schema)}</div> : null;
  }
  const required = new Set<string>(Array.isArray(target.required) ? target.required : []);
  return (
    <ul className="api-schema">
      {depth === 0 && <li className="api-type">{schemaTypeLabel(schema)}</li>}
      {Object.entries(props).map(([name, child]) => (
        <li key={name}>
          <code>{name}</code>
          {required.has(name) && <span className="api-required">*</span>}
          <span className="api-type"> {schemaTypeLabel(child)}</span>
          {(child as any)?.description && <span className="api-muted"> — {(child as any).description}</span>}
          <SchemaView schema={child} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}
