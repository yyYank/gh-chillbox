import type { Scope } from "./useScopedFetch";

type Props = {
  scope: Scope;
  onChange: (scope: Scope) => void;
};

export function ScopeToggle({ scope, onChange }: Props) {
  return (
    <div className="api-preview-scope">
      {(["changed", "all"] as const).map((s) => (
        <button
          key={s}
          type="button"
          className={`api-preview-scope-btn${scope === s ? " active" : ""}`}
          onClick={() => onChange(s)}
        >
          {s === "changed" ? "差分" : "全部"}
        </button>
      ))}
    </div>
  );
}
