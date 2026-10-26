import { describe, it, expect } from "vitest";
import { claudeArgs, execWithStdin } from "./claude-cli";

describe("claudeArgs", () => {
  it("引数にプロンプトを含めない（- 始まりの質問がオプション扱いされないように）", () => {
    expect(claudeArgs({ allowedTools: "Read", addDir: "/tmp/up" })).toEqual([
      "-p",
      "--output-format",
      "json",
      "--allowedTools",
      "Read",
      "--add-dir",
      "/tmp/up",
    ]);
  });

  it("セッション ID があれば --resume を付ける", () => {
    expect(claudeArgs({ sessionId: "abc", allowedTools: "Read", addDir: "/tmp/up" })).toEqual([
      "-p",
      "--resume",
      "abc",
      "--output-format",
      "json",
      "--allowedTools",
      "Read",
      "--add-dir",
      "/tmp/up",
    ]);
  });
});

describe("execWithStdin", () => {
  it("- 始まりや改行を含む入力をそのまま stdin に渡す", async () => {
    const input = "- patch は upstream で取り込む\n\n2053ってなに？";
    const { stdout } = await execWithStdin("cat", [], input, { timeout: 5000 });
    expect(stdout).toBe(input);
  });

  it("コマンドが失敗したら stderr を含むエラーで reject する", async () => {
    await expect(execWithStdin("sh", ["-c", "echo boom >&2; exit 1"], "", { timeout: 5000 })).rejects.toThrow("boom");
  });
});
