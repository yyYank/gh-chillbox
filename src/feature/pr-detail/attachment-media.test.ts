import { describe, it, expect } from "vitest";
import { embedAttachmentMedia } from "./attachment-media";

const URL = "https://github.com/user-attachments/assets/5b1c6989-c044-4330-a512-126cff9310e2";

describe("embedAttachmentMedia", () => {
  it("URL がそのまま書かれた添付リンクを、プロキシ経由で再生できるプレーヤーに置き換えてリンクも残す", () => {
    expect(embedAttachmentMedia(`<p><a href="${URL}">${URL}</a></p>`)).toBe(
      `<p><video controls preload="metadata" class="pr-attachment-media" src="/api/image-proxy?url=${encodeURIComponent(URL)}"></video><br><a href="${URL}">${URL}</a></p>`,
    );
  });

  it("リンク文字が URL と違う添付リンクは置き換えない", () => {
    const html = `<a href="${URL}">音声</a>`;
    expect(embedAttachmentMedia(html)).toBe(html);
  });

  it("添付以外の URL は置き換えない", () => {
    const html = '<a href="https://example.com/a.mp3">https://example.com/a.mp3</a>';
    expect(embedAttachmentMedia(html)).toBe(html);
  });

  it("添付 URL の後ろに余計な文字が付いたリンクは置き換えない", () => {
    const evil = `${URL}?x=1`;
    const html = `<a href="${evil}">${evil}</a>`;
    expect(embedAttachmentMedia(html)).toBe(html);
  });
});
