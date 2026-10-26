import { execFile } from "node:child_process";

// プロンプトは stdin で渡す。argv に入れると - 始まりの質問がオプションとして解釈される
export function claudeArgs({
  sessionId,
  allowedTools,
  addDir,
  systemPrompt,
}: {
  sessionId?: string;
  allowedTools: string;
  addDir: string;
  systemPrompt: string;
}): string[] {
  // = でつなげて、- 始まりの値でもオプションとして解釈させない
  const args = ["-p", `--append-system-prompt=${systemPrompt}`];
  if (sessionId) {
    args.push("--resume", sessionId);
  }
  args.push("--output-format", "json", "--allowedTools", allowedTools, "--add-dir", addDir);
  return args;
}

export function execWithStdin(
  command: string,
  args: string[],
  input: string,
  options: { cwd?: string; timeout: number },
): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}\n${stderr}`));
        return;
      }
      resolve({ stdout });
    });
    child.stdin?.end(input);
  });
}
