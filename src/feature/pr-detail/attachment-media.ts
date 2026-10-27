// GitHub は mp3 や動画の添付を URL だけの行で書く。拡張子がないので種類は分からないが、
// <video> なら音声も動画も再生できるので、プロキシ経由のプレーヤーに置き換えてリンクも残す
const ATTACHMENT_LINK = /<a href="(https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]+)">\1<\/a>/g;

export function embedAttachmentMedia(html: string): string {
  return html.replace(ATTACHMENT_LINK, (link, url: string) => {
    const src = `/api/image-proxy?url=${encodeURIComponent(url)}`;
    return `<video controls preload="metadata" class="pr-attachment-media" src="${src}"></video><br>${link}`;
  });
}
