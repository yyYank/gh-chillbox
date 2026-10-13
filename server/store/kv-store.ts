import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

type Data = Record<string, string>;

// Tailscale 経由の複数クライアントで同じ値を共有するため、ブラウザ側の localStorage の代わりにファイルへ保存する
export function createKvStore(filePath: string) {
  let loaded: Promise<Data> | null = null;
  // 書き込みが重なってもファイルを壊さないよう、直列に処理する
  let queue: Promise<unknown> = Promise.resolve();

  function load(): Promise<Data> {
    loaded ??= readFile(filePath, "utf8")
      .then((raw) => JSON.parse(raw) as Data)
      .catch(() => ({}));
    return loaded;
  }

  async function persist(data: Data) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(data));
    await rename(tmp, filePath);
  }

  function mutate(fn: (data: Data) => void): Promise<void> {
    const next = queue.then(async () => {
      const data = await load();
      fn(data);
      await persist(data);
    });
    queue = next.catch(() => {});
    return next;
  }

  return {
    all: async (): Promise<Data> => ({ ...(await load()) }),
    set: (key: string, value: string) =>
      mutate((data) => {
        data[key] = value;
      }),
    remove: (key: string) =>
      mutate((data) => {
        delete data[key];
      }),
  };
}
