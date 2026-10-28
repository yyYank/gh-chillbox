import DOMPurify from "dompurify";
import { marked } from "marked";

// PR 本文やコメント、AI の回答は他人が書いた文章なので、HTML として埋め込む前に必ず消毒する
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html);
}

export function renderMarkdown(markdown: string): string {
  return sanitizeHtml(marked.parse(markdown) as string);
}
