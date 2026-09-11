import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ status: "ok" }));

const PR_FIELDS =
  "number,title,author,reviewRequests,url,state,isDraft,createdAt,updatedAt";

app.get("/prs", async (c) => {
  const reviewer = c.req.query("reviewer");
  const repo = c.req.query("repo");

  const args = [
    "pr",
    "list",
    "--state",
    "open",
    "--json",
    PR_FIELDS,
    "--limit",
    "100",
  ];

  if (repo) {
    args.push("--repo", repo);
  }

  if (reviewer) {
    args.push("--search", `review-involves:${reviewer}`);
  }

  try {
    const { stdout } = await execFileAsync("gh", args);
    const prs = JSON.parse(stdout);
    return c.json(prs);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

app.get("/notifications", async (c) => {
  const repo = c.req.query("repo");
  if (!repo) return c.json({ error: "repo is required" }, 400);

  try {
    const since = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { stdout } = await execFileAsync("gh", [
      "api",
      `notifications?all=true&per_page=30&since=${since}`,
    ]);

    const raw = JSON.parse(stdout || "[]") as Array<{
      id: string;
      reason: string;
      updated_at: string;
      subject: {
        title: string;
        url: string;
        latest_comment_url: string | null;
        type: string;
      };
      repository: { full_name: string };
    }>;

    const filtered = raw.filter(
      (n) =>
        n.repository.full_name === repo && n.subject.type === "PullRequest",
    );

    const results = await Promise.all(
      filtered.slice(0, 20).map(async (n) => {
        const prNumber = parseInt(n.subject.url.split("/").pop()!, 10);
        let message = "";
        let actor = "";
        let url = `https://github.com/${repo}/pull/${prNumber}`;

        if (n.reason === "mention" && n.subject.latest_comment_url) {
          try {
            const commentUrl = n.subject.latest_comment_url.replace(
              "https://api.github.com/",
              "",
            );
            const { stdout: cStdout } = await execFileAsync("gh", [
              "api",
              commentUrl,
              "--jq",
              "{body: .body, login: .user.login, id: .id}",
            ]);
            const comment = JSON.parse(cStdout);
            message = (comment.body || "").slice(0, 200);
            actor = comment.login || "";
            if (comment.id) {
              url = `https://github.com/${repo}/pull/${prNumber}#issuecomment-${comment.id}`;
            }
          } catch {
            // ignore comment fetch errors
          }
        }

        let prState: "open" | "closed" | "merged" = "open";
        try {
          const { stdout: prStdout } = await execFileAsync("gh", [
            "pr", "view", String(prNumber), "--repo", repo, "--json", "state", "--jq", ".state",
          ]);
          const s = prStdout.trim().toUpperCase();
          if (s === "MERGED") prState = "merged";
          else if (s === "CLOSED") prState = "closed";
        } catch { /* default to open */ }

        return {
          id: n.id,
          type: n.reason,
          prNumber,
          prTitle: n.subject.title,
          message,
          actor,
          createdAt: n.updated_at,
          url,
          prState,
        };
      }),
    );

    return c.json(results);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

app.get("/image-proxy", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ error: "url is required" }, 400);

  const allowed =
    url.startsWith("https://user-images.githubusercontent.com/") ||
    url.startsWith("https://private-user-images.githubusercontent.com/") ||
    url.startsWith("https://github.com/user-attachments/assets/");
  if (!allowed) return c.json({ error: "url not allowed" }, 403);

  try {
    const { stdout: token } = await execFileAsync("gh", ["auth", "token"]);
    const res = await fetch(url, {
      headers: { Authorization: `token ${token.trim()}` },
      redirect: "follow",
    });
    if (!res.ok) return c.json({ error: `upstream ${res.status}` }, 502);

    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: message }, 502);
  }
});

app.get("/pr-detail", async (c) => {
  const repo = c.req.query("repo");
  const number = c.req.query("number");
  if (!repo || !number) {
    return c.json({ error: "repo and number are required" }, 400);
  }

  try {
    const { stdout } = await execFileAsync("gh", [
      "pr",
      "view",
      number,
      "--repo",
      repo,
      "--json",
      "number,title,body,files,comments",
    ]);
    const data = JSON.parse(stdout);
    return c.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

function filterDiffByFiles(fullDiff: string, files: string[]): string {
  const fileSet = new Set(files);
  const sections = fullDiff.split(/(?=^diff --git )/m);
  return sections
    .filter((section) => {
      const match = section.match(/^diff --git a\/(.+?) b\/(.+)/);
      if (!match) return false;
      return fileSet.has(match[1]) || fileSet.has(match[2]);
    })
    .join("");
}

app.get("/pr-diff", async (c) => {
  const repo = c.req.query("repo");
  const number = c.req.query("number");
  const filesParam = c.req.query("files");
  if (!repo || !number || !filesParam) {
    return c.json({ error: "repo, number, and files are required" }, 400);
  }

  const files = filesParam.split(",");
  try {
    const { stdout } = await execFileAsync("gh", [
      "pr", "diff", number, "--repo", repo,
    ]);
    const filtered = filterDiffByFiles(stdout, files);
    return c.json({ diff: filtered, charCount: filtered.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

const chatSessions = new Map<string, string>();

type ChatBody = {
  repo: string;
  prNumber: number;
  files?: string[];
  quotedText?: string;
  question: string;
  prTitle: string;
  prBody: string;
  includeDiff?: boolean;
};

async function buildContextParts(body: ChatBody): Promise<string[]> {
  const { repo, prNumber, files, quotedText, includeDiff } = body;
  const parts: string[] = [];

  if (quotedText) {
    parts.push(
      "## 引用テキスト（PR本文から選択）",
      `> ${quotedText.replace(/\n/g, "\n> ")}`,
    );
  } else if (files && files.length > 0) {
    const fileList = files.map((f) => `- ${f}`).join("\n");
    parts.push("## 質問対象の変更ファイル", fileList);

    if (includeDiff) {
      try {
        const { stdout } = await execFileAsync("gh", [
          "pr", "diff", String(prNumber), "--repo", repo,
        ]);
        const filtered = filterDiffByFiles(stdout, files);
        if (filtered) {
          parts.push("", "## 選択ファイルのdiff", "```diff", filtered, "```");
        }
      } catch { /* diff取得失敗時は無視してファイル一覧のみで続行 */ }
    }
  }

  return parts;
}

async function buildInitialPrompt(body: ChatBody): Promise<string> {
  const { repo, prNumber, question, prTitle, prBody } = body;
  const prUrl = `https://github.com/${repo}/pull/${prNumber}`;
  const parts = [
    `GitHub PR: ${prTitle} (${prUrl})`,
    `リポジトリ: ${repo}  PR #${prNumber}`,
    "",
    "## PR本文",
    prBody || "(なし)",
    "",
    ...await buildContextParts(body),
    "",
    "## 質問",
    question,
  ];
  return parts.join("\n");
}

async function buildFollowUpPrompt(body: ChatBody): Promise<string> {
  const { question } = body;
  const contextParts = await buildContextParts(body);

  if (contextParts.length === 0) {
    return question;
  }

  const parts = [
    ...contextParts,
    "",
    "## 質問",
    question,
  ];
  return parts.join("\n");
}

app.post("/chat/preview", async (c) => {
  const body = await c.req.json<ChatBody>();
  const { repo, prNumber, question } = body;
  if (!repo || !prNumber || !question) {
    return c.json({ error: "repo, prNumber, and question are required" }, 400);
  }

  const sessionKey = `${repo}:${prNumber}`;
  const hasSession = chatSessions.has(sessionKey);

  if (hasSession) {
    const prompt = await buildFollowUpPrompt(body);
    return c.json({ prompt, resumed: true });
  }

  const prompt = await buildInitialPrompt(body);
  return c.json({ prompt, resumed: false });
});

app.post("/chat", async (c) => {
  const body = await c.req.json<ChatBody>();

  const { repo, prNumber, question } = body;
  if (!repo || !prNumber || !question) {
    return c.json({ error: "repo, prNumber, and question are required" }, 400);
  }

  const sessionKey = `${repo}:${prNumber}`;
  const existingSessionId = chatSessions.get(sessionKey);

  const allowedTools = "Bash(gh pr view *),Bash(gh pr diff *),Bash(gh api repos/*/commits/*),Bash(gh api repos/*/compare/*),Bash(gh search *)";
  const args: string[] = ["-p"];

  if (existingSessionId) {
    const prompt = await buildFollowUpPrompt(body);
    args.push(prompt, "--resume", existingSessionId, "--output-format", "json", "--allowedTools", allowedTools);
  } else {
    const prompt = await buildInitialPrompt(body);
    args.push(prompt, "--output-format", "json", "--allowedTools", allowedTools);
  }

  try {
    const { stdout } = await execFileAsync("claude", args, {
      timeout: 120000,
    });
    const parsed = JSON.parse(stdout);
    if (!existingSessionId && parsed.session_id) {
      chatSessions.set(sessionKey, parsed.session_id);
    }
    return c.json({ answer: parsed.result ?? stdout.trim() });
  } catch (e) {
    console.error("[chat] claude -p failed:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

app.delete("/chat/session", async (c) => {
  const body = await c.req.json<{ repo: string; prNumber: number }>();
  const { repo, prNumber } = body;
  if (!repo || !prNumber) {
    return c.json({ error: "repo and prNumber are required" }, 400);
  }
  const sessionKey = `${repo}:${prNumber}`;
  chatSessions.delete(sessionKey);
  return c.json({ ok: true });
});

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
