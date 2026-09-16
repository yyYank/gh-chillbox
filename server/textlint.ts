import { createLinter, loadTextlintrc } from "textlint";
import { fileURLToPath } from "node:url";

export type Detection = {
  index: number;
  line: number;
  column: number;
  word: string;
  message: string;
};

type Linter = ReturnType<typeof createLinter>;

// 辞書（kuromoji）のロードが重いので、プロセスで1度だけ初期化して使い回す
let linterPromise: Promise<Linter> | null = null;

function getLinter(): Promise<Linter> {
  if (!linterPromise) {
    const configFilePath = fileURLToPath(new URL("../.textlintrc.json", import.meta.url));
    linterPromise = loadTextlintrc({ configFilePath }).then((descriptor) =>
      createLinter({ descriptor }),
    );
  }
  return linterPromise;
}

// メッセージ本文は `"効く" はAIが書いた文章で...` の形式なので、指摘語だけ取り出す
function extractWord(message: string): string {
  return message.match(/"([^"]+)"/)?.[1] ?? "";
}

export async function lintJa(text: string): Promise<Detection[]> {
  if (!text.trim()) return [];
  const linter = await getLinter();
  const result = await linter.lintText(text, "pr-body.md");
  return result.messages.map((m) => ({
    index: m.index,
    line: m.line,
    column: m.column,
    word: extractWord(m.message),
    message: m.message,
  }));
}
