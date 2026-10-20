import { appStorage } from "../../app-storage";

// 全タブへの一括送信でよく使う質問。repo をまたいで使うので保存キーは共通にする
export const PRESETS_STORAGE_KEY = "gh-chillbox:broadcast-presets";

export type Preset = { id: string; name: string; prompt: string };
type PresetInput = Omit<Preset, "id">;

function isPreset(v: unknown): v is Preset {
  if (typeof v !== "object" || v === null) {
    return false;
  }
  const p = v as Record<string, unknown>;
  return typeof p.id === "string" && typeof p.name === "string" && typeof p.prompt === "string";
}

export function parsePresets(raw: string | null): Preset[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPreset) : [];
  } catch {
    return [];
  }
}

export function addPreset(presets: Preset[], input: PresetInput, id: string): Preset[] {
  return [...presets, { id, ...input }];
}

export function updatePreset(presets: Preset[], id: string, input: PresetInput): Preset[] {
  return presets.map((p) => (p.id === id ? { id, ...input } : p));
}

export function removePreset(presets: Preset[], id: string): Preset[] {
  return presets.filter((p) => p.id !== id);
}

export function loadPresets(): Preset[] {
  try {
    return parsePresets(appStorage.getItem(PRESETS_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function savePresets(presets: Preset[]): void {
  try {
    appStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {}
}
