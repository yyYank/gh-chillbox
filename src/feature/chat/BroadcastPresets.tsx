import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { type Preset, addPreset, loadPresets, removePreset, savePresets, updatePreset } from "./broadcast-presets";

type Draft = { id: string | null; name: string; prompt: string };

type Props = {
  input: string;
  onPick: (prompt: string) => void;
};

// 一括送信モーダルの中で、よく使う質問を選んだり追加・編集・削除したりする
export function BroadcastPresets({ input, onPick }: Props) {
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [draft, setDraft] = useState<Draft | null>(null);

  const apply = (next: Preset[]) => {
    setPresets(next);
    savePresets(next);
  };

  const saveDraft = () => {
    if (!draft?.name.trim() || !draft.prompt.trim()) {
      return;
    }
    const value = { name: draft.name.trim(), prompt: draft.prompt.trim() };
    apply(draft.id ? updatePreset(presets, draft.id, value) : addPreset(presets, value, crypto.randomUUID()));
    setDraft(null);
  };

  const remove = (preset: Preset) => {
    if (window.confirm(`プリセット「${preset.name}」を削除しますか？`)) {
      apply(removePreset(presets, preset.id));
    }
  };

  return (
    <div className="broadcast-presets">
      <div className="broadcast-presets-header">
        <span>プリセット</span>
        <button
          type="button"
          className="broadcast-presets-add"
          disabled={!input.trim() || draft !== null}
          onClick={() => setDraft({ id: null, name: "", prompt: input.trim() })}
        >
          質問欄をプリセットとして保存
        </button>
      </div>
      {presets.length === 0 && !draft && <p className="broadcast-presets-empty">プリセットはまだありません</p>}
      <ul className="broadcast-presets-list">
        {presets.map((p) => (
          <li key={p.id} className="broadcast-preset">
            <button type="button" className="broadcast-preset-pick" title={p.prompt} onClick={() => onPick(p.prompt)}>
              {p.name}
            </button>
            <button
              type="button"
              className="broadcast-preset-icon"
              title="編集"
              onClick={() => setDraft({ id: p.id, name: p.name, prompt: p.prompt })}
            >
              <Pencil size={12} />
            </button>
            <button type="button" className="broadcast-preset-icon" title="削除" onClick={() => remove(p)}>
              <Trash2 size={12} />
            </button>
          </li>
        ))}
      </ul>
      {draft && (
        <div className="broadcast-preset-editor">
          <input
            autoFocus
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="名前（例: 要約）"
          />
          <textarea rows={3} value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} />
          <div className="broadcast-preset-editor-actions">
            <button type="button" onClick={() => setDraft(null)}>
              キャンセル
            </button>
            <button
              type="button"
              className="broadcast-preset-save"
              disabled={!draft.name.trim() || !draft.prompt.trim()}
              onClick={saveDraft}
            >
              {draft.id ? "更新" : "保存"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
