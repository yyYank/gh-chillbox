// Tailscale 経由の複数クライアントで同じ値を共有するため、保存先を Hono server にする。
// 呼び出し側が同期で読めるよう、起動時に全件を取得してメモリに持つ
export type LegacyStorage = Pick<Storage, "length" | "key" | "getItem">;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

type Deps = { fetch: Fetch; legacy: LegacyStorage };

const cache = new Map<string, string>();
let send: Fetch = async () => new Response(null);

function readLegacy(legacy: LegacyStorage): Record<string, string> {
  const entries: Record<string, string> = {};
  for (let i = 0; i < legacy.length; i++) {
    const key = legacy.key(i);
    const value = key === null ? null : legacy.getItem(key);
    if (key !== null && value !== null) {
      entries[key] = value;
    }
  }
  return entries;
}

function put(key: string, value: string) {
  send(`/api/store/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value }),
  }).catch(() => {});
}

export async function initAppStorage(
  { fetch, legacy }: Deps = { fetch: window.fetch.bind(window), legacy: localStorage },
): Promise<void> {
  send = fetch;
  cache.clear();
  try {
    const stored = (await (await fetch("/api/store")).json()) as Record<string, string>;
    for (const [k, v] of Object.entries(stored)) {
      cache.set(k, v);
    }
    // 画面を開いた直後にテーマ等が保存されるため、server が空かどうかでは移行済みか判断できない。
    // このブラウザの localStorage にしか無いキーは server へ移す
    for (const [k, v] of Object.entries(readLegacy(legacy))) {
      if (!cache.has(k)) {
        cache.set(k, v);
        put(k, v);
      }
    }
  } catch {
    for (const [k, v] of Object.entries(readLegacy(legacy))) {
      cache.set(k, v);
    }
  }
}

export const appStorage = {
  getItem: (key: string): string | null => cache.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    cache.set(key, value);
    put(key, value);
  },
  removeItem: (key: string): void => {
    cache.delete(key);
    send(`/api/store/${encodeURIComponent(key)}`, { method: "DELETE" }).catch(() => {});
  },
};
