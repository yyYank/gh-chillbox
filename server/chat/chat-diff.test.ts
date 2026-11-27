import { describe, expect, it, vi } from "vitest";
import { startDiffFetch } from "./chat-diff";

describe("startDiffFetch", () => {
  it("ファイル選択かつ diff 込みのときは、呼んだ時点で diff の取得を始める", async () => {
    const fetchDiff = vi.fn().mockResolvedValue("diff --git a/x b/x");
    const pending = startDiffFetch({ files: ["x"], includeDiff: true }, fetchDiff);
    // await する前に取得が始まっていれば、他の処理と並列に走る
    expect(fetchDiff).toHaveBeenCalledTimes(1);
    await expect(pending).resolves.toBe("diff --git a/x b/x");
  });

  it("diff を含めない指定なら取得しない", async () => {
    const fetchDiff = vi.fn();
    await expect(startDiffFetch({ files: ["x"], includeDiff: false }, fetchDiff)).resolves.toBeNull();
    expect(fetchDiff).not.toHaveBeenCalled();
  });

  it("diff 行スレッドや引用テキストの質問では、ファイル選択があっても取得しない", async () => {
    const fetchDiff = vi.fn();
    await startDiffFetch({ files: ["x"], includeDiff: true, quotedText: "引用" }, fetchDiff);
    await startDiffFetch({ files: ["x"], includeDiff: true, diffThread: { key: "k" } }, fetchDiff);
    expect(fetchDiff).not.toHaveBeenCalled();
  });

  it("ファイル選択が空なら取得しない", async () => {
    const fetchDiff = vi.fn();
    await startDiffFetch({ files: [], includeDiff: true }, fetchDiff);
    expect(fetchDiff).not.toHaveBeenCalled();
  });

  it("取得に失敗したら null にして、ファイル一覧だけで続行できるようにする", async () => {
    const fetchDiff = vi.fn().mockRejectedValue(new Error("gh failed"));
    await expect(startDiffFetch({ files: ["x"], includeDiff: true }, fetchDiff)).resolves.toBeNull();
  });
});
