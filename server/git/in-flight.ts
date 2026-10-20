// 同じキーの処理が実行中なら新しく始めず、その結果を共有する
export function createInFlight<T>(): (key: string, task: () => Promise<T>) => Promise<T> {
  const running = new Map<string, Promise<T>>();

  return (key, task) => {
    const existing = running.get(key);
    if (existing) {
      return existing;
    }
    const promise = task().finally(() => running.delete(key));
    running.set(key, promise);
    return promise;
  };
}
