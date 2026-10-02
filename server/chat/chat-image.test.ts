import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { imagePromptParts, saveUploadedImage } from "./chat-image";

describe("saveUploadedImage", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-image-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("画像をアップロード先に保存し、その絶対パスを返す", () => {
    const saved = saveUploadedImage(dir, { type: "image/png", bytes: new Uint8Array([1, 2, 3]) });
    expect(path.dirname(saved)).toBe(dir);
    expect(saved.endsWith(".png")).toBe(true);
    expect(fs.readFileSync(saved)).toEqual(Buffer.from([1, 2, 3]));
  });

  it("アップロード先がなければ作成してから保存する", () => {
    const nested = path.join(dir, "upload-dir");
    const saved = saveUploadedImage(nested, { type: "image/jpeg", bytes: new Uint8Array([1]) });
    expect(fs.existsSync(saved)).toBe(true);
  });

  it("画像以外の形式は保存せずエラーにする", () => {
    expect(() => saveUploadedImage(dir, { type: "text/plain", bytes: new Uint8Array([1]) })).toThrow();
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe("imagePromptParts", () => {
  const dir = "/tmp/upload-dir";

  it("画像がなければ何も追加しない", () => {
    expect(imagePromptParts(dir, [])).toEqual([]);
  });

  it("アップロード先の画像パスを Read で読む指示つきで列挙する", () => {
    const parts = imagePromptParts(dir, ["/tmp/upload-dir/a.png"]);
    expect(parts[0]).toContain("添付画像");
    expect(parts).toContain("- /tmp/upload-dir/a.png");
  });

  it("アップロード先の外のパスは含めない", () => {
    expect(imagePromptParts(dir, ["/etc/passwd", "/tmp/upload-dir/../secret.png"])).toEqual([]);
  });
});
