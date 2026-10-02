import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const UPLOAD_DIR = path.resolve(process.cwd(), "upload-dir");

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

export function saveUploadedImage(dir: string, image: { type: string; bytes: Uint8Array }): string {
  const ext = EXT_BY_TYPE[image.type];
  if (!ext) {
    throw new Error(`unsupported image type: ${image.type}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  const saved = path.join(dir, `${randomUUID()}${ext}`);
  fs.writeFileSync(saved, image.bytes);
  return saved;
}

// クライアントから任意のパスを読ませないよう、アップロード先配下のものだけを通す
export function imagePromptParts(dir: string, imagePaths: string[]): string[] {
  const root = path.resolve(dir);
  const inside = imagePaths.map((p) => path.resolve(p)).filter((p) => path.dirname(p) === root);
  if (inside.length === 0) {
    return [];
  }
  return ["## 添付画像（Readツールで読んで内容を確認する）", ...inside.map((p) => `- ${p}`)];
}
